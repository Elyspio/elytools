import type { EncoderProfileId, EncoderSettings, FfmpegAnalyzeProgress, FfmpegConvertOptions, QualityPresetId, SourcePlan } from "@shared/types/ffmpeg.types";
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
	/** Encoder sessions the driver allows at once, shared by the encodes and the analysis samples; null without a limit */
	sessionLimit: number | null;
	/**
	 * How the analysis and the encodes share the machine. "overlap": the next files are analyzed while others encode
	 * (GPU). "alternate": a file is analyzed, then encoded, then the next one (both stages use every CPU core).
	 */
	pipeline: "overlap" | "alternate";
	/** Encoder arguments for the video stream designated by `stream` (e.g. `v:0`) */
	videoArgs: (quality: number, stream: string) => string[];
};

const nvencArgs = (codec: string, extra: (stream: string) => string[]) => (quality: number, stream: string) => [
	`-c:${stream}`,
	codec,
	"-preset",
	"p7",
	"-tune",
	"uhq",
	"-rc",
	"vbr",
	"-cq",
	quality.toString(),
	`-b:${stream}`,
	"0",
	`-pix_fmt:${stream}`,
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
	...extra(stream),
];

/** Concurrent NVENC sessions allowed by the NVIDIA driver */
export const NVENC_SESSION_LIMIT = 12;

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
		sessionLimit: NVENC_SESSION_LIMIT,
		pipeline: "overlap",
		videoArgs: nvencArgs("av1_nvenc", () => []),
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
		sessionLimit: NVENC_SESSION_LIMIT,
		pipeline: "overlap",
		videoArgs: nvencArgs("hevc_nvenc", (stream) => [`-profile:${stream}`, "main10"]),
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
		sessionLimit: null,
		pipeline: "alternate",
		videoArgs: (quality, stream) => [
			`-c:${stream}`,
			"libsvtav1",
			"-preset",
			"4",
			"-crf",
			quality.toString(),
			`-pix_fmt:${stream}`,
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

/** Accepted custom targets: below, any CQ passes; above, none does */
export const XPSNR_TARGET_RANGE = { min: 35, max: 50 };

export function clampXpsnrTarget(value: number): number {
	if (!Number.isFinite(value)) return QUALITY_PRESETS.standard.xpsnr;
	return Math.min(XPSNR_TARGET_RANGE.max, Math.max(XPSNR_TARGET_RANGE.min, value));
}

export function getTargetXpsnr(settings: EncoderSettings): number {
	return settings.quality === "custom" ? clampXpsnrTarget(settings.customXpsnr) : QUALITY_PRESETS[settings.quality].xpsnr;
}

export function getMainVideoStream(probe: FfprobeResult) {
	return probe.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
}

/**
 * Index of the main video among every video stream (cover pictures included), as used by `v:N` specifiers.
 */
export function getMainVideoIndex(probe: FfprobeResult): number {
	const main = getMainVideoStream(probe);
	return Math.max(
		0,
		probe.streams.filter((s) => s.codec_type === "video").findIndex((s) => s === main)
	);
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

/** Rounds the search usually needs: a first measure, the predicted value, then its neighbour as a check */
export const EXPECTED_SEARCH_ROUNDS = 3;

/** XPSNR lost per step of CQ/CRF, as measured on anime sources (0.16 to 0.20 dB); used until two measures exist */
const DEFAULT_QUALITY_SLOPE = 0.18;

/** Predicted rounds before falling back to halving the range, so a source off the usual curve still ends quickly */
const PREDICTED_ROUNDS = 4;

/** Share of an analysis done (0–1): every sample counts half when encoded, half when measured */
export function analyzeProgressFraction(progress: FfmpegAnalyzeProgress): number {
	const rounds = Math.max(progress.expectedRounds, progress.round);
	const roundShare = progress.samplesTotal > 0 ? (progress.samplesEncoded + progress.samplesMeasured) / (2 * progress.samplesTotal) : 0;
	return Math.min(1, (progress.round - 1 + roundShare) / rounds);
}

/**
 * Finds the highest quality value (smallest file) whose XPSNR still reaches the target.
 *
 * XPSNR decreases almost linearly when the quality value increases: after the first measure (middle of the range),
 * the next value is predicted from the measures so far instead of halving the range. A typical source needs three
 * measures: the middle, the predicted value, and its neighbour to confirm it is the last one reaching the target.
 */
export async function searchQuality(range: { min: number; max: number }, target: number, measure: (quality: number) => Promise<number>): Promise<QualitySearchResult> {
	const measures = new Map<number, number>();
	const measureOnce = async (quality: number) => {
		if (!measures.has(quality)) measures.set(quality, await measure(quality));
		return measures.get(quality)!;
	};

	let low = range.min;
	let high = range.max;
	let best: QualitySearchResult | null = null;
	let probe = Math.floor((low + high) / 2);

	while (low <= high) {
		const xpsnr = await measureOnce(probe);

		if (xpsnr >= target) {
			best = { quality: probe, xpsnr, targetReached: true };
			low = probe + 1;
		} else {
			high = probe - 1;
		}

		if (low > high) break;

		const predicted = measures.size < PREDICTED_ROUNDS ? predictQuality(measures, target) : Math.floor((low + high) / 2);
		probe = Math.min(high, Math.max(low, predicted));
	}

	return best ?? { quality: range.min, xpsnr: await measureOnce(range.min), targetReached: false };
}

/**
 * Highest quality value expected to reach the target, from the line through the two measures closest to it
 * (or the default slope with a single measure).
 */
function predictQuality(measures: Map<number, number>, target: number): number {
	const closest = [...measures].sort((a, b) => Math.abs(a[1] - target) - Math.abs(b[1] - target));
	const [quality, xpsnr] = closest[0];
	let slope = DEFAULT_QUALITY_SLOPE;

	if (closest.length > 1) {
		const [otherQuality, otherXpsnr] = closest[1];
		const measured = (otherXpsnr - xpsnr) / (quality - otherQuality);
		// A flat or inverted pair (noise between close values) would send the prediction far away
		if (Number.isFinite(measured)) slope = Math.min(0.5, Math.max(0.05, measured));
	}

	// The epsilon keeps a prediction landing exactly on a value from being rounded down by floating point error
	return Math.floor(quality + (xpsnr - target) / slope + 1e-6);
}

/** Every video (cover pictures included), audio, subtitle and attachment (fonts) stream. Data streams cannot go in MKV. */
const MAP_ARGS = ["-map", "0:v", "-map", "0:a?", "-map", "0:s?", "-map", "0:t?", "-map_metadata", "0", "-map_chapters", "0"];

/**
 * Statistics written by mkvmerge describe the source stream: once copied, Jellyfin would report the
 * bitrate of the source for the encoded stream. Tags carry a language suffix when mkvmerge set one.
 */
const SOURCE_STATISTICS_TAGS = ["BPS", "NUMBER_OF_BYTES", "NUMBER_OF_FRAMES", "_STATISTICS_TAGS", "_STATISTICS_WRITING_APP", "_STATISTICS_WRITING_DATE_UTC"];

/** Video statistics written in the output, read by Windows Explorer ("Data rate") and Jellyfin like the mkvmerge ones */
export type VideoStatistics = {
	/** Mean bitrate, in bits per second */
	bps: number;
	bytes: number;
	frames: number;
};

/** ffprobe arguments listing the packet sizes of a video stream, one per line */
export function buildPacketSizesArgs(input: string, videoStreamIndex: number): string[] {
	return ["-v", "error", "-select_streams", `v:${videoStreamIndex}`, "-show_entries", "packet=size", "-of", "csv=p=0", input];
}

/**
 * Statistics of a video stream from its packet sizes (ffprobe csv output) and the duration of the file, in seconds
 */
export function computeVideoStatistics(packetSizes: string, duration: number): VideoStatistics | null {
	const sizes = packetSizes
		.split(/\r?\n/)
		.map((line) => Number.parseInt(line, 10))
		.filter((size) => Number.isFinite(size));
	if (sizes.length === 0 || !(duration > 0)) return null;

	const bytes = sizes.reduce((acc, size) => acc + size, 0);
	return { bps: Math.round((bytes * 8) / duration), bytes, frames: sizes.length };
}

/** Temporary copy written while the statistics tags are added */
export function getStatisticsFilePath(filePath: string): string {
	return `${filePath}.stats.mkv`;
}

/** mkvpropedit (MKVToolNix) computes and writes the statistics tags of every track in place, without a copy */
export function buildMkvpropeditArgs(file: string): string[] {
	return [file, "--add-track-statistics-tags"];
}

/**
 * Copy of a converted file with the statistics tags of its video stream (ffmpeg does not write them)
 */
export function buildStatisticsArgs(input: string, output: string, videoStreamIndex: number, statistics: VideoStatistics): string[] {
	const stream = `-metadata:s:v:${videoStreamIndex}`;
	const tags = {
		BPS: statistics.bps,
		NUMBER_OF_BYTES: statistics.bytes,
		NUMBER_OF_FRAMES: statistics.frames,
		_STATISTICS_TAGS: "BPS DURATION NUMBER_OF_FRAMES NUMBER_OF_BYTES",
		_STATISTICS_WRITING_APP: "Elytools",
	};
	return ["-hide_banner", "-y", "-i", input, "-map", "0", "-c", "copy", ...Object.entries(tags).flatMap(([tag, value]) => [stream, `${tag}=${value}`]), "-f", "matroska", output];
}

/**
 * Full conversion: keeps every stream, encodes the main video only, copies everything else, outputs MKV.
 * The source frame rate is kept.
 */
export function buildConvertArgs(opts: FfmpegConvertOptions): string[] {
	const profile = ENCODER_PROFILES[opts.settings.profile];
	const stream = `v:${opts.videoStreamIndex}`;

	const video =
		opts.quality === null
			? []
			: [
					...(opts.settings.deband ? [`-filter:${stream}`, DEBAND_FILTER] : []),
					...profile.videoArgs(opts.quality, stream),
					...SOURCE_STATISTICS_TAGS.flatMap((tag) => [`-metadata:s:${stream}`, `${tag}=`, `-metadata:s:${stream}`, `${tag}-eng=`]),
				];

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
		...profile.videoArgs(quality, "v:0"),
		"-an",
		"-sn",
		"-dn",
		"-f",
		"matroska",
		output,
	];
}

/**
 * MKV timestamps are rounded to the millisecond (41 or 42 ms per frame at 23.976 fps), and the sample and the
 * source may use different time bases: pairing frames by timestamp shifts frames. Both sides get the same
 * time base and a timestamp equal to the frame index.
 */
const PAIR_BY_INDEX = "settb=1/24,setpts=N,format=yuv420p10le";

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
 * Output path of an encode in progress, next to the source. It keeps the source extension, so two sources
 * with the same base name (`ep.mp4`, `ep.mkv`) never share it.
 */
export function getConvertedFilePath(filePath: string): string {
	return `${filePath}.elytools-tmp.mkv`;
}

/** Video containers the encoder accepts: other files of a folder (.nfo, posters, subtitles…) are left out */
export const VIDEO_EXTENSIONS = new Set(["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mts", "wmv", "flv", "mpg", "mpeg", "ogv", "3gp"]);

export function isVideoFile(filePath: string): boolean {
	const extension = /\.([^./\\]+)$/.exec(filePath)?.[1]?.toLowerCase();
	return extension !== undefined && VIDEO_EXTENSIONS.has(extension);
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

const samePath = (a: string, b: string) => a.replaceAll("\\", "/").toLowerCase() === b.replaceAll("\\", "/").toLowerCase();

/**
 * Sources of the batch that would end at the same final path (`ep.mp4` and `ep.mkv` both give `ep.mkv`),
 * mapped to the reason they are left untouched.
 */
export function findOutputConflicts(paths: string[]): Map<string, string> {
	const conflicts = new Map<string, string>();

	for (const path of paths) {
		const others = paths.filter((other) => other !== path && samePath(getFinalFilePath(other), getFinalFilePath(path)));
		if (others.length > 0) conflicts.set(path, `Same output name as ${others.map(basename).join(", ")}`);
	}

	return conflicts;
}

/**
 * Whether the converted file would replace another file than its own source.
 */
export function isFinalPathTaken(source: string, exists: boolean): boolean {
	return exists && !samePath(getFinalFilePath(source), source);
}

/**
 * First free path among `name.ext`, `name (2).ext`, `name (3).ext`… (an archived original is never overwritten).
 */
export async function findAvailablePath(path: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
	const base = stripExtension(path);
	const extension = path.substring(base.length);

	for (let index = 1; ; index++) {
		const candidate = index === 1 ? path : `${base} (${index})${extension}`;
		if (!(await exists(candidate))) return candidate;
	}
}

export function basename(filePath: string) {
	return filePath.substring(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
}
