import path from "node:path";
import { type CollectorStatus, defaultDataDir, LlmUsageCollector, migrateLegacyData } from "@elyspio/llm-usage-collector";
import { inject, injectable } from "inversify";
import { OidcModule } from "@main/modules/auth/oidc.module";
import { ConfigModule } from "@main/modules/config/config.module";
import { MainContextModule } from "@main/modules/context/main.context.module";
import { LogModule } from "@main/modules/log.module";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";

const SYNC_INTERVAL_MS = 5 * 60_000;
const FIRST_SYNC_DELAY_MS = 15_000;

/**
 * Uploads the Claude Code and Codex token usage of this workstation to LLM Usage Monitor, every 5 minutes while the
 * application runs (window closed included), through @elyspio/llm-usage-collector. Its data folder is shared with the
 * standalone collector (`llm-usage`): both upload as the same workstation and take turns.
 */
@injectable()
export class LlmUsageModule extends LogModule {
	private timer?: ReturnType<typeof setInterval>;
	private readonly collector: LlmUsageCollector;
	private migration?: Promise<void>;

	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(OidcModule) private readonly oidcModule: OidcModule,
		@inject(MainContextModule) private readonly mainContextModule: MainContextModule
	) {
		super("LlmUsageModule");
		this.collector = new LlmUsageCollector({
			holder: "elytools",
			logger: this.logger,
			getAccessToken: async () => {
				const { llmUsage } = await this.configModule.getConfig();
				return await this.oidcModule.getAccessToken(llmUsage.authProfileId, "llm-usage");
			},
			getSettings: async () => {
				const { llmUsage } = await this.configModule.getConfig();
				return { apiBaseUrl: llmUsage.apiBaseUrl, machineName: llmUsage.machineName };
			},
		});
	}

	public start() {
		if (this.timer) return;
		setTimeout(() => void this.sync(), FIRST_SYNC_DELAY_MS);
		this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
	}

	public onStatusChange(listener: (status: LlmUsageStatus) => void) {
		return this.collector.onStatusChange((status) => void this.toStatus(status).then(listener));
	}

	/** Reads the new log lines and uploads the changed hours; skipped while the standalone collector runs a sync. */
	public async sync(): Promise<LlmUsageStatus> {
		const { llmUsage } = await this.configModule.getConfig();
		if (!llmUsage.enabled) return await this.getStatus();

		await this.migrate();
		const { outcome } = await this.collector.sync();
		return { ...(await this.getStatus()), outcome };
	}

	public async getStatus(): Promise<LlmUsageStatus> {
		await this.migrate();
		return await this.toStatus(await this.collector.getStatus());
	}

	private async toStatus(status: CollectorStatus): Promise<LlmUsageStatus> {
		const { llmUsage } = await this.configModule.getConfig();
		return {
			enabled: llmUsage.enabled,
			running: status.running,
			machineId: status.machineId,
			machineName: llmUsage.machineName,
			trackedFiles: status.trackedFiles,
			pendingHours: status.pendingHours,
			lastRunAt: status.lastRunAt,
			lastRunBy: status.lastRunBy,
			lastSuccessAt: status.lastSuccessAt,
			lastError: status.lastError,
		};
	}

	/** Once: the machine id and the state kept in the app folder by the previous versions move to the shared folder. */
	private migrate() {
		this.migration ??= migrateLegacyData(defaultDataDir(), [path.join(this.mainContextModule.appFolder, "llm-usage")]).then(
			(from) => {
				if (from) this.logger.info("LLM usage data moved to the shared collector folder", { from, to: defaultDataDir() });
			},
			(error: Error) => this.logger.warn("Cannot move the LLM usage data to the shared collector folder", { error: error.message })
		);
		return this.migration;
	}
}
