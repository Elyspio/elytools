import { inject, injectable } from "inversify";
import { ConfigModule } from "@main/modules/config/config.module";
import { OidcModule } from "@main/modules/auth/oidc.module";
import { log } from "@main/utils/logs.utils";
import { LogModule } from "@main/modules/log.module";
import type { TorrentAddResult } from "@shared/types/torrent.types";

@injectable()
export class QBittorrentModule extends LogModule {
	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(OidcModule) private readonly oidcModule: OidcModule
	) {
		super("QBittorrentModule");
	}

	@log()
	public async getExistingHashes(): Promise<string[]> {
		const config = await this.configModule.getConfig();
		const token = await this.oidcModule.getAccessToken(config.endpoints.qbittorrent.authProfileId, "torrent");
		const apiBaseUrl = config.endpoints.qbittorrent.apiBaseUrl.trim();

		if (!apiBaseUrl) {
			throw new Error("qBittorrent API base URL is not configured");
		}

		const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/api/v2/torrents/info`;
		const response = await fetch(endpoint, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch torrents list (${response.status})`);
		}

		const torrents = (await response.json()) as { hash: string }[];
		return torrents.map((t) => t.hash.toLowerCase());
	}

	@log()
	public async addTorrentFromUrl(torrentUrl: string, infoHash?: string): Promise<TorrentAddResult> {
		const config = await this.configModule.getConfig();
		const token = await this.oidcModule.getAccessToken(config.endpoints.qbittorrent.authProfileId, "torrent");
		const apiBaseUrl = config.endpoints.qbittorrent.apiBaseUrl.trim();

		if (!apiBaseUrl) {
			throw new Error("qBittorrent API base URL is not configured");
		}

		if (infoHash) {
			const existingHashes = await this.getExistingHashes();
			if (existingHashes.includes(infoHash.toLowerCase())) {
				this.logger.debug("Torrent already exists in qBittorrent", { infoHash });
				return {
					success: false,
					duplicate: true,
					message: "Torrent already exists in qBittorrent",
				};
			}
		}

		const torrentResponse = await fetch(torrentUrl);

		if (!torrentResponse.ok) {
			throw new Error(`Failed to download torrent file (${torrentResponse.status})`);
		}

		const torrentBuffer = new Uint8Array(await torrentResponse.arrayBuffer());

		const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/api/v2/torrents/add`;
		const formData = new FormData();
		formData.append("torrents", new Blob([torrentBuffer]), "download.torrent");
		formData.append("firstLastPiecePrio", "true");

		const addResponse = await fetch(endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: formData,
		});

		this.logger.debug("Torrent added to qBittorrent", { addResponse });

		if (!addResponse.ok) {
			const body = await addResponse.text();
			throw new Error(`Failed to add torrent (${addResponse.status}): ${body.slice(0, 250)}`);
		}

		return { success: true };
	}
}
