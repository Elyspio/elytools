import { is } from "@electron-toolkit/utils";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { LogModule } from "../log.module";
import { MainContextModule } from "../context/main.context.module";
import { log } from "../../utils/logs.utils";
import { WindowPositionModule } from "./window.position.module";
import { mainConfig } from "@shared/config/main.config";
import { inject, injectable } from "inversify";

@injectable()
export class WindowModule extends LogModule {
	public constructor(
		@inject(WindowPositionModule) private readonly windowPositionModule: WindowPositionModule,
		@inject(MainContextModule) private readonly mainContextModule: MainContextModule
	) {
		super("WindowModule");
	}

	@log.debug(false)
	async loadMainWindow(mainWindow?: BrowserWindow) {
		mainWindow ??= this.getMainWindow();
		this.logger.info("Loading main window", mainWindow.id);

		// HMR for renderer base on electron-vite cli.
		// Load the remote URL for development or the local html file for production.
		if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
			await mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
		} else {
			this.logger.info("Loading main window from file", { __dirname });
			await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
		}
	}

	@log.debug()
	async createMainWindow() {
		const mainWindow = new BrowserWindow({
			...(await this.windowPositionModule.get("main")),
			minHeight: 668,
			minWidth: 800,
			show: false,
			frame: false,
			title: mainConfig.names.public,
			autoHideMenuBar: true,
			webPreferences: {
				nodeIntegrationInSubFrames: false,
				preload: join(__dirname, "../preload/index.js"),
				devTools: this.mainContextModule.allowDebug,
				spellcheck: true,
			},
		});

		mainWindow.webContents.setWindowOpenHandler((details) => {
			shell.openExternal(details.url);
			return { action: "deny" };
		});

		await this.loadMainWindow(mainWindow);
		// this.trayIconModule.createTrayIcon(mainWindow);

		mainWindow.on("close", () => {
			this.windowPositionModule.setByWindow(mainWindow);
		});

		mainWindow.show();

		return mainWindow;
	}

	@log.debug()
	focusMainWindow() {
		const mainWindow = this.getMainWindow();

		if (!mainWindow.isVisible() || mainWindow.isMinimized()) {
			mainWindow.show();
		}

		//Fonctionne que pour mac
		mainWindow.focus();

		//Pour windows. Voir https://stackoverflow.com/questions/70925355/why-does-win-focus-not-bring-the-window-to-the-front
		mainWindow.setAlwaysOnTop(true);
		app.focus();
		mainWindow.setAlwaysOnTop(false);
	}

	getMainWindow() {
		return BrowserWindow.fromId(1)!;
	}
}
