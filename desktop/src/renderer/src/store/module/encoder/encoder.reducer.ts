import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { convertMedia, setupFfmpeg, stopConvertMedia } from "@modules/encoder/encoder.async.actions";
import type { Encoder } from "@shared/types/ffmpeg.types";

export type EncodePhase = "pending" | "analyzing" | "encoding" | "remuxing" | "done" | "skipped" | "failed" | "aborted";

export type FileEncodeState = {
	phase: EncodePhase;
	/** Why a file was skipped, remuxed or failed */
	note?: string;
	/** CQ/CRF chosen by the analysis */
	quality?: number;
	/** XPSNR (luma, dB) measured on the samples at {@link quality} */
	xpsnr?: number;
	/** Whether the XPSNR target was reached inside the quality range */
	targetReached?: boolean;
	/** Size of the converted file, in bytes */
	outputSize?: number;
};

export interface EncoderState {
	processes: {
		/**
		 * Mapping of media path to progress percentage (0-1) of the ffmpeg process
		 */
		progress: Record<string, number>;
		/**
		 * Mapping of media path to process id
		 */
		pids: Record<string, string>;
		/**
		 * Mapping of media path to encoding start timestamp (ms)
		 */
		startedAt: Record<string, number>;
		/**
		 * Mapping of media path to its phase and results
		 */
		files: Record<string, FileEncodeState>;
	};
	ffmpeg?: {
		encoders: Encoder[];
	};
	encoding: boolean;
	/** A cancel is in progress: Encode stays disabled until the cancelled run has settled */
	stopping: boolean;
	current: {
		pids: string[];
	};
}

const defaultState: EncoderState = {
	processes: {
		progress: {},
		pids: {},
		startedAt: {},
		files: {},
	},
	encoding: false,
	stopping: false,
	current: {
		pids: [],
	},
};

const slice = createSlice({
	name: "encoder",
	initialState: defaultState,
	reducers: {
		removeFileProcess: (state, { payload: { pids } }: PayloadAction<{ pids: string[] }>) => {
			state.current.pids = state.current.pids.filter((p) => !pids.includes(p));
		},
		setFileProcesses: (state, { payload: { pid, path } }: PayloadAction<{ path: string; pid: string }>) => {
			state.current.pids.push(pid);
			state.processes.pids[path] = pid;
			state.processes.startedAt[path] = Date.now();
		},
		setProcessProgress: (state, action: PayloadAction<{ path: string; value: number }>) => {
			state.processes.progress[action.payload.path] = action.payload.value;
		},
		updateFileEncode: (state, { payload: { path, ...update } }: PayloadAction<{ path: string } & Partial<FileEncodeState>>) => {
			state.processes.files[path] = { ...(state.processes.files[path] ?? { phase: "pending" }), ...update };
		},
		resetFileEncodes: (state) => {
			state.processes = { progress: {}, pids: {}, startedAt: {}, files: {} };
		},
	},
	extraReducers: (builder) => {
		builder.addCase(setupFfmpeg.fulfilled, (state, action) => {
			if (!action.payload.isAvailable) {
				state.ffmpeg = undefined;
				return;
			}

			const videoEncoders = action.payload.encoders!.filter((e) => e.type === "video");

			state.ffmpeg = {
				encoders: videoEncoders,
			};
		});

		builder.addCase(convertMedia.pending, (state) => {
			state.encoding = true;
		});
		builder.addCase(convertMedia.fulfilled, (state) => {
			state.encoding = false;
			state.stopping = false;
		});
		builder.addCase(convertMedia.rejected, (state) => {
			state.encoding = false;
			state.stopping = false;
		});

		builder.addCase(stopConvertMedia.pending, (state) => {
			if (state.encoding) state.stopping = true;
		});
	},
});

export const reducer = slice.reducer;

export const { setProcessProgress, setFileProcesses, removeFileProcess, updateFileEncode, resetFileEncodes } = slice.actions;
