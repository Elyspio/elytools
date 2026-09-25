export type LlmProvider = "claude" | "codex";

/**
 * Token counts of an hour, in the LLM Usage Monitor contract: input excludes the cached input.
 */
export type LlmTokenCounts = {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
};

export type LlmUsageStatus = {
	enabled: boolean;
	running: boolean;
	machineId: string;
	machineName: string;
	/** Session log files followed on this workstation. */
	trackedFiles: number;
	/** Hours changed locally and not uploaded yet. */
	pendingHours: number;
	lastRunAt: string | null;
	lastSuccessAt: string | null;
	lastError: string | null;
};
