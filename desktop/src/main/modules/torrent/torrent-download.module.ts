import { dialog } from "electron";
import { inject, injectable } from "inversify";
import fs from "node:fs";
import path from "node:path";
import { ConfigModule } from "@main/modules/config/config.module";
import { WindowModule } from "@main/modules/window/window.module";
import { LogModule } from "@main/modules/log.module";
import { log } from "@main/utils/logs.utils";
import type { NyaaTorrentItem, TorrentDownloadResult } from "@shared/types/torrent.types";

const MAGNETS_FILE = "magnets.txt";
/** Below the 255 characters of most file systems, the extension included */
const MAX_FILE_NAME_LENGTH = 200;

/**
 * Writes the .torrent files of a group of torrents (the episodes of a season) to a folder chosen by the user
 */
@injectable()
export class TorrentDownloadModule extends LogModule {
	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(WindowModule) private readonly windowModule: WindowModule
	) {
		super("TorrentDownloadModule");
	}

	/**
	 * Asks for a folder, then downloads every .torrent file into it. Magnet links cannot become a file: they are listed in magnets.txt.
	 */
	@log()
	public async downloadFiles(items: Pick<NyaaTorrentItem, "title" | "torrentUrl">[]): Promise<TorrentDownloadResult> {
		const folder = await this.pickFolder();
		if (!folder) {
			return { canceled: true, folder: null, downloaded: 0, magnets: 0, failures: [] };
		}

		const magnets = items.filter((item) => item.torrentUrl.startsWith("magnet:"));
		const files = items.filter((item) => /^https?:\/\//.test(item.torrentUrl));
		const failures: TorrentDownloadResult["failures"] = [];

		// One at a time: nyaa.si rate limits the downloads
		for (const item of files) {
			try {
				const res = await fetch(item.torrentUrl);
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				await fs.promises.writeFile(path.join(folder, `${this.toFileName(item.title)}.torrent`), new Uint8Array(await res.arrayBuffer()));
			} catch (error) {
				this.logger.error("Failed to download torrent file", { title: item.title, url: item.torrentUrl, error });
				failures.push({ title: item.title, error: (error as Error).message });
			}
		}

		if (magnets.length > 0) {
			const content = magnets.map((item) => `# ${item.title}\n${item.torrentUrl}\n`).join("\n");
			await fs.promises.writeFile(path.join(folder, MAGNETS_FILE), content, "utf-8");
		}

		return {
			canceled: false,
			folder,
			downloaded: files.length - failures.length,
			magnets: magnets.length,
			failures,
		};
	}

	/**
	 * Folder picked by the user, starting from the last one used (remembered in the configuration)
	 */
	private async pickFolder(): Promise<string | null> {
		const config = await this.configModule.getConfig();
		const options: Electron.OpenDialogOptions = {
			title: "Download the .torrent files to",
			defaultPath: config.torrent.lastDownloadFolder ?? undefined,
			properties: ["openDirectory", "createDirectory"],
		};
		const window = this.windowModule.getMainWindow();
		const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
		const folder = result.canceled ? null : (result.filePaths[0] ?? null);

		if (folder && folder !== config.torrent.lastDownloadFolder) {
			const latest = await this.configModule.getConfig();
			await this.configModule.writeConfig({ ...latest, torrent: { ...latest.torrent, lastDownloadFolder: folder } });
		}

		return folder;
	}

	/**
	 * Title usable as a file name on Windows and Linux
	 */
	private toFileName(title: string): string {
		const name = title
			// eslint-disable-next-line no-control-regex
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
			.replace(/[. ]+$/, "")
			.trim()
			.slice(0, MAX_FILE_NAME_LENGTH);
		return name || "torrent";
	}
}
