import { describe, expect, it } from "vite-plus/test";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import type { EncoderSettings } from "@shared/types/ffmpeg.types";
import {
	buildConvertArgs,
	buildSampleMetricArgs,
	computeSamplePositions,
	DEBAND_FILTER,
	DEFAULT_ENCODER_SETTINGS,
	getConvertedFilePath,
	getFinalFilePath,
	getTargetXpsnr,
	parseXpsnr,
	planSource,
	SAMPLE_EDGE_SKIP,
	searchQuality,
} from "./encoder.profiles";

function probe(...streams: { codec_type: string; codec_name: string; attached_pic?: number }[]): FfprobeResult {
	return {
		streams: streams.map((s) => ({ codec_type: s.codec_type, codec_name: s.codec_name, disposition: { attached_pic: s.attached_pic ?? 0 } })),
	} as unknown as FfprobeResult;
}

describe("planSource", () => {
	it("encodes an H.264 source", () => {
		expect(planSource(probe({ codec_type: "video", codec_name: "h264" }), "W:/a.mkv")).toEqual({ action: "encode" });
	});

	it("skips an HEVC source already in MKV", () => {
		expect(planSource(probe({ codec_type: "video", codec_name: "hevc" }), "W:/a.MKV").action).toBe("skip");
	});

	it("remuxes an AV1 source that is not in MKV", () => {
		expect(planSource(probe({ codec_type: "video", codec_name: "av1" }), "W:/a.mp4").action).toBe("remux");
	});

	it("ignores a cover picture when finding the video stream", () => {
		const source = probe({ codec_type: "video", codec_name: "mjpeg", attached_pic: 1 }, { codec_type: "video", codec_name: "hevc" });
		expect(planSource(source, "W:/a.mp4").action).toBe("remux");
	});

	it("skips a file without video", () => {
		expect(planSource(probe({ codec_type: "audio", codec_name: "aac" }), "W:/a.mka").action).toBe("skip");
	});
});

describe("computeSamplePositions", () => {
	it("spreads samples between the opening and the ending of an episode", () => {
		const positions = computeSamplePositions(1420, 12);

		expect(positions).toHaveLength(12);
		expect(positions[0]).toBeGreaterThanOrEqual(SAMPLE_EDGE_SKIP);
		expect(positions.at(-1)! + 6).toBeLessThanOrEqual(1420 - SAMPLE_EDGE_SKIP);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	it("uses the whole duration of a short clip", () => {
		const positions = computeSamplePositions(60, 12);

		expect(positions).toHaveLength(10);
		expect(positions[0]).toBeLessThan(SAMPLE_EDGE_SKIP);
	});

	it("returns no sample for an unknown duration", () => {
		expect(computeSamplePositions(Number.NaN, 12)).toEqual([]);
	});
});

describe("searchQuality", () => {
	// Measured on S03E04 with av1_nvenc: 22 → 43.5 dB, 30 → 42.2 dB, 34 → 41.5 dB
	const curve = (cq: number) => 47 - cq * 0.16;

	it("returns the highest CQ reaching the target", async () => {
		const measured: number[] = [];
		const result = await searchQuality({ min: 22, max: 36 }, 42, async (cq) => {
			measured.push(cq);
			return curve(cq);
		});

		expect(result).toEqual({ quality: 31, xpsnr: curve(31), targetReached: true });
		expect(measured.length).toBeLessThanOrEqual(4);
	});

	it("falls back to the best quality when the target is out of reach", async () => {
		const result = await searchQuality({ min: 22, max: 36 }, 45, async (cq) => curve(cq));

		expect(result.quality).toBe(22);
		expect(result.targetReached).toBe(false);
	});

	it("returns the smallest file when every value reaches the target", async () => {
		const result = await searchQuality({ min: 22, max: 36 }, 30, async (cq) => curve(cq));

		expect(result.quality).toBe(36);
	});
});

describe("buildConvertArgs", () => {
	const settings: EncoderSettings = { ...DEFAULT_ENCODER_SETTINGS };
	const base = { files: { input: "in.mp4", output: "out.mkv" }, subtitleCodecs: [] as string[] };

	it("keeps every stream, copies audio and never forces the frame rate", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 30 });

		expect(args).toEqual(expect.arrayContaining(["0:a?", "0:s?", "0:t?", "-map_chapters"]));
		expect(args.slice(args.indexOf("-c"), args.indexOf("-c") + 2)).toEqual(["-c", "copy"]);
		expect(args).not.toContain("-r");
		expect(args.slice(-3)).toEqual(["-f", "matroska", "out.mkv"]);
	});

	it("passes the CQ to NVENC", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 31 });

		expect(args.slice(args.indexOf("-cq"), args.indexOf("-cq") + 2)).toEqual(["-cq", "31"]);
		expect(args).toContain("av1_nvenc");
	});

	it("passes a CRF and no NVENC option to SVT-AV1", () => {
		const args = buildConvertArgs({ ...base, settings: { ...settings, profile: "libsvtav1" }, quality: 26 });

		expect(args.slice(args.indexOf("-crf"), args.indexOf("-crf") + 2)).toEqual(["-crf", "26"]);
		expect(args).not.toContain("-cq");
		expect(args).not.toContain("-tune");
	});

	it("copies the video stream for a remux", () => {
		const args = buildConvertArgs({ ...base, settings: { ...settings, deband: true }, quality: null });

		expect(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2)).toEqual(["-c:v", "copy"]);
		expect(args).not.toContain(DEBAND_FILTER);
	});

	it("adds the deband filter when enabled", () => {
		expect(buildConvertArgs({ ...base, settings: { ...settings, deband: true }, quality: 30 })).toContain(DEBAND_FILTER);
	});

	it("converts MP4 text subtitles to SRT", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 30, subtitleCodecs: ["ass", "mov_text"] });

		expect(args).toEqual(expect.arrayContaining(["-c:s:1", "srt"]));
		expect(args).not.toContain("-c:s:0");
	});
});

describe("buildSampleMetricArgs", () => {
	it("debands the reference when the deband filter is enabled", () => {
		const lavfi = (deband: boolean) => {
			const args = buildSampleMetricArgs("s.mkv", "in.mkv", 120, deband);
			return args[args.indexOf("-lavfi") + 1];
		};

		expect(lavfi(true)).toContain(`[1:v]${DEBAND_FILTER},`);
		expect(lavfi(false)).not.toContain("libplacebo");
	});

	it("pairs frames by index, not by rounded MKV timestamps", () => {
		const args = buildSampleMetricArgs("s.mkv", "in.mkv", 120, false);

		expect(args[args.indexOf("-lavfi") + 1].match(/setpts=N\/\(24\*TB\)/g)).toHaveLength(2);
	});
});

describe("parseXpsnr", () => {
	it("reads the luma score of the summary line", () => {
		expect(parseXpsnr("[Parsed_xpsnr_4 @ 0x1] XPSNR  y: 42.1951  u: 44.3165  v: 44.3330  (minimum: 42.1951)")).toBe(42.1951);
	});

	it("caps identical frames", () => {
		expect(parseXpsnr("XPSNR  y: inf  u: inf  v: inf")).toBe(100);
	});

	it("returns null without a score", () => {
		expect(parseXpsnr("Error opening input")).toBeNull();
	});
});

describe("quality target and paths", () => {
	it("uses the preset target, or the custom value", () => {
		expect(getTargetXpsnr(DEFAULT_ENCODER_SETTINGS)).toBe(42);
		expect(getTargetXpsnr({ ...DEFAULT_ENCODER_SETTINGS, quality: "custom", customXpsnr: 41.5 })).toBe(41.5);
	});

	it("always outputs MKV", () => {
		expect(getConvertedFilePath("W:\\Anime\\ep.01.mp4")).toBe("W:\\Anime\\ep.01_converted.mkv");
		expect(getFinalFilePath("W:\\Anime\\ep.01.mp4")).toBe("W:\\Anime\\ep.01.mkv");
		expect(getFinalFilePath("/media/v1.0/episode")).toBe("/media/v1.0/episode.mkv");
	});
});
