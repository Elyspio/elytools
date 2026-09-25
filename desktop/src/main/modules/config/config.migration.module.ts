import { configGuards } from "./config.guards";
import { LogModule } from "../log.module";
import type { LatestConfig, LocalConfig, LocalConfigV1, LocalConfigV2, LocalConfigV3 } from "@shared/config/app.config";
import { log } from "../../utils/logs.utils";

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

	/**
	 * Indique si la configuration locale nécessite une migration
	 * @param conf
	 */
	@log.debug((conf: LocalConfig) => `version=${conf.version}`)
	public requireMigration(conf: LocalConfig): conf is LocalConfigV1 | LocalConfigV2 | LocalConfigV3 {
		return !configGuards.is.v4(conf);
	}
}
