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
	/** `elytools`, or `cli` when the standalone collector of this workstation ran the last sync. */
	lastRunBy: string | null;
	lastSuccessAt: string | null;
	lastError: string | null;
	/** Result of the sync just requested; `locked` when another collector of this workstation was running one. */
	outcome?: "uploaded" | "locked" | "failed";
};
