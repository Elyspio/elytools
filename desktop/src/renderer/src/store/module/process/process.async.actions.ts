import type { StoreState } from "@store";

/**
 * Resolves when the process exits with code 0. No timeout: an encode can take hours.
 */
export function waitProcessExits(getState: () => StoreState, pid: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const interval = setInterval(() => {
			const state = getState();

			const exitStatus = state.process.byPids[pid]?.exitStatus;

			if (exitStatus === undefined) return;

			clearInterval(interval);

			if (exitStatus === 0) {
				resolve();
			} else reject(new Error(`Exit status ${exitStatus}`));
		}, 500);
	});
}
