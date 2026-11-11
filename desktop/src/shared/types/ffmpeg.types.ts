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

/** A finished round of the quality search */
export type AnalyzeTrial = {
	quality: number;
	/** Mean XPSNR (luma, dB) of the samples */
	xpsnr: number;
	/** Whether the target is reached at this quality */
	reached: boolean;
};

/** Progress of an analysis, updated after each sample step */
export type FfmpegAnalyzeProgress = {
	/** Round in progress (1-based): one CQ/CRF value measured per round */
	round: number;
	/** Rounds the search usually needs (it may take more on an unusual source) */
	expectedRounds: number;
	/** CQ/CRF measured by the round in progress */
	quality: number;
	samplesEncoded: number;
	samplesMeasured: number;
	samplesTotal: number;
	/** Finished rounds, in order */
	trials: AnalyzeTrial[];
};

export type FfmpegAnalyzeResult = {
	/** CQ (NVENC) or CRF (SVT-AV1) reaching the target, clamped to the profile range */
	quality: number;
	/** Mean XPSNR (luma, dB) measured on the samples at {@link quality} */
	xpsnr: number;
	/** Whether the target is reached at {@link quality} */
	targetReached: boolean;
	/** Samples the measure is based on */
	samples: number;
};

export type EncodePhase = "pending" | "analyzing" | "encoding" | "remuxing" | "done" | "skipped" | "failed" | "aborted";

/** State of one file of the encoder queue */
export type FileEncodeState = {
	phase: EncodePhase;
	/** Size of the source when the run started, in bytes */
	size?: number;
	/** Why a file was skipped, remuxed or failed */
	note?: string;
	/** CQ/CRF chosen by the analysis */
	quality?: number;
	/** XPSNR (luma, dB) measured on the samples at {@link quality} */
	xpsnr?: number;
	/** Whether the XPSNR target was reached inside the quality range */
	targetReached?: boolean;
	/** Samples the analysis measured */
	samples?: number;
	/** Progress of the analysis in progress */
	analysis?: FfmpegAnalyzeProgress;
	/** Progress of the encode or remux in progress (0-1) */
	progress?: number;
	/** When the encode or remux started (ms since epoch) */
	startedAt?: number;
	/** Size of the converted file, in bytes */
	outputSize?: number;
};

/** State of the encoder queue, owned by the main process and sent to the window at each change */
export type EncoderQueueStatus = {
	running: boolean;
	/** A cancel is in progress: nothing can start until the run has settled */
	stopping: boolean;
	/** Files of the last run, in order */
	order: string[];
	files: Record<string, FileEncodeState>;
};

export type FfmpegConvertOptions = {
	files: {
		input: string;
		output: string;
	};
	settings: EncoderSettings;
	/** CQ/CRF from the analysis; null copies the video stream (remux) */
	quality: number | null;
	/** Index of the main video among the video streams of the source (cover pictures come first in some files) */
	videoStreamIndex: number;
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
