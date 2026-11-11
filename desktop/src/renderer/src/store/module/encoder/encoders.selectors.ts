import type { StoreState } from "@store";
import { createAppSelector } from "@store/utils/utils.reducer";
import type { Encoder, FileEncodeState } from "@shared/types/ffmpeg.types";
import { basename } from "@shared/encoder/encoder.profiles";

function getEncoderManufacturer(encoder: Pick<Encoder, "id">) {
	if (encoder.id.includes("nvenc")) return "Hardware: Nvidia";
	if (encoder.id.includes("qsv")) return "Hardware: Intel";
	if (encoder.id.includes("amf")) return "Hardware: Amd";
	return "Software";
}

const getEncoders = createAppSelector([(state: StoreState) => state.encoder.ffmpeg], (ffmpeg) => {
	const encoders = ffmpeg?.encoders || [];

	return encoders.map((e) => ({
		...e,
		manufacturer: getEncoderManufacturer(e),
	}));
});

export type QueueRow = {
	path: string;
	name: string;
	/** Size of the source, in bytes */
	size: number;
	state: FileEncodeState;
};

const waiting: FileEncodeState = { phase: "pending" };

/**
 * Rows of the encoder page: the selected files with their state in the queue. Without a selection (window
 * reloaded during a run), the files of the queue itself.
 */
const getQueueRows = createAppSelector([(state: StoreState) => state.media.data, (state: StoreState) => state.encoder.queue], (medias, queue): QueueRow[] => {
	if (medias.length > 0) {
		return medias.map(({ file }) => ({ path: file.path, name: file.name, size: file.size, state: queue.files[file.path] ?? waiting }));
	}

	return queue.order.map((path) => {
		const state = queue.files[path] ?? waiting;
		return { path, name: basename(path), size: state.size ?? 0, state };
	});
});

export const encodersSelectors = {
	queue: {
		rows: getQueueRows,
		running: (state: StoreState) => state.encoder.queue.running,
		stopping: (state: StoreState) => state.encoder.queue.stopping,
	},
	ffmpeg: {
		isAvailable: (state: StoreState) => !!state.encoder.ffmpeg,
		encoders: getEncoders,
	},
};
