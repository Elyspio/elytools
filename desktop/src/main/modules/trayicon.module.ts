import { join } from "node:path";
import { app, BrowserWindow, type KeyboardEvent, Menu, Tray } from "electron";
import { getPreloadConfig } from "@preload/parts/preload.config";
import { MainContextModule } from "./context/main.context.module";
import { LogModule } from "./log.module";
import { mainConfig } from "@shared/config/main.config";
import { log } from "../utils/logs.utils";
import { inject, injectable } from "inversify";

@injectable()
export class TrayIconModule extends LogModule {
	private tray: Tray | null = null;

	constructor(@inject(MainContextModule) private readonly mainContextModule: MainContextModule) {
		super("TrayIconModule");
	}

	@log.debug(false)
	createTrayIcon(mainWindow: BrowserWindow) {
		const iconPath = join(this.mainContextModule.resourcesFolder, `/img/${getPreloadConfig().region}/icon_disconnected.png`);

		this.logger.debug("Creating tray icon", { iconPath });

		this.tray = new Tray(iconPath);
		const contextMenu = Menu.buildFromTemplate([
			{
				label: "Ouvrir",
				type: "normal",
				click: () => {
					if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) {
						mainWindow.focus();
					} else {
						mainWindow.show();
					}
				},
			},
			{
				label: "Quitter",
				type: "normal",
				click: () => {
					app.exit(0);
				},
			},
		]);
		this.tray.setContextMenu(contextMenu);

		this.tray.setToolTip(mainConfig.names.public);

		this.tray.on("click", (e) => {
			this.showOrHideMainWindow(e);
		});
		this.tray.on("double-click", (e) => {
			this.showOrHideMainWindow(e);
		});
	}

	@log.debug()
	showOrHideMainWindow(e: KeyboardEvent) {
		const mainWindow = BrowserWindow.fromId(1)!;
		if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return mainWindow.hide();
		if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) return mainWindow.hide();
		mainWindow.show();
	}
}
