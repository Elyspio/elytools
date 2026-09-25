import type { StoreState } from "@store";
import { createAppSelector } from "@store/utils/utils.reducer";
import type { Encoder } from "@shared/types/ffmpeg.types";

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

export const encodersSelectors = {
	ffmpeg: {
		isAvailable: (state: StoreState) => !!state.encoder.ffmpeg,
		encoders: getEncoders,
	},
};
