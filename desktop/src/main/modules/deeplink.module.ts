import { app } from "electron";
import { mainConfig } from "@shared/config/main.config";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { LogModule } from "./log.module";
import { IpcModule } from "./ipc.module";
import { log } from "../utils/logs.utils";
import { WindowModule } from "./window/window.module";
import { OidcModule } from "@main/modules/auth/oidc.module";
import { inject, injectable } from "inversify";

@injectable()
export class DeeplinkModule extends LogModule {
	public constructor(
		@inject(WindowModule) private readonly windowModule: WindowModule,
		@inject(IpcModule) private readonly ipcModule: IpcModule,
		@inject(OidcModule) private readonly oidcModule: OidcModule
	) {
		super("DeeplinkModule");
	}

	@log.debug()
	public register() {
		let ableToRegister = false;
		if (process.defaultApp) {
			if (process.argv.length >= 2) {
				ableToRegister = app.setAsDefaultProtocolClient(mainConfig.names.protocol, process.execPath, [path.resolve(process.argv[1])]);
			}
		} else {
			ableToRegister = app.setAsDefaultProtocolClient(mainConfig.names.protocol);
		}
		this.logger.info("Registering deeplink", mainConfig.names.protocol, { ableToRegister });

		if (platform.isWindows) {
			app.on("second-instance", (_, commandLine, workingDirectory) => {
				this.logger.info("second-instance", commandLine, workingDirectory);
				// Someone tried to run a second instance, we should focus our window.
				this.windowModule.focusMainWindow();
				this.handle(commandLine.pop()!);
			});
		}

		if (platform.isMacOS) {
			app.on("open-url", (event, url) => {
				event.preventDefault();
				this.handle(url);
			});
		}
	}

	@log.debug()
	private handle(url: string) {
		void this.routeDeeplink(url);
	}

	private async routeDeeplink(url: string) {
		this.logger.info("handle deeplink");
		const handled = await this.oidcModule.tryHandleRedirect(url);
		if (handled) {
			return;
		}

		this.ipcModule.sendIpcToMainContent("app:deeplink:handle", url);
	}
}
