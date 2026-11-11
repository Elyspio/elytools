import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import type { EncoderSettings, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import {
	buildConvertArgs,
	buildPacketSizesArgs,
	buildSampleEncodeArgs,
	buildStatisticsArgs,
	computeVideoStatistics,
	buildSampleMetricArgs,
	clampXpsnrTarget,
	computeSamplePositions,
	DEBAND_FILTER,
	DEFAULT_ENCODER_SETTINGS,
	findAvailablePath,
	findOutputConflicts,
	getConvertedFilePath,
	getFinalFilePath,
	getMainVideoIndex,
	getTargetXpsnr,
	isFinalPathTaken,
	isVideoFile,
	analyzeProgressFraction,
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

/** Value following `flag` in an argument list */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

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

describe("getMainVideoIndex", () => {
	it("points past a cover picture stored first", () => {
		const source = probe({ codec_type: "audio", codec_name: "aac" }, { codec_type: "video", codec_name: "png", attached_pic: 1 }, { codec_type: "video", codec_name: "h264" });
		expect(getMainVideoIndex(source)).toBe(1);
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
	const range = { min: 22, max: 36 };

	const search = async (target: number, measure: (cq: number) => number) => {
		const measured: number[] = [];
		const result = await searchQuality(range, target, async (cq) => {
			measured.push(cq);
			return measure(cq);
		});
		return { result, measured };
	};

	it("returns the highest CQ reaching the target", async () => {
		const { result, measured } = await search(42, curve);

		expect(result).toEqual({ quality: 31, xpsnr: curve(31), targetReached: true });
		expect(measured.length).toBeLessThanOrEqual(3);
	});

	// Values logged for The Irregular at Magic High School S3 (target 42 dB)
	it.each([
		{ episode: "E01", values: { 29: 42.29, 30: 42.09, 31: 41.88, 33: 41.48 }, expected: 30 },
		{ episode: "E02", values: { 25: 42.44, 27: 42.13, 28: 41.97, 29: 41.81 }, expected: 27 },
		{ episode: "E03", values: { 22: 42.1, 23: 41.67, 25: 41.26, 29: 40.18 }, expected: 22 },
	])("finds the logged answer of $episode in three measures", async ({ values, expected }) => {
		const logged: Record<number, number | undefined> = values;
		const { result, measured } = await search(42, (cq) => {
			const xpsnr = logged[cq];
			if (xpsnr === undefined) throw new Error(`CQ ${cq} was not needed by the search`);
			return xpsnr;
		});

		expect(result.quality).toBe(expected);
		expect(measured).toHaveLength(3);
	});

	it("never measures a value twice and stays in the range on a curve far from the usual slope", async () => {
		for (const slope of [0.02, 0.6, 1.5]) {
			for (let answer = range.min; answer <= range.max; answer++) {
				const { result, measured } = await search(42, (cq) => 42 + (answer - cq) * slope);

				expect(result.quality).toBe(answer);
				expect(new Set(measured).size).toBe(measured.length);
				expect(measured.every((cq) => cq >= range.min && cq <= range.max)).toBe(true);
				expect(measured.length).toBeLessThanOrEqual(8);
			}
		}
	});

	it("falls back to the best quality when the target is out of reach", async () => {
		const { result } = await search(45, curve);

		expect(result.quality).toBe(22);
		expect(result.targetReached).toBe(false);
	});

	it("returns the smallest file when every value reaches the target", async () => {
		const { result } = await search(30, curve);

		expect(result.quality).toBe(36);
	});
});

describe("buildConvertArgs", () => {
	const settings: EncoderSettings = { ...DEFAULT_ENCODER_SETTINGS };
	const base: Omit<FfmpegConvertOptions, "settings" | "quality"> = { files: { input: "in.mp4", output: "out.mkv" }, subtitleCodecs: [], videoStreamIndex: 0 };

	it("keeps every stream, copies the rest and never forces the frame rate", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 30 });

		expect(args).toEqual(expect.arrayContaining(["0:v", "0:a?", "0:s?", "0:t?", "-map_chapters"]));
		expect(valueOf(args, "-c")).toBe("copy");
		expect(args).not.toContain("-r");
		expect(args.slice(-3)).toEqual(["-f", "matroska", "out.mkv"]);
	});

	it("encodes only the main video, past a cover picture", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 31, videoStreamIndex: 1 });

		expect(valueOf(args, "-c:v:1")).toBe("av1_nvenc");
		expect(valueOf(args, "-pix_fmt:v:1")).toBe("p010le");
		expect(valueOf(args, "-cq")).toBe("31");
		expect(args).not.toContain("-c:v");
	});

	it("passes a CRF and no NVENC option to SVT-AV1", () => {
		const args = buildConvertArgs({ ...base, settings: { ...settings, profile: "libsvtav1" }, quality: 26 });

		expect(valueOf(args, "-crf")).toBe("26");
		expect(args).not.toContain("-cq");
		expect(args).not.toContain("-tune");
	});

	it("clears the mkvmerge statistics of the encoded stream", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 30 });

		expect(args).toEqual(expect.arrayContaining(["-metadata:s:v:0", "BPS=", "NUMBER_OF_BYTES=", "BPS-eng="]));
	});

	it("copies every stream as is for a remux", () => {
		const args = buildConvertArgs({ ...base, settings: { ...settings, deband: true }, quality: null });

		expect(args.filter((arg) => arg.startsWith("-c:v") || arg.startsWith("-metadata"))).toEqual([]);
		expect(args).not.toContain(DEBAND_FILTER);
	});

	it("applies the deband filter to the main video only", () => {
		const args = buildConvertArgs({ ...base, settings: { ...settings, deband: true }, quality: 30, videoStreamIndex: 1 });

		expect(valueOf(args, "-filter:v:1")).toBe(DEBAND_FILTER);
		expect(args).not.toContain("-vf");
	});

	it("converts MP4 text subtitles to SRT", () => {
		const args = buildConvertArgs({ ...base, settings, quality: 30, subtitleCodecs: ["ass", "mov_text"] });

		expect(valueOf(args, "-c:s:1")).toBe("srt");
		expect(args).not.toContain("-c:s:0");
	});
});

describe("buildSampleMetricArgs", () => {
	const lavfi = (deband: boolean) => valueOf(buildSampleMetricArgs("s.mkv", "in.mkv", 120, deband), "-lavfi");

	it("debands the reference when the deband filter is enabled", () => {
		expect(lavfi(true)).toContain(`[1:v]${DEBAND_FILTER},`);
		expect(lavfi(false)).not.toContain("libplacebo");
	});

	it("gives both sides the same time base before pairing frames by index", () => {
		expect(lavfi(false).match(/settb=1\/24,setpts=N/g)).toHaveLength(2);
	});
});

const hasFfmpeg = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf-8" }).stdout?.includes("xpsnr") ?? false;

describe.skipIf(!hasFfmpeg)("XPSNR measure with ffmpeg", () => {
	it("scores a lossless MKV sample of an MP4 source as identical", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elytools-xpsnr-test-"));
		const source = path.join(dir, "source.mp4");
		const sample = path.join(dir, "sample.mkv");
		const run = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { encoding: "utf-8" });

		try {
			// 23.976 fps source in MP4 (1/24000 time base); the MKV sample uses 1/1000
			expect(run(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24000/1001:duration=8", "-c:v", "libx264", "-qp", "0", source]).status).toBe(0);
			const ffv1 = buildSampleEncodeArgs(source, sample, 1.5, DEFAULT_ENCODER_SETTINGS, 30).map((arg) => (arg === "av1_nvenc" ? "ffv1" : arg));
			const encoder = ffv1.indexOf("ffv1");
			// Lossless encoder in place of NVENC: only the codec and its pixel format are kept
			const args = [...ffv1.slice(0, encoder + 1), "-pix_fmt:v:0", "yuv420p", ...ffv1.slice(ffv1.indexOf("-an"))];
			expect(spawnSync("ffmpeg", args, { encoding: "utf-8" }).status).toBe(0);

			const metric = spawnSync("ffmpeg", buildSampleMetricArgs(sample, source, 1.5, false), { encoding: "utf-8" });

			expect(parseXpsnr(metric.stderr)).toBe(100);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
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

describe("quality target", () => {
	it("uses the preset target, or the custom value", () => {
		expect(getTargetXpsnr(DEFAULT_ENCODER_SETTINGS)).toBe(42);
		expect(getTargetXpsnr({ ...DEFAULT_ENCODER_SETTINGS, quality: "custom", customXpsnr: 41.5 })).toBe(41.5);
	});

	it("clamps a custom target typed halfway or out of range", () => {
		expect(getTargetXpsnr({ ...DEFAULT_ENCODER_SETTINGS, quality: "custom", customXpsnr: 4 })).toBe(35);
		expect(clampXpsnrTarget(120)).toBe(50);
		expect(clampXpsnrTarget(Number.NaN)).toBe(42);
	});
});

describe("output paths", () => {
	it("always outputs MKV", () => {
		expect(getFinalFilePath("W:\\Anime\\ep.01.mp4")).toBe("W:\\Anime\\ep.01.mkv");
		expect(getFinalFilePath("/media/v1.0/episode")).toBe("/media/v1.0/episode.mkv");
	});

	it("gives sources with the same base name different temporary outputs", () => {
		expect(getConvertedFilePath("W:/ep.mp4")).not.toBe(getConvertedFilePath("W:/ep.mkv"));
	});

	it("flags sources of the batch that would end at the same path", () => {
		const conflicts = findOutputConflicts(["W:\\ep.mp4", "W:\\EP.mkv", "W:\\ep2.mkv"]);

		expect([...conflicts.keys()]).toEqual(["W:\\ep.mp4", "W:\\EP.mkv"]);
		expect(conflicts.get("W:\\ep.mp4")).toContain("EP.mkv");
	});

	it("only lets an MKV source be replaced by its own conversion", () => {
		expect(isFinalPathTaken("W:/ep.mkv", true)).toBe(false);
		expect(isFinalPathTaken("W:/ep.mp4", true)).toBe(true);
		expect(isFinalPathTaken("W:/ep.mp4", false)).toBe(false);
	});

	it("never reuses the name of an archived original", async () => {
		const taken = new Set(["W:/old/ep.mkv", "W:/old/ep (2).mkv"]);

		expect(await findAvailablePath("W:/old/ep.mkv", async (p) => taken.has(p))).toBe("W:/old/ep (3).mkv");
		expect(await findAvailablePath("W:/old/ep2.mkv", async (p) => taken.has(p))).toBe("W:/old/ep2.mkv");
	});
});

describe("isVideoFile", () => {
	it("keeps video containers, whatever the case", () => {
		expect(isVideoFile("W:/Anime/S03E01 (CR).mkv")).toBe(true);
		expect(isVideoFile("W:/Anime/ep.MP4")).toBe(true);
		expect(isVideoFile("W:/Anime/ep.m2ts")).toBe(true);
	});

	it("leaves out the other files of a folder", () => {
		expect(isVideoFile("W:/Anime/S03E01 (CR)-poster.jpg")).toBe(false);
		expect(isVideoFile("W:/Anime/S03E01 (CR).nfo")).toBe(false);
		expect(isVideoFile("W:/Anime/S03E01.fr.srt")).toBe(false);
		expect(isVideoFile("W:/Anime.mkv/README")).toBe(false);
	});
});

describe("analysis progress", () => {
	const progress = { round: 2, expectedRounds: 3, quality: 33, samplesEncoded: 12, samplesMeasured: 6, samplesTotal: 12, trials: [] };

	it("counts each sample half when encoded, half when measured", () => {
		expect(analyzeProgressFraction(progress)).toBeCloseTo((1 + 18 / 24) / 3);
		expect(analyzeProgressFraction({ ...progress, round: 1, samplesEncoded: 0, samplesMeasured: 0 })).toBe(0);
	});

	it("stays within 0–1 when the search needs more rounds than usual", () => {
		expect(analyzeProgressFraction({ ...progress, round: 5, samplesMeasured: 12 })).toBe(1);
	});
});

describe("video statistics", () => {
	it("sums the packet sizes over the duration", () => {
		expect(computeVideoStatistics("1000\r\n3000\r\n\r\n", 2)).toEqual({ bps: 16000, bytes: 4000, frames: 2 });
		expect(computeVideoStatistics("", 2)).toBeNull();
		expect(computeVideoStatistics("1000", Number.NaN)).toBeNull();
	});

	it("tags the main video stream of the copy", () => {
		const args = buildStatisticsArgs("in.mkv", "out.mkv", 1, { bps: 2_500_000, bytes: 440_000_000, frames: 34_048 });
		expect(args).toEqual(expect.arrayContaining(["-map", "0", "-c", "copy", "-metadata:s:v:1", "BPS=2500000", "-metadata:s:v:1", "NUMBER_OF_FRAMES=34048"]));
		expect(args.slice(-3)).toEqual(["-f", "matroska", "out.mkv"]);
	});

	it.skipIf(!hasFfmpeg)("writes tags ffprobe reads back", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elytools-stats-test-"));
		try {
			const input = path.join(dir, "in.mkv");
			const output = path.join(dir, "out.mkv");
			const ffmpeg = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-v", "error", ...args], { encoding: "utf-8" });
			const ffprobe = (args: string[]) => spawnSync("ffprobe", args, { encoding: "utf-8" });

			expect(ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2", "-c:v", "libx264", input]).status).toBe(0);

			const statistics = computeVideoStatistics(ffprobe(buildPacketSizesArgs(input, 0)).stdout, 2);
			expect(statistics?.frames).toBe(48);

			expect(ffmpeg(buildStatisticsArgs(input, output, 0, statistics!)).status).toBe(0);
			const tags = ffprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=BPS,NUMBER_OF_FRAMES", "-of", "csv=p=0", output]).stdout.trim();
			expect(tags).toBe(`${statistics!.bps},48`);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
