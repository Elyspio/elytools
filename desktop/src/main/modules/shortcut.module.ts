import { app, globalShortcut } from "electron";
import { LogModule } from "./log.module";
import { log } from "../utils/logs.utils";
import { WindowModule } from "@main/modules/window/window.module";
import { inject, injectable } from "inversify";

@injectable()
export class ShortcutModule extends LogModule {
	constructor(@inject(WindowModule) private readonly windowModule: WindowModule) {
		super("ShortcutModule");
	}

	/**
	 * Modification des raccourcis clavier reçu par l'application
	 */
	@log.debug()
	registerShortcut() {
		// On force le refresh à relancer l'application depuis pour éviter les problèmes de cache du JWT
		app.on("browser-window-focus", () => {
			globalShortcut.register("CommandOrControl+R", async () => {
				this.logger.log("CommandOrControl+R is pressed refresh the page");
				await this.windowModule.loadMainWindow();
			});
		});

		app.on("browser-window-blur", function () {
			globalShortcut.unregister("CommandOrControl+R");
		});
	}
}
