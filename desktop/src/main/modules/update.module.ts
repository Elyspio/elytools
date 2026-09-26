import { LogModule } from "./log.module";
import { autoUpdater, type AppUpdater, type UpdateInfo } from "electron-updater";
import { mainConfig } from "@shared/config/main.config";
import type { UpdateStatus } from "@shared/types/update.types";
import { IpcModule } from "./ipc.module";
import { log } from "../utils/logs.utils";
import { inject, injectable, LazyServiceIdentifier } from "inversify";
import { app } from "electron";

@injectable()
export class UpdateModule extends LogModule {
	private readonly autoUpdater: AppUpdater;
	private checkTimeout: NodeJS.Timeout | undefined;
	private status: UpdateStatus = {
		state: "idle",
		currentVersion: app.getVersion(),
		latestVersion: null,
		releaseDate: null,
		releaseNotes: null,
		progress: null,
		lastCheckAt: null,
		nextCheckAt: null,
		error: null,
		isPackaged: app.isPackaged,
	};

	public constructor(@inject(new LazyServiceIdentifier(() => IpcModule)) private readonly ipcModule: IpcModule) {
		super("UpdateModule");
		this.autoUpdater = autoUpdater;
		this.autoUpdater.autoDownload = false;
		this.autoUpdater.autoInstallOnAppQuit = false;
		this.autoUpdater.logger = this.logger;
		if (!app.isPackaged) {
			this.autoUpdater.forceDevUpdateConfig = true;
			this.logger.info("Using dev-app-update.yml for update checks");
		}

		this.autoUpdater.on("checking-for-update", () => {
			this.logger.debug("Checking for update");
			this.setStatus({ state: "checking", error: null });
		});

		this.autoUpdater.on("update-available", (info) => {
			this.setStatus({ state: "available", ...this.fromInfo(info) });
		});

		this.autoUpdater.on("update-not-available", (info) => {
			this.logger.info("Current version is up to date", info.version);
			this.setStatus({ state: "up-to-date", ...this.fromInfo(info) });
		});

		this.autoUpdater.on("download-progress", (progress) => {
			this.setStatus({ state: "downloading", progress: progress.percent });
		});

		this.autoUpdater.on("update-downloaded", (info) => {
			this.setStatus({ state: "downloaded", progress: 100, ...this.fromInfo(info) });
		});

		this.autoUpdater.on("error", (err, msg) => {
			this.logger.error(`An error occurred during update ${msg}`, err);
			this.setStatus({ state: "error", progress: null, error: err.message });
		});
	}

	public getStatus(): UpdateStatus {
		return this.status;
	}

	/**
	 * Checks GitHub for a new release, then again every {@link mainConfig.autoUpdate.checkDelay} minutes
	 */
	@log.debug()
	public async checkForUpdates() {
		// A download in progress or ready to install must not be replaced by a new check
		if (this.status.state === "checking" || this.status.state === "downloading" || this.status.state === "downloaded") {
			return;
		}

		this.logger.info("Checking for updates");

		try {
			const result = await this.autoUpdater.checkForUpdates();
			this.logger.info("Server version: ", result?.updateInfo.version);
			// Development builds without dev-app-update.yml resolve without any event
			if (!result && this.getStatus().state === "checking") this.setStatus({ state: "idle" });
		} catch (e) {
			this.logger.error("An error occurred while checking for updates", e);
			this.setStatus({ state: "error", error: (e as Error).message });
		} finally {
			if (this.checkTimeout) clearTimeout(this.checkTimeout);
			const delay = mainConfig.autoUpdate.checkDelay * 60 * 1000;
			this.checkTimeout = setTimeout(() => void this.checkForUpdates(), delay);
			this.setStatus({ lastCheckAt: new Date().toISOString(), nextCheckAt: new Date(Date.now() + delay).toISOString() });
		}
	}

	@log.debug()
	public quitAndInstall() {
		this.logger.info("Quitting and installing update");

		this.autoUpdater.quitAndInstall(false, true);
	}

	@log.debug()
	async downloadUpdate() {
		this.logger.info("Downloading update");

		this.setStatus({ state: "downloading", progress: 0, error: null });
		try {
			await this.autoUpdater.downloadUpdate();
		} catch (e) {
			this.setStatus({ state: "error", progress: null, error: (e as Error).message });
			throw e;
		}
	}

	private fromInfo(info: UpdateInfo): Pick<UpdateStatus, "latestVersion" | "releaseDate" | "releaseNotes"> {
		const notes = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((note) => note.note ?? "").join("\n") : info.releaseNotes;
		return {
			latestVersion: info.version,
			releaseDate: info.releaseDate ?? null,
			releaseNotes: notes?.trim() || null,
		};
	}

	private setStatus(patch: Partial<UpdateStatus>) {
		this.status = { ...this.status, ...patch };
		this.ipcModule.sendIpcToMainContent("update:status", this.status);
	}
}
