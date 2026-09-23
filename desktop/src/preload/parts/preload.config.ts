import { mainConfig } from "@shared/config/main.config";

export function getPreloadConfig() {
	return {
		appName: mainConfig.names.public,
		protocol: mainConfig.names.protocol,
		region: mainConfig.names.client,
		frameColor: mainConfig.colors.frame,
		platform: process.platform,
		arch: process.arch,
	};
}

export type PreloadExposedConfig = ReturnType<typeof getPreloadConfig>;
