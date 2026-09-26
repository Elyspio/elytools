import { LogModule } from "../log.module";
import path from "path";
import * as fs from "node:fs";
import type { LatestConfig, LocalConfig } from "@shared/config/app.config";
import { MainContextModule } from "../context/main.context.module";
import { ConfigMigrationModule, defaultAuthConfiguration, defaultLlmUsageConfiguration } from "./config.migration.module";
import { SecureStorageModule } from "../security/secure-storage.module";
import { log } from "../../utils/logs.utils";
import { inject, injectable } from "inversify";

@injectable()
export class ConfigModule extends LogModule {
	#configFilePath?: string;
	private configCache: LatestConfig | undefined;

	public constructor(
		@inject(MainContextModule) private readonly mainContextModule: MainContextModule,
		@inject(ConfigMigrationModule) private readonly configMigrationModule: ConfigMigrationModule,
		@inject(SecureStorageModule) private readonly secureStorageModule: SecureStorageModule
	) {
		super("ConfigModule");
		const configFolder = path.dirname(this.configFilePath);
		if (!fs.existsSync(configFolder)) {
			fs.mkdirSync(configFolder, { recursive: true });
		}
	}

	private get configFilePath() {
		return (this.#configFilePath ??= path.resolve(this.mainContextModule.appFolder, "config", "config.json"));
	}

	@log.debug(false)
	public async writeConfig(config: LatestConfig) {
		config = this.unbindUnknownAuthProfiles(config);
		this.configCache = config;
		await fs.promises.writeFile(this.configFilePath, JSON.stringify(config, null, 4));
	}

	@log.debug()
	public async getConfig(): Promise<LatestConfig> {
		if (this.configCache) {
			this.logger.debug("Returning cached config");
			return this.configCache;
		}

		if (!fs.existsSync(this.configFilePath)) {
			await this.writeConfig(await this.getDefaultConfig());
			return this.configCache!;
		}

		const parsedConfig = await this.tryParse();

		if (this.configMigrationModule.requireMigration(parsedConfig)) {
			const migrated = await this.configMigrationModule.migrate(parsedConfig);
			// The session of the single OIDC configuration (V2 to V5) belongs to no profile anymore.
			await this.secureStorageModule.deleteSecret("oidc-refresh-token");
			await this.writeConfig(migrated);
			return this.configCache!;
		}

		this.configCache = parsedConfig;

		return this.configCache;
	}

	public async regenerateConfig() {
		this.configCache = await this.getDefaultConfig();

		await this.writeConfig(this.configCache);

		return this.configCache;
	}

	/**
	 * A module bound to a deleted profile is left without profile.
	 */
	private unbindUnknownAuthProfiles(config: LatestConfig): LatestConfig {
		const known = (profileId: string | null) => (profileId && config.auth.profiles.some((profile) => profile.id === profileId) ? profileId : null);
		return {
			...config,
			endpoints: {
				...config.endpoints,
				qbittorrent: { ...config.endpoints.qbittorrent, authProfileId: known(config.endpoints.qbittorrent.authProfileId) },
			},
			llmUsage: { ...config.llmUsage, authProfileId: known(config.llmUsage.authProfileId) },
		};
	}

	/**
	 * Si on n'arrive pas à parser la config, on la reset par sa valeur par défaut
	 * @private
	 */
	@log.debug()
	private async tryParse() {
		try {
			return JSON.parse(await fs.promises.readFile(this.configFilePath, "utf-8")) as LocalConfig;
		} catch (e) {
			this.logger.error("Failed to parse config", e);
			return this.getDefaultConfig();
		}
	}

	@log.debug()
	private async getDefaultConfig(): Promise<LatestConfig> {
		return {
			version: 6,
			windows: { position: {} },
			appboard: { show: [] },
			frame: {
				show: {
					resourceUtilization: false,
				},
				resize: {
					height: true,
					width: true,
				},
			},
			endpoints: {
				homeAssistant: "https://ha.elyspio.fr",
				api: "",
				hubs: {
					screenshare: "",
				},
				qbittorrent: {
					apiBaseUrl: "",
					authProfileId: null,
				},
			},
			auth: defaultAuthConfiguration(),
			ssh: {
				machines: [],
				folders: [],
			},
			llmUsage: defaultLlmUsageConfiguration(),
		};
	}
}
