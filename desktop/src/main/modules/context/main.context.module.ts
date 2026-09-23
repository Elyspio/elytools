import path from "node:path";
import os from "os";
import fs from "fs";
import { mainConfig } from "@shared/config/main.config";
import { is } from "@electron-toolkit/utils";
import { app } from "electron";
import { injectable } from "inversify";

@injectable()
export class MainContextModule {
	#appFolder: string = "";
	#resourcesFolder: string = "";

	public constructor() {}

	/**
	 * Renvoie le dossier de l'application dans le dossier de l'utilisateur
	 */
	public get appFolder() {
		if (this.#appFolder) return this.#appFolder;

		let localappdata = process.env.REPERTOIREMONSISRA || process.env.LOCALAPPDATA || path.resolve(process.env.HOME!, "Library/Application Support");
		if (localappdata.startsWith(String.raw`C:\Windows\system32\config\systemprofile`)) {
			localappdata = localappdata.replace(String.raw`C:\Windows\system32\config\systemprofile`, os.userInfo().homedir);
		}
		this.#appFolder = path.resolve(localappdata, mainConfig.names.folder);

		if (!fs.existsSync(this.#appFolder)) fs.mkdirSync(this.#appFolder, { recursive: true });

		return this.#appFolder;
	}

	/**
	 * Renvoie le dossier des ressources de l'application (./resources ou ./resources/app.asar.unpacked/resources)
	 */
	public get resourcesFolder() {
		if (this.#resourcesFolder) return this.#resourcesFolder;

		this.#resourcesFolder = path.resolve(app.getAppPath(), "resources");

		if (this.env === "production") {
			this.#resourcesFolder = path.resolve(app.getAppPath(), "..", "app.asar.unpacked", "resources");
		}

		return this.#resourcesFolder;
	}

	/**
	 * Renvoie l'environnement de l'application
	 */
	public get env() {
		switch (process.env.NODE_ENV?.toLowerCase()) {
			case "test":
				return "test";
			case "development":
				return "development";
			default:
				return "production";
		}
	}

	public get allowDebug() {
		const envFlag = process.env.ELYTOOLS_DEBUG;
		const cliFlag = app.commandLine.hasSwitch("debug") || app.commandLine.hasSwitch("devtools");
		const envEnabled = envFlag === "1" || envFlag?.toLowerCase() === "true";
		return is.dev || envEnabled || cliFlag;
	}

	public get autoOpenDevTools() {
		const envFlag = process.env.ELYTOOLS_DEVTOOLS_AUTOOPEN;
		const cliFlag = app.commandLine.hasSwitch("devtools-auto-open");
		const envEnabled = envFlag === "1" || envFlag?.toLowerCase() === "true";
		return this.allowDebug && (is.dev || envEnabled || cliFlag);
	}
}
