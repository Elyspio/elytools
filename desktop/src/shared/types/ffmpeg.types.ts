/**
 * Encoding profiles: one ffmpeg video encoder with its own tuned arguments.
 */
export type EncoderProfileId = "av1_nvenc" | "hevc_nvenc" | "libsvtav1";

/**
 * Named XPSNR (luma) targets, or a custom value.
 */
export type QualityPresetId = "compact" | "standard" | "high" | "custom";

/**
 * Encoder settings chosen by the user, persisted in the local config.
 */
export type EncoderSettings = {
	profile: EncoderProfileId;
	quality: QualityPresetId;
	/** XPSNR (luma, dB) target used when {@link quality} is "custom" */
	customXpsnr: number;
	/** Applies the libplacebo deband filter (GPU) before encoding */
	deband: boolean;
};

/**
 * What happens to a source file, decided from its probe before any work.
 */
export type SourcePlan = { action: "encode" } | { action: "remux"; reason: string } | { action: "skip"; reason: string };

export type FfmpegAnalyzeOptions = {
	input: string;
	/** Source duration in seconds */
	duration: number;
	settings: EncoderSettings;
};

export type FfmpegAnalyzeResult = {
	/** CQ (NVENC) or CRF (SVT-AV1) reaching the target, clamped to the profile range */
	quality: number;
	/** Mean XPSNR (luma, dB) measured on the samples at {@link quality} */
	xpsnr: number;
	/** Whether the target is reached at {@link quality} */
	targetReached: boolean;
};

export type FfmpegConvertOptions = {
	files: {
		input: string;
		output: string;
	};
	settings: EncoderSettings;
	/** CQ/CRF from the analysis; null copies the video stream (remux) */
	quality: number | null;
	/** Codecs of the source subtitle streams, in order (some need conversion to fit in MKV) */
	subtitleCodecs: string[];
};

export type EncoderType = "video" | "audio" | "subtitle" | "unknown";

export interface EncoderCapabilities {
	/** Experimental: The encoder is not fully tested or standard */
	experimental: boolean;
	/** Frame-level multithreading support */
	frameMt: boolean;
	/** Slice-level multithreading support */
	sliceMt: boolean;
	/** Bandwidth limited: The encoder has bitrate limitations */
	bandwidthLimited: boolean;
	/** Direct rendering support */
	directRendering: boolean;
}

export interface Encoder {
	/** The internal name used by ffmpeg (e.g., 'libx264') */
	id: string;
	/** Human readable description */
	description: string;
	/** The media type this encoder handles */
	type: EncoderType;
	/** Detailed feature flags parsed from output */
	capabilities: EncoderCapabilities;
	/** The original 6-character flag string from ffmpeg output */
	rawFlags: string;
}
