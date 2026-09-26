export type UpdateState = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error";

/**
 * Auto update state of the application, pushed by the main process on every change
 */
export type UpdateStatus = {
	state: UpdateState;
	currentVersion: string;
	/** Version published on GitHub, known after a successful check */
	latestVersion: string | null;
	releaseDate: string | null;
	releaseNotes: string | null;
	/** Download progress in percent, while downloading */
	progress: number | null;
	lastCheckAt: string | null;
	nextCheckAt: string | null;
	error: string | null;
	/** False in development: checks use dev-app-update.yml */
	isPackaged: boolean;
};
