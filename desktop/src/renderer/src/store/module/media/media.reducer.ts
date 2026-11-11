import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Media } from "@components/internal/encoder/type";
import { purgeMediaTargets, scanPurgeTargets, setMedias } from "@modules/media/media.async.actions";
import { beginPurgeEstimate, resetPurgeState, setPurgeDeleteProgress, setPurgeEstimateProgress, setPurgeScanProgress, setPurgeSelectedFolder } from "./media.actions";

type ProgressState = {
	processed: number;
	total: number;
};

type PurgeState = {
	selectedFolder: string | null;
	targets: string[];
	scanStats: {
		scannedFolders: number;
		matched: number;
	};
	estimatedSize: number | null;
	estimateProgress: ProgressState;
	scanning: boolean;
	estimating: boolean;
	purging: boolean;
	purgeProgress: ProgressState;
};

export type MediaState = {
	data: Media[];
	purge: PurgeState;
};

const createInitialPurgeState = (): PurgeState => ({
	selectedFolder: null,
	targets: [],
	scanStats: {
		scannedFolders: 0,
		matched: 0,
	},
	estimatedSize: null,
	estimateProgress: {
		processed: 0,
		total: 0,
	},
	scanning: false,
	estimating: false,
	purging: false,
	purgeProgress: {
		processed: 0,
		total: 0,
	},
});

const resetPurgeResults = (state: PurgeState) => {
	state.targets = [];
	state.scanStats = {
		scannedFolders: 0,
		matched: 0,
	};
	state.estimatedSize = null;
	state.scanning = false;
	state.estimating = false;
	state.purging = false;
	state.estimateProgress = {
		processed: 0,
		total: 0,
	};
	state.purgeProgress = {
		processed: 0,
		total: 0,
	};
};

const initialState: MediaState = {
	data: [],
	purge: createInitialPurgeState(),
};

export const mediaSlice = createSlice({
	name: "media",
	initialState,
	reducers: {},
	extraReducers: ({ addCase }) => {
		addCase(setMedias.fulfilled, (state, action) => {
			state.data = action.payload;
		});

		addCase(setPurgeSelectedFolder, (state, action: PayloadAction<string | null>) => {
			state.purge.selectedFolder = action.payload;
			resetPurgeResults(state.purge);
		});

		addCase(resetPurgeState, (state) => {
			resetPurgeResults(state.purge);
		});

		addCase(setPurgeScanProgress, (state, action: PayloadAction<number>) => {
			state.purge.scanStats.scannedFolders = action.payload;
		});

		addCase(beginPurgeEstimate, (state, action: PayloadAction<number>) => {
			state.purge.estimating = true;
			state.purge.estimateProgress = {
				processed: 0,
				total: action.payload,
			};
		});

		addCase(setPurgeEstimateProgress, (state, action: PayloadAction<ProgressState>) => {
			state.purge.estimateProgress = action.payload;
		});

		addCase(setPurgeDeleteProgress, (state, action: PayloadAction<ProgressState>) => {
			state.purge.purgeProgress = action.payload;
		});

		addCase(scanPurgeTargets.pending, (state) => {
			resetPurgeResults(state.purge);
			state.purge.scanning = true;
			state.purge.estimating = false;
		});

		addCase(scanPurgeTargets.fulfilled, (state, action) => {
			state.purge.scanning = false;
			state.purge.estimating = false;
			state.purge.targets = action.payload.targets;
			state.purge.scanStats.matched = action.payload.targets.length;
			state.purge.estimatedSize = action.payload.estimatedSize;
		});

		addCase(scanPurgeTargets.rejected, (state) => {
			state.purge.scanning = false;
			state.purge.estimating = false;
		});

		addCase(purgeMediaTargets.pending, (state, action) => {
			state.purge.purging = true;
			state.purge.purgeProgress = {
				processed: 0,
				total: action.meta.arg.targets.length,
			};
		});

		addCase(purgeMediaTargets.fulfilled, (state) => {
			state.purge.purging = false;
			state.purge.purgeProgress = {
				processed: 0,
				total: 0,
			};
			resetPurgeResults(state.purge);
		});

		addCase(purgeMediaTargets.rejected, (state) => {
			state.purge.purging = false;
			state.purge.purgeProgress = {
				processed: 0,
				total: 0,
			};
		});
	},
});
