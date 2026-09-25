import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { convertMedia, setupFfmpeg, stopConvertMedia } from "@modules/encoder/encoder.async.actions";
import type { Encoder } from "@shared/types/ffmpeg.types";

export interface EncoderState {
	processes: {
		/**
		 * Mapping of media path to progress percentage (0-1)
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
	};
	ffmpeg?: {
		encoders: Encoder[];
	};
	encoding: boolean;
	current: {
		pids: string[];
		format?: string;
		fps: number;
	};
}

const defaultState: EncoderState = {
	processes: {
		progress: {},
		pids: {},
		startedAt: {},
	},
	encoding: false,
	current: {
		pids: [],
		fps: 24,
	},
};

const slice = createSlice({
	name: "encoder",
	initialState: defaultState,
	reducers: {
		setFormat: (state, action: PayloadAction<string | undefined>) => {
			state.current.format = action.payload;
		},
		setFps: (state, action: PayloadAction<number>) => {
			state.current.fps = action.payload;
		},
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
		});
		builder.addCase(convertMedia.rejected, (state) => {
			state.encoding = false;
		});

		builder.addCase(stopConvertMedia.pending, (state) => {
			state.encoding = false;
		});
	},
});

export const reducer = slice.reducer;

export const { setProcessProgress, setFileProcesses, setFormat, removeFileProcess, setFps } = slice.actions;
