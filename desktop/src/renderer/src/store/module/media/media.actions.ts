import { createActionGenerator } from "@store/utils/utils.actions";

const createAction = createActionGenerator("media");

export const setPurgeSelectedFolder = createAction<string | null>("purge/setSelectedFolder");
export const resetPurgeState = createAction("purge/reset");
export const setPurgeScanProgress = createAction<number>("purge/setScanProgress");
export const beginPurgeEstimate = createAction<number>("purge/beginEstimate");
export const setPurgeEstimateProgress = createAction<{ processed: number; total: number }>("purge/setEstimateProgress");
export const setPurgeDeleteProgress = createAction<{ processed: number; total: number }>("purge/setDeleteProgress");
