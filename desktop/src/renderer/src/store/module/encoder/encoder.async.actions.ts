import { createAsyncActionGenerator } from "@store/utils/utils.actions";
import { webContainer } from "@core/di/web.container";
import { FfmpegService } from "@services/media/ffmpeg.service";
import type { Encoder } from "@shared/types/ffmpeg.types";
import { setEncoderQueue } from "@modules/encoder/encoder.reducer";

const createAsyncThunk = createAsyncActionGenerator("encoder");

/**
 * Asks the main process to convert the selected files. The queue runs there: this resolves once it has started,
 * and its progress arrives with the queue status.
 */
export const convertMedia = createAsyncThunk("convert", async (_, { getState }) => {
	const paths = getState().media.data.map((media) => media.file.path);

	await window.preload.ipc.send.encoder.start(paths);
});

/**
 * Stops the queue; resolves once its processes are gone.
 */
export const stopConvertMedia = createAsyncThunk("stop-convert", async () => {
	await window.preload.ipc.send.encoder.cancel();
});

/**
 * Follows the queue of the main process, starting from its current state: a window reloaded during a run shows it again.
 */
export const watchEncoderQueue = createAsyncThunk("queue/watch", async (_, { dispatch }) => {
	window.preload.ipc.on.encoder.status((status) => dispatch(setEncoderQueue(status)));
	dispatch(setEncoderQueue(await window.preload.ipc.send.encoder.getStatus()));
});

export const setupFfmpeg = createAsyncThunk("ffmpeg/setup", async (): Promise<{ isAvailable: boolean; encoders?: Encoder[] }> => {
	const ffmpegService = webContainer.get(FfmpegService);

	const isAvailable = await ffmpegService.isAvailable();

	if (!isAvailable) {
		return {
			isAvailable: false,
		};
	}

	return {
		isAvailable: true,
		encoders: await ffmpegService.getEncoders(),
	};
});
