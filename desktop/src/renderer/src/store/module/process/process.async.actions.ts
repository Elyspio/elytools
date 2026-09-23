import type { StoreState } from "@store";

export function waitProcessExits(getState: () => StoreState, pid: string, timeoutInSecondes = 10 * 60): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		setTimeout(() => reject(new Error(`process timeout after ${timeoutInSecondes}`)), timeoutInSecondes * 1000); // 10 minutes timeout

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
