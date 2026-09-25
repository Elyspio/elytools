import { LogModule } from "./log.module";
import type { SkipFirst } from "@preload/parts/preload.ipc.wrapper";
import type { WebContents } from "electron";
import { IpcSentEvents } from "@shared/ipc/ipc.sent.events";
import { log } from "../utils/logs.utils";
import { WindowModule } from "@main/modules/window/window.module";
import { inject, injectable, LazyServiceIdentifier } from "inversify";

@injectable()
export class IpcModule extends LogModule {
	public constructor(
		@inject(new LazyServiceIdentifier(() => WindowModule))
		private readonly windowModule: WindowModule
	) {
		super("IpcModule");
	}

	/**
	 * Envoie un message IPC à un contenu web
	 * @param content contenu web à qui envoyer le message
	 * @param channel nom de l'événement
	 * @param args arguments à envoyer suivi d'un booléen pour activer les logs
	 */
	@log.debug((content: WebContents, channel: string) => `${content.id} on ${channel}`)
	public sendIpcToWebContent<Channel extends keyof IpcSentEvents>(content: WebContents, channel: Channel, ...args: SkipFirst<Parameters<IpcSentEvents[Channel]>>) {
		this.logger.debug("Sending IPC to web content", content.id, channel, ...args);
		content.send(channel, ...args);
	}

	public sendIpcToMainContent<Channel extends keyof IpcSentEvents>(channel: Channel, ...args: SkipFirst<Parameters<IpcSentEvents[Channel]>>) {
		const content = this.windowModule.getMainWindow()?.webContents;
		if (!content) {
			setTimeout(() => {
				this.sendIpcToMainContent(channel, ...args);
			}, 100);
			this.logger.info("Main content not ready, retrying in 100ms", channel, ...args);
			return;
		}
		this.sendIpcToWebContent(content, channel, ...args);
	}

	public setupIpcListeners() {
		const mainWindow = this.windowModule.getMainWindow();
		mainWindow.on("maximize", () => {
			this.sendIpcToWebContent(mainWindow.webContents, "app:screen:toggle-full-screen", true);
		});

		mainWindow.on("unmaximize", () => {
			this.sendIpcToWebContent(mainWindow.webContents, "app:screen:toggle-full-screen", false);
		});
	}
}
