import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { inject, injectable } from "inversify";
import { OidcModule } from "@main/modules/auth/oidc.module";
import { ConfigModule } from "@main/modules/config/config.module";
import { MainContextModule } from "@main/modules/context/main.context.module";
import { LogModule } from "@main/modules/log.module";
import type { LatestConfig } from "@shared/config/app.config";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";
import { type CodexFileState, emptyCodexFileState, emptyState, parseBucketKey, prune, readClaudeLine, readCodexLine, splitLines, type UsageState } from "./llm-usage.parser";

const SYNC_INTERVAL_MS = 5 * 60_000;
const FIRST_SYNC_DELAY_MS = 15_000;
const CHUNK_SIZE = 8 * 1024 * 1024;
/** The monitor accepts at most 2000 buckets per upload. */
const MAX_BUCKETS = 2000;
/** Longer than the 30 days Claude Code keeps its sessions, so a copied session is still recognised. */
const RETENTION_DAYS = 60;
/** The current hour waits a few minutes, so a workstation clock slightly ahead never sends an hour the monitor sees as future. */
const CLOCK_MARGIN_MS = 5 * 60_000;

type FileState = { offset: number; codex?: CodexFileState };

type PersistedState = {
	version: 1;
	files: Record<string, FileState>;
	usage: UsageState;
};

type LogSource = { kind: "claude" | "codex"; root: string };

/**
 * Follows the Claude Code and Codex session logs of this workstation and uploads their hourly token usage to LLM Usage
 * Monitor, every 5 minutes while the application runs (window closed included).
 */
@injectable()
export class LlmUsageModule extends LogModule {
	private state?: PersistedState;
	private timer?: ReturnType<typeof setInterval>;
	private current?: Promise<void>;
	private readonly listeners = new Set<(status: LlmUsageStatus) => void>();
	private status: Omit<LlmUsageStatus, "enabled" | "machineName" | "machineId" | "trackedFiles" | "pendingHours" | "running"> = {
		lastRunAt: null,
		lastSuccessAt: null,
		lastError: null,
	};

	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(OidcModule) private readonly oidcModule: OidcModule,
		@inject(MainContextModule) private readonly mainContextModule: MainContextModule
	) {
		super("LlmUsageModule");
	}

	private machineId?: string;

	private get stateFilePath() {
		return path.resolve(this.mainContextModule.appFolder, "llm-usage", "state.json");
	}

	public start() {
		if (this.timer) return;
		setTimeout(() => void this.sync(), FIRST_SYNC_DELAY_MS);
		this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
	}

	public onStatusChange(listener: (status: LlmUsageStatus) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Reads the new log lines and uploads the changed hours; a call during a run waits for that run. */
	public async sync(): Promise<LlmUsageStatus> {
		this.current ??= this.run().finally(() => {
			this.current = undefined;
			void this.notify();
		});
		await this.current;
		return this.getStatus();
	}

	public async getStatus(): Promise<LlmUsageStatus> {
		const { llmUsage } = await this.configModule.getConfig();
		const state = await this.loadState();
		return {
			...this.status,
			enabled: llmUsage.enabled,
			running: this.current !== undefined,
			machineId: await this.getMachineId(),
			machineName: llmUsage.machineName,
			trackedFiles: Object.keys(state.files).length,
			pendingHours: Object.keys(state.usage.dirty).length,
		};
	}

	private async run() {
		const { llmUsage } = await this.configModule.getConfig();
		if (!llmUsage.enabled) return;

		this.status.lastRunAt = new Date().toISOString();
		void this.notify();
		try {
			const state = await this.loadState();
			await this.scan(state);
			prune(state.usage, Date.now(), RETENTION_DAYS);
			await this.saveState(state);
			await this.upload(state, llmUsage);
			this.status.lastSuccessAt = new Date().toISOString();
			this.status.lastError = null;
		} catch (error) {
			this.status.lastError = (error as Error).message;
			this.logger.error("LLM usage sync failed", error);
		}
	}

	private async scan(state: PersistedState) {
		const seen = new Set<string>();
		for (const source of this.sources()) {
			for (const file of await this.listLogs(source.root)) {
				seen.add(file);
				const fileState = (state.files[file] ??= { offset: 0 });
				if (source.kind === "codex") fileState.codex ??= emptyCodexFileState();
				const read = (line: string) => (source.kind === "claude" ? readClaudeLine(state.usage, line) : readCodexLine(state.usage, fileState.codex!, file, line));
				try {
					fileState.offset = await this.readFrom(file, fileState.offset, read);
				} catch (error) {
					this.logger.warn("Cannot read session log", { file, error: (error as Error).message });
				}
			}
		}

		// Files removed by the CLI cleanup are forgotten: their hours stay in the buckets until the retention.
		for (const file of Object.keys(state.files)) {
			if (!seen.has(file)) delete state.files[file];
		}
	}

	private sources(): LogSource[] {
		const home = os.homedir();
		const claudeRoots = [process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"), path.join(home, ".config", "claude")];
		const codexHome = process.env.CODEX_HOME ?? path.join(home, ".codex");
		return [
			...[...new Set(claudeRoots)].map((root) => ({ kind: "claude" as const, root: path.join(root, "projects") })),
			{ kind: "codex", root: path.join(codexHome, "sessions") },
			{ kind: "codex", root: path.join(codexHome, "archived_sessions") },
		];
	}

	private async listLogs(root: string): Promise<string[]> {
		if (!fs.existsSync(root)) return [];
		const entries = await fs.promises.readdir(root, { recursive: true, withFileTypes: true });
		return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => path.join(entry.parentPath, entry.name));
	}

	/** Reads the complete lines written after <offset> and returns the offset of the first unread byte. */
	private async readFrom(file: string, offset: number, onLine: (line: string) => void): Promise<number> {
		const handle = await fs.promises.open(file, "r");
		try {
			const { size } = await handle.stat();
			// A shorter file was rewritten: read it again, the response ids keep the counts right.
			let position = offset > size ? 0 : offset;
			let carry = Buffer.alloc(0);
			while (position + carry.length < size) {
				const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, size - position - carry.length));
				const { bytesRead } = await handle.read(buffer, 0, buffer.length, position + carry.length);
				if (bytesRead === 0) break;
				const chunk = Buffer.concat([carry, buffer.subarray(0, bytesRead)]);
				const { lines, consumed } = splitLines(chunk);
				for (const line of lines) onLine(line);
				position += consumed;
				carry = chunk.subarray(consumed);
				// Large first imports: let the IPC and the window breathe between chunks.
				await setImmediate();
			}
			return position;
		} finally {
			await handle.close();
		}
	}

	private async upload(state: PersistedState, { apiBaseUrl, machineName, authProfileId }: LatestConfig["llmUsage"]) {
		const baseUrl = apiBaseUrl.trim().replace(/\/$/, "");
		if (!baseUrl) throw new Error("LLM Usage Monitor URL is not configured");

		const ready = Date.now() - CLOCK_MARGIN_MS;
		const keys = Object.keys(state.usage.dirty).filter((key) => Date.parse(parseBucketKey(key).hour) <= ready);

		// An empty upload still records the workstation and its last contact.
		for (let index = 0; index === 0 || index < keys.length; index += MAX_BUCKETS) {
			const batch = keys.slice(index, index + MAX_BUCKETS);
			const token = await this.oidcModule.getAccessToken(authProfileId, "llm-usage");
			const response = await fetch(`${baseUrl}/api/token-usage`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
				body: JSON.stringify({
					machineId: await this.getMachineId(),
					machineName: machineName.trim() || os.hostname(),
					buckets: batch.map((key) => ({ ...parseBucketKey(key), tokens: state.usage.buckets[key] ?? { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } })),
				}),
			});

			if (!response.ok) {
				const body = await response.text();
				const hint = response.status === 401 || response.status === 403 ? " (sign in again, the account needs the llm-usage-monitor:admin role)" : "";
				throw new Error(`Upload refused (${response.status})${hint}: ${body.slice(0, 250)}`);
			}

			for (const key of batch) delete state.usage.dirty[key];
			await this.saveState(state);
		}
	}

	private async loadState(): Promise<PersistedState> {
		if (this.state) return this.state;
		try {
			const persisted = JSON.parse(await fs.promises.readFile(this.stateFilePath, "utf-8")) as PersistedState;
			if (persisted.version === 1) {
				this.state = persisted;
				return persisted;
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.logger.warn("Unreadable LLM usage state, starting over", error);
		}
		this.state = { version: 1, files: {}, usage: emptyState() };
		return this.state;
	}

	/**
	 * The workstation id, generated once. Kept apart from the state: losing the state re-reads the logs under the same id,
	 * and the monitor replaces the hours with the same totals.
	 */
	private async getMachineId(): Promise<string> {
		if (this.machineId) return this.machineId;
		const file = path.resolve(this.mainContextModule.appFolder, "llm-usage", "machine-id");
		try {
			this.machineId = (await fs.promises.readFile(file, "utf-8")).trim();
		} catch {
			// First run on this workstation.
		}
		if (!this.machineId) {
			this.machineId = crypto.randomUUID();
			await fs.promises.mkdir(path.dirname(file), { recursive: true });
			await fs.promises.writeFile(file, this.machineId);
		}
		return this.machineId;
	}

	private async saveState(state: PersistedState) {
		await fs.promises.mkdir(path.dirname(this.stateFilePath), { recursive: true });
		const temporary = `${this.stateFilePath}.tmp`;
		await fs.promises.writeFile(temporary, JSON.stringify(state));
		await fs.promises.rename(temporary, this.stateFilePath);
	}

	private async notify() {
		if (this.listeners.size === 0) return;
		const status = await this.getStatus();
		for (const listener of this.listeners) listener(status);
	}
}
