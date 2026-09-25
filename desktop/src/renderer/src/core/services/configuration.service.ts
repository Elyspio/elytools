import { injectable } from "inversify";
import { LatestConfig } from "@shared/config/app.config";

@injectable()
export class ConfigurationService {
	public async get(): Promise<LatestConfig> {
		return window.preload.ipc.send.config.local.get();
	}

	public set(config: LatestConfig) {
		return window.preload.ipc.send.config.local.set(config);
	}

	public async regenerate() {
		await window.preload.ipc.send.config.local.regenerate();
	}
}
