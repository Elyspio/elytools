import type { StoreState } from "@store";

/**
 * Update waiting for the user: ready to install, or an older release to go back to (Dev to Stable)
 */
export function selectPendingUpdate(state: StoreState) {
	const status = state.update.status;
	if (status?.state === "downloaded" || (status?.state === "available" && status.downgrade)) return status;
	return null;
}
