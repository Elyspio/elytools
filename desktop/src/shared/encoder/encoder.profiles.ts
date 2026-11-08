import type { EncoderProfileId, EncoderSettings, FfmpegConvertOptions, QualityPresetId, SourcePlan } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";

export type EncoderProfile = {
	id: EncoderProfileId;
	label: string;
	/** ffmpeg encoder that must be listed by `ffmpeg -encoders` */
	encoder: string;
	hardware: "GPU" | "CPU";
	/** Name of the quality knob shown to the user */
	qualityLabel: "CQ" | "CRF";
	/** Search bounds: a lower value means a better image and a bigger file */
	qualityRange: { min: number; max: number };
	/** Samples encoded at the same time during the analysis (NVENC driver limit: 12 sessions) */
	sampleParallelism: number;
	/** Episodes encoded at the same time (3 NVENC engines on a RTX 5090, SVT-AV1 already uses every core) */
	fileParallelism: number;
	videoArgs: (quality: number) => string[];
};

const nvencArgs = (codec: string, extra: string[]) => (quality: number) => [
	"-c:v",
	codec,
	"-preset",
	"p7",
	"-tune",
	"uhq",
	"-rc",
	"vbr",
	"-cq",
	quality.toString(),
	"-b:v",
	"0",
	"-pix_fmt",
	"p010le",
	"-rc-lookahead",
	"32",
	"-spatial-aq",
	"1",
	"-temporal-aq",
	"1",
	"-bf",
	"4",
	"-b_ref_mode",
	"middle",
	...extra,
];

export const ENCODER_PROFILES: Record<EncoderProfileId, EncoderProfile> = {
	av1_nvenc: {
		id: "av1_nvenc",
		label: "AV1 · NVENC",
		encoder: "av1_nvenc",
		hardware: "GPU",
		qualityLabel: "CQ",
		qualityRange: { min: 22, max: 36 },
		sampleParallelism: 12,
		fileParallelism: 3,
		videoArgs: nvencArgs("av1_nvenc", []),
	},
	hevc_nvenc: {
		id: "hevc_nvenc",
		label: "HEVC · NVENC",
		encoder: "hevc_nvenc",
		hardware: "GPU",
		qualityLabel: "CQ",
		qualityRange: { min: 16, max: 32 },
		sampleParallelism: 12,
		fileParallelism: 3,
		videoArgs: nvencArgs("hevc_nvenc", ["-profile:v", "main10"]),
	},
	libsvtav1: {
		id: "libsvtav1",
		label: "AV1 · SVT-AV1",
		encoder: "libsvtav1",
		hardware: "CPU",
		qualityLabel: "CRF",
		qualityRange: { min: 18, max: 40 },
		sampleParallelism: 4,
		fileParallelism: 1,
		videoArgs: (quality) => [
			"-c:v",
			"libsvtav1",
			"-preset",
			"4",
			"-crf",
			quality.toString(),
			"-pix_fmt",
			"yuv420p10le",
			"-svtav1-params",
			"enable-variance-boost=1:sharpness=1:enable-qm=1:qm-min=0",
		],
	},
};

export const QUALITY_PRESETS: Record<Exclude<QualityPresetId, "custom">, { label: string; xpsnr: number }> = {
	compact: { label: "Compact", xpsnr: 41 },
	standard: { label: "Standard", xpsnr: 42 },
	high: { label: "High", xpsnr: 43 },
};

export const DEFAULT_ENCODER_SETTINGS: EncoderSettings = {
	profile: "av1_nvenc",
	quality: "standard",
	customXpsnr: 42,
	deband: false,
};

/**
 * GPU deband (needs ffmpeg built with libplacebo and a Vulkan device). No added grain: the output is 10-bit,
 * and random grain would differ between the encoded sample and the reference of the XPSNR measure.
 */
export const DEBAND_FILTER = "libplacebo=deband=true:deband_grain=0:format=yuv420p10le";

export const SAMPLE_DURATION = 6;

/** Openings and endings are skipped: they are not representative of the episode */
export const SAMPLE_EDGE_SKIP = 90;

/** Codecs efficient enough not to be encoded again (generation loss for a small gain) */
const EFFICIENT_CODECS = ["hevc", "av1"];

export function getTargetXpsnr(settings: EncoderSettings): number {
	return settings.quality === "custom" ? settings.customXpsnr : QUALITY_PRESETS[settings.quality].xpsnr;
}

export function getMainVideoStream(probe: FfprobeResult) {
	return probe.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
}

/**
 * Decides what to do with a source: HEVC/AV1 sources are never encoded again, only moved into MKV.
 */
export function planSource(probe: FfprobeResult, path: string): SourcePlan {
	const video = getMainVideoStream(probe);

	if (!video) return { action: "skip", reason: "No video stream" };

	if (EFFICIENT_CODECS.includes(video.codec_name)) {
		const codec = video.codec_name.toUpperCase();
		if (path.toLowerCase().endsWith(".mkv")) return { action: "skip", reason: `Already ${codec} in MKV` };
		return { action: "remux", reason: `${codec} source, copied into MKV` };
	}

	return { action: "encode" };
}

/**
 * Start times (seconds) of the analysis samples, spread evenly between the opening and the ending.
 */
export function computeSamplePositions(duration: number, count: number, length = SAMPLE_DURATION): number[] {
	if (!Number.isFinite(duration) || duration <= 0) return [];

	const fitting = Math.max(1, Math.min(count, Math.floor(duration / length)));
	const edge = duration - 2 * SAMPLE_EDGE_SKIP >= fitting * length ? SAMPLE_EDGE_SKIP : 0;
	const span = duration - 2 * edge - length;

	if (span <= 0) return [edge];

	return Array.from({ length: fitting }, (_, i) => Math.round((edge + (span * (i + 0.5)) / fitting) * 100) / 100);
}

export type QualitySearchResult = { quality: number; xpsnr: number; targetReached: boolean };

/**
 * Finds the highest quality value (smallest file) whose XPSNR still reaches the target.
 * XPSNR decreases when the quality value increases, so a binary search needs about log2(range) measures.
 */
export async function searchQuality(range: { min: number; max: number }, target: number, measure: (quality: number) => Promise<number>): Promise<QualitySearchResult> {
	const cache = new Map<number, number>();
	const measureOnce = async (quality: number) => {
		if (!cache.has(quality)) cache.set(quality, await measure(quality));
		return cache.get(quality)!;
	};

	let low = range.min;
	let high = range.max;
	let best: QualitySearchResult | null = null;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const xpsnr = await measureOnce(middle);

		if (xpsnr >= target) {
			best = { quality: middle, xpsnr, targetReached: true };
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return best ?? { quality: range.min, xpsnr: await measureOnce(range.min), targetReached: false };
}

const MAP_ARGS = ["-map", "0:V:0", "-map", "0:a?", "-map", "0:s?", "-map", "0:t?", "-map_metadata", "0", "-map_chapters", "0"];

/**
 * Full conversion: keeps every audio, subtitle and attachment (fonts) stream, copies audio, outputs MKV.
 * The source frame rate is kept.
 */
export function buildConvertArgs(opts: FfmpegConvertOptions): string[] {
	const profile = ENCODER_PROFILES[opts.settings.profile];

	const video = opts.quality === null ? ["-c:v", "copy"] : [...(opts.settings.deband ? ["-vf", DEBAND_FILTER] : []), ...profile.videoArgs(opts.quality)];

	// MP4 text subtitles cannot be stored as is in MKV
	const subtitles = opts.subtitleCodecs.flatMap((codec, index) => (codec === "mov_text" ? [`-c:s:${index}`, "srt"] : []));

	return ["-hide_banner", "-y", "-i", opts.files.input, ...MAP_ARGS, "-c", "copy", ...subtitles, ...video, "-f", "matroska", opts.files.output];
}

/**
 * Encodes one analysis sample (video only).
 */
export function buildSampleEncodeArgs(input: string, output: string, start: number, settings: EncoderSettings, quality: number, length = SAMPLE_DURATION): string[] {
	const profile = ENCODER_PROFILES[settings.profile];

	return [
		"-hide_banner",
		"-nostats",
		"-v",
		"error",
		"-y",
		"-ss",
		start.toString(),
		"-t",
		length.toString(),
		"-i",
		input,
		"-map",
		"0:V:0",
		...(settings.deband ? ["-vf", DEBAND_FILTER] : []),
		...profile.videoArgs(quality),
		"-an",
		"-sn",
		"-dn",
		"-f",
		"matroska",
		output,
	];
}

/**
 * MKV timestamps are rounded to the millisecond (41 or 42 ms per frame at 23.976 fps): pairing frames by
 * timestamp shifts one frame every other frame. Frames are paired by index instead.
 */
const PAIR_BY_INDEX = "setpts=N/(24*TB),format=yuv420p10le";

/**
 * Compares a sample with the same window of the source. With deband, the reference is debanded too:
 * the score measures the encoding loss, not the filter.
 */
export function buildSampleMetricArgs(sample: string, input: string, start: number, deband: boolean, length = SAMPLE_DURATION): string[] {
	const reference = `${deband ? `${DEBAND_FILTER},` : ""}${PAIR_BY_INDEX}`;

	return [
		"-hide_banner",
		"-nostats",
		"-i",
		sample,
		"-ss",
		start.toString(),
		"-t",
		length.toString(),
		"-i",
		input,
		"-lavfi",
		`[0:v]${PAIR_BY_INDEX}[d];[1:v]${reference}[r];[d][r]xpsnr`,
		"-f",
		"null",
		"-",
	];
}

/** Identical frames give an infinite XPSNR, capped to keep averages meaningful */
const XPSNR_CAP = 100;

export function parseXpsnr(stderr: string): number | null {
	const matches = [...stderr.matchAll(/XPSNR\s+y:\s*(inf|[\d.]+)/g)];
	const last = matches.at(-1);

	if (!last) return null;

	return last[1] === "inf" ? XPSNR_CAP : Math.min(Number.parseFloat(last[1]), XPSNR_CAP);
}

/**
 * Output path of an encode in progress, next to the source: `name_converted.mkv`.
 */
export function getConvertedFilePath(filePath: string): string {
	return `${stripExtension(filePath)}_converted.mkv`;
}

/**
 * Final path of a converted file: the source path with an `.mkv` extension.
 */
export function getFinalFilePath(filePath: string): string {
	return `${stripExtension(filePath)}.mkv`;
}

function stripExtension(filePath: string) {
	const separator = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
	const extensionIndex = filePath.lastIndexOf(".");
	return extensionIndex > separator ? filePath.substring(0, extensionIndex) : filePath;
}
