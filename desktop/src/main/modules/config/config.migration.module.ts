import os from "node:os";
import { configGuards } from "./config.guards";
import { LogModule } from "../log.module";
import type {
	AuthConfiguration,
	LatestConfig,
	LlmUsageConfiguration,
	LocalConfig,
	LocalConfigV1,
	LocalConfigV2,
	LocalConfigV3,
	LocalConfigV4,
	LocalConfigV5,
} from "@shared/config/app.config";
import { log } from "../../utils/logs.utils";

/**
 * Upload enabled towards the production monitor, under the host name of the workstation.
 */
export function defaultLlmUsageConfiguration(): LatestConfig["llmUsage"] {
	return {
		...defaultLlmUsageConfigurationV5(),
		authProfileId: null,
	};
}

export function defaultAuthConfiguration(): AuthConfiguration {
	return {
		redirectPath: "auth/callback",
		profiles: [],
	};
}

function defaultLlmUsageConfigurationV5(): LlmUsageConfiguration {
	return {
		enabled: true,
		apiBaseUrl: "https://monitor.llm.elyspio.fr",
		machineName: os.hostname(),
	};
}

/**
 * Module de migration de la configuration local
 */
export class ConfigMigrationModule extends LogModule {
	public constructor() {
		super("ConfigMigrationModule");
	}

	/**
	 * Migre la configuration locale vers la dernière version
	 * @param conf
	 */
	@log.debug()
	public async migrate(conf: LocalConfig): Promise<LatestConfig> {
		this.logger.info("Starting migration of local config");
		if (configGuards.is.v6(conf)) {
			return conf;
		}

		// The single OIDC configuration is dropped: profiles are created again, one per realm.
		const v5 = this.toV5(conf);
		const { homeAssistant, api, hubs, qbittorrent } = v5.endpoints;
		return {
			...v5,
			version: 6,
			auth: defaultAuthConfiguration(),
			endpoints: {
				homeAssistant,
				api,
				hubs,
				qbittorrent: { ...qbittorrent, authProfileId: null },
			},
			llmUsage: { ...v5.llmUsage, authProfileId: null },
		};
	}

	/**
	 * Indique si la configuration locale nécessite une migration
	 * @param conf
	 */
	@log.debug((conf: LocalConfig) => `version=${conf.version}`)
	public requireMigration(conf: LocalConfig): conf is LocalConfigV1 | LocalConfigV2 | LocalConfigV3 | LocalConfigV4 | LocalConfigV5 {
		return !configGuards.is.v6(conf);
	}

	private toV5(conf: LocalConfigV1 | LocalConfigV2 | LocalConfigV3 | LocalConfigV4 | LocalConfigV5): LocalConfigV5 {
		if (configGuards.is.v5(conf)) {
			return conf;
		}

		return {
			...this.toV4(conf),
			version: 5,
			llmUsage: defaultLlmUsageConfigurationV5(),
		};
	}

	private toV4(conf: LocalConfigV1 | LocalConfigV2 | LocalConfigV3 | LocalConfigV4): LocalConfigV4 {
		if (configGuards.is.v4(conf)) {
			return conf;
		}

		if (configGuards.is.v3(conf)) {
			return {
				...conf,
				version: 4,
				ssh: {
					machines: conf.ssh.machines,
					folders: conf.ssh.folders ?? [],
				},
			};
		}

		if (configGuards.is.v2(conf)) {
			return {
				...conf,
				version: 4,
				ssh: {
					machines: [],
					folders: [],
				},
			};
		}

		const endpoints = conf.endpoints;

		return {
			...conf,
			version: 4,
			endpoints: {
				homeAssistant: endpoints.homeAssistant,
				api: endpoints.api,
				hubs: {
					screenshare: endpoints.hubs?.screenshare ?? "",
				},
				qbittorrent: {
					apiBaseUrl: "",
				},
				oidc: {
					issuerUrl: "",
					clientId: "",
					clientSecret: "",
					scopes: "openid profile offline_access",
					redirectPath: "auth/callback",
				},
			},
			ssh: {
				machines: [],
				folders: [],
			},
		};
	}
}
