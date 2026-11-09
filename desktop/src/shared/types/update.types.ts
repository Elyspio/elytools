/** "no-release": nothing is published on the selected channel yet (no stable release, no development build...) */
export type UpdateState = "idle" | "checking" | "up-to-date" | "no-release" | "available" | "downloading" | "downloaded" | "error";

/**
 * Auto update state of the application, pushed by the main process on every change
 */
export type UpdateStatus = {
	state: UpdateState;
	currentVersion: string;
	/** Version published on GitHub, known after a successful check */
	latestVersion: string | null;
	releaseDate: string | null;
	/** Release notes of GitHub (HTML) */
	releaseNotes: string | null;
	/** The release found is older than the installed version (channel change): only installed on the user's request */
	downgrade: boolean;
	/** Download progress in percent, while downloading */
	progress: number | null;
	lastCheckAt: string | null;
	nextCheckAt: string | null;
	error: string | null;
	/** False in development: checks use dev-app-update.yml and nothing gets installed */
	isPackaged: boolean;
};
