import { LogModule } from "./log.module";
import { autoUpdater, type AppUpdater } from "electron-updater";
import { mainConfig } from "@shared/config/main.config";
import { IpcModule } from "./ipc.module";
import { log } from "../utils/logs.utils";
import { inject, injectable, LazyServiceIdentifier } from "inversify";
import { app } from "electron";

@injectable()
export class UpdateModule extends LogModule {
	private readonly autoUpdater: AppUpdater;
	private checkTimeout: NodeJS.Timeout | undefined;

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

		this.autoUpdater.on("update-available", (info) => {
			this.ipcModule.sendIpcToMainContent("update:available", info.version);
		});

		this.autoUpdater.on("download-progress", (progress) => {
			this.ipcModule.sendIpcToMainContent("update:download:progress", progress.percent);
		});

		this.autoUpdater.on("update-downloaded", () => {
			this.ipcModule.sendIpcToMainContent("update:download:end");
		});

		this.autoUpdater.on("error", (err, msg) => {
			this.logger.error(`An error occurred during update ${msg}`, err);
		});

		this.autoUpdater.on("checking-for-update", () => {
			this.logger.debug("Checking for update");
		});

		this.autoUpdater.on("update-not-available", (info) => {
			this.logger.debug("No update available");
			this.logger.info("Current version is up to date", info.version);
		});
	}

	@log.debug()
	public async checkForUpdates() {
		this.logger.info("Checking for updates");

		try {
			const result = await this.autoUpdater.checkForUpdates();
			this.logger.info("Server version: ", result?.updateInfo.version);
		} catch (e) {
			this.logger.error("An error occurred while checking for updates", e);
		} finally {
			if (this.checkTimeout) clearTimeout(this.checkTimeout);
			this.checkTimeout = setTimeout(() => this.checkForUpdates(), mainConfig.autoUpdate.checkDelay * 60 * 1000);
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

		await this.autoUpdater.downloadUpdate();
	}
}
