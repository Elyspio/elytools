import { join } from "node:path";
import { app, BrowserWindow, type KeyboardEvent, Menu, Tray } from "electron";
import { MainContextModule } from "./context/main.context.module";
import { LogModule } from "./log.module";
import { mainConfig } from "@shared/config/main.config";
import { log } from "../utils/logs.utils";
import { inject, injectable } from "inversify";
import { LlmUsageModule } from "@main/modules/llm-usage/llm-usage.module";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";

@injectable()
export class TrayIconModule extends LogModule {
	private tray: Tray | null = null;

	constructor(
		@inject(MainContextModule) private readonly mainContextModule: MainContextModule,
		@inject(LlmUsageModule) private readonly llmUsageModule: LlmUsageModule
	) {
		super("TrayIconModule");
	}

	@log.debug(false)
	createTrayIcon(mainWindow: BrowserWindow) {
		const iconPath = join(this.mainContextModule.resourcesFolder, "icon.png");

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
				label: "Envoyer l'usage LLM",
				type: "normal",
				click: () => {
					void this.llmUsageModule.sync();
				},
			},
			{ type: "separator" },
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
		this.llmUsageModule.onStatusChange((status) => this.tray?.setToolTip(this.tooltip(status)));

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

	/** « Elytools · usage LLM envoyé à 14:32 », or the last error. */
	private tooltip(status: LlmUsageStatus) {
		if (!status.enabled) return mainConfig.names.public;
		if (status.running) return `${mainConfig.names.public} · envoi de l'usage LLM…`;
		if (status.lastError) return `${mainConfig.names.public} · usage LLM en échec : ${status.lastError}`.slice(0, 127);
		if (status.lastSuccessAt) {
			const time = new Date(status.lastSuccessAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
			return `${mainConfig.names.public} · usage LLM envoyé à ${time}`;
		}
		return mainConfig.names.public;
	}
}
