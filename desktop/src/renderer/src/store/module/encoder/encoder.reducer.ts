import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { setupFfmpeg } from "@modules/encoder/encoder.async.actions";
import type { Encoder, EncoderQueueStatus } from "@shared/types/ffmpeg.types";

export interface EncoderState {
	/** Queue of the main process, as last received */
	queue: EncoderQueueStatus;
	ffmpeg?: {
		encoders: Encoder[];
	};
}

const defaultState: EncoderState = {
	queue: { running: false, stopping: false, order: [], files: {} },
};

const slice = createSlice({
	name: "encoder",
	initialState: defaultState,
	reducers: {
		setEncoderQueue: (state, { payload }: PayloadAction<EncoderQueueStatus>) => {
			state.queue = payload;
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
	},
});

export const reducer = slice.reducer;

export const { setEncoderQueue } = slice.actions;
