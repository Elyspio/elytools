export type FfmpegConvertOptions = {
	files: {
		input: string;
		output: string;
	};
	format: {
		id: string;
	};
	fps: number;
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
