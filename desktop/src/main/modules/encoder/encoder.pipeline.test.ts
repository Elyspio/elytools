import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import type { EncoderSettings, FfmpegAnalyzeResult, FileEncodeState } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import { DEFAULT_ENCODER_SETTINGS, getConvertedFilePath, getStatisticsFilePath } from "@shared/encoder/encoder.profiles";
import { expectedFrames, type PipelineFs, type PipelineOptions, type PipelineTools, replaceOriginal, runEncoderPipeline } from "./encoder.pipeline";

const dir = path.join("media", "show");
const file = (name: string) => path.join(dir, name);
const old = (name: string) => path.join(dir, "old", name);

/** In-memory file system: path → size */
class MemoryFs implements PipelineFs {
	public readonly files = new Map<string, number>();
	/** Moves to these paths fail */
	public readonly locked = new Set<string>();

	public constructor(files: Record<string, number>) {
		for (const [name, size] of Object.entries(files)) this.files.set(name, size);
	}

	async stat(target: string) {
		const size = this.files.get(target);
		return size === undefined ? null : { size, mtimeMs: 1 };
	}

	async mkdir() {}

	async move(from: string, to: string) {
		const size = this.files.get(from);
		if (size === undefined) throw new Error(`ENOENT ${from}`);
		if (this.locked.has(to)) throw new Error(`EBUSY ${to}`);
		this.files.delete(from);
		this.files.set(to, size);
	}

	async remove(target: string) {
		this.files.delete(target);
	}

	public names() {
		return [...this.files.keys()].sort();
	}
}

function probe(codec: string): FfprobeResult {
	return {
		format: { duration: "1420" },
		streams: [
			{ codec_type: "video", codec_name: codec, avg_frame_rate: "24000/1001", disposition: { attached_pic: 0 } },
			{ codec_type: "audio", codec_name: "aac" },
		],
	} as unknown as FfprobeResult;
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

/** Lets the pipeline run until it waits for something the test controls */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

type Harness = {
	fs: MemoryFs;
	states: Record<string, FileEncodeState>;
	events: string[];
	run: (overrides?: Partial<PipelineOptions>) => Promise<void>;
	controller: AbortController;
	cache: Map<string, FfmpegAnalyzeResult>;
};

type HarnessOptions = {
	files: Record<string, number>;
	codecs?: Record<string, string>;
	settings?: EncoderSettings;
	/** Size written by a conversion, by source name (default: a third of the source) */
	outputSizes?: Record<string, number>;
	tools?: Partial<PipelineTools>;
};

function harness({ files, codecs = {}, settings = DEFAULT_ENCODER_SETTINGS, outputSizes = {}, tools = {} }: HarnessOptions): Harness {
	const fs = new MemoryFs(Object.fromEntries(Object.entries(files).map(([name, size]) => [file(name), size])));
	const states: Record<string, FileEncodeState> = {};
	const events: string[] = [];
	const controller = new AbortController();
	const cache = new Map<string, FfmpegAnalyzeResult>();
	const name = (target: string) => path.basename(target);

	const defaults: PipelineTools = {
		probe: async (target) => probe(codecs[name(target)] ?? "h264"),
		analyze: async (opts) => {
			events.push(`analyze ${name(opts.input)}`);
			return { quality: 30, xpsnr: 42.1, targetReached: true, samples: 12 };
		},
		convert: async (opts) => {
			events.push(`convert ${name(opts.files.input)}`);
			const source = name(opts.files.input);
			fs.files.set(opts.files.output, outputSizes[source] ?? Math.round((files[source] ?? 0) / 3));
			events.push(`converted ${source}`);
		},
		writeStatistics: async (target) => {
			events.push(`statistics ${name(target)}`);
		},
	};

	return {
		fs,
		states,
		events,
		controller,
		cache,
		run: (overrides = {}) =>
			runEncoderPipeline({
				paths: Object.keys(files).map(file),
				settings,
				signal: controller.signal,
				fs,
				tools: { ...defaults, ...tools },
				analysisCache: cache,
				update: (target, state) => {
					states[name(target)] = { ...(states[name(target)] ?? { phase: "pending" }), ...state };
				},
				now: () => 1000,
				...overrides,
			}),
	};
}

describe("replaceOriginal", () => {
	it("archives the original in old/ and puts the converted file in its place, as .mkv", async () => {
		const fs = new MemoryFs({ [file("ep.mp4")]: 900, [file("ep.mp4.elytools-tmp.mkv")]: 300 });

		await replaceOriginal(fs, file("ep.mp4"), file("ep.mp4.elytools-tmp.mkv"));

		expect(fs.names()).toEqual([file("ep.mkv"), old("ep.mp4")].sort());
		expect(fs.files.get(file("ep.mkv"))).toBe(300);
	});

	it("never overwrites an original already archived", async () => {
		const fs = new MemoryFs({ [file("ep.mkv")]: 900, [file("out.mkv")]: 300, [old("ep.mkv")]: 5, [old("ep (2).mkv")]: 6 });

		await replaceOriginal(fs, file("ep.mkv"), file("out.mkv"));

		expect(fs.files.get(old("ep.mkv"))).toBe(5);
		expect(fs.files.get(old("ep (2).mkv"))).toBe(6);
		expect(fs.files.get(old("ep (3).mkv"))).toBe(900);
		expect(fs.files.get(file("ep.mkv"))).toBe(300);
	});

	it("puts the original back when the converted file cannot take its place", async () => {
		const fs = new MemoryFs({ [file("ep.mkv")]: 900, [file("out.mkv")]: 300 });
		fs.locked.add(file("ep.mkv"));
		// The archive move must work, the final one must fail
		const move = fs.move.bind(fs);
		fs.move = async (from, to) => {
			if (to === file("ep.mkv") && from === file("out.mkv")) throw new Error("EBUSY");
			fs.locked.clear();
			await move(from, to);
		};

		await expect(replaceOriginal(fs, file("ep.mkv"), file("out.mkv"))).rejects.toThrow("EBUSY");

		expect(fs.files.get(file("ep.mkv"))).toBe(900);
		expect(fs.files.get(file("out.mkv"))).toBe(300);
		expect(fs.files.has(old("ep.mkv"))).toBe(false);
	});

	it("moves nothing when another file took the final name during the encode", async () => {
		const fs = new MemoryFs({ [file("ep.mp4")]: 900, [file("out.mkv")]: 300, [file("ep.mkv")]: 42 });

		await expect(replaceOriginal(fs, file("ep.mp4"), file("out.mkv"))).rejects.toThrow("appeared during the encode");

		expect(fs.names()).toEqual([file("ep.mkv"), file("ep.mp4"), file("out.mkv")].sort());
	});
});

describe("runEncoderPipeline", () => {
	it("encodes, remuxes and skips each file according to its source", async () => {
		const h = harness({
			files: { "h264.mkv": 900, "hevc.mkv": 500, "av1.mp4": 400, "pair.mkv": 100, "pair.mp4": 100, "small.mkv": 90 },
			codecs: { "hevc.mkv": "hevc", "av1.mp4": "av1" },
			outputSizes: { "av1.mp4": 399, "small.mkv": 95 },
		});

		await h.run();

		expect(h.states["h264.mkv"]).toMatchObject({ phase: "done", size: 900, outputSize: 300, quality: 30, samples: 12, progress: 1 });
		expect(h.states["hevc.mkv"]).toMatchObject({ phase: "skipped", note: "Already HEVC in MKV" });
		expect(h.states["av1.mp4"]).toMatchObject({ phase: "done", outputSize: 399, note: "AV1 source, copied into MKV" });
		expect(h.states["pair.mkv"]).toMatchObject({ phase: "skipped", note: "Same output name as pair.mp4" });
		expect(h.states["pair.mp4"].phase).toBe("skipped");
		expect(h.states["small.mkv"]).toMatchObject({ phase: "skipped", note: "Larger than the source, original kept" });

		expect(h.fs.names()).toEqual(
			[file("h264.mkv"), file("hevc.mkv"), file("av1.mkv"), file("pair.mkv"), file("pair.mp4"), file("small.mkv"), old("h264.mkv"), old("av1.mp4")].sort()
		);
		expect(h.fs.files.get(file("small.mkv"))).toBe(90);
	});

	it("analyzes only what it encodes, and writes statistics only for the encodes it keeps", async () => {
		const h = harness({
			files: { "h264.mkv": 900, "av1.mp4": 400, "small.mkv": 90 },
			codecs: { "av1.mp4": "av1" },
			outputSizes: { "small.mkv": 95 },
		});

		await h.run();

		expect(h.events.filter((e) => e.startsWith("analyze"))).toEqual(["analyze h264.mkv", "analyze small.mkv"]);
		expect(h.events.filter((e) => e.startsWith("statistics"))).toEqual(["statistics h264.mkv.elytools-tmp.mkv"]);
	});

	it("starts encoding the first file before the last one is analyzed", async () => {
		const h = harness({ files: { "e1.mkv": 900, "e2.mkv": 900, "e3.mkv": 900, "e4.mkv": 900, "e5.mkv": 900 } });

		await h.run();

		expect(h.events.indexOf("convert e1.mkv")).toBeLessThan(h.events.indexOf("analyze e5.mkv"));
		expect(Object.values(h.states).every((state) => state.phase === "done")).toBe(true);
	});

	it("keeps the analysis at most three files ahead of the encoders", async () => {
		const gate = deferred();
		const h = harness({
			files: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`e${i}.mkv`, 900])),
			tools: {
				convert: async (opts) => {
					await gate.promise;
					h.fs.files.set(opts.files.output, 300);
				},
			},
		});

		const run = h.run();
		await settle();

		// 3 files are encoding (blocked), 3 more are analyzed and wait for an encoder
		expect(h.events.filter((e) => e.startsWith("analyze"))).toHaveLength(6);

		gate.resolve();
		await run;
		expect(Object.values(h.states).every((state) => state.phase === "done")).toBe(true);
	});

	it("alternates analysis and encode for a CPU encoder", async () => {
		const h = harness({ files: { "e1.mkv": 900, "e2.mkv": 900, "e3.mkv": 900 }, settings: { ...DEFAULT_ENCODER_SETTINGS, profile: "libsvtav1" } });

		await h.run();

		expect(h.events.filter((e) => !e.startsWith("statistics") && !e.startsWith("convert "))).toEqual([
			"analyze e1.mkv",
			"converted e1.mkv",
			"analyze e2.mkv",
			"converted e2.mkv",
			"analyze e3.mkv",
			"converted e3.mkv",
		]);
	});

	it("gives the encodes and the analysis samples the same session budget", async () => {
		const gate = deferred();
		let freeForSamples = -1;

		const h = harness({
			files: { "e1.mkv": 900, "e2.mkv": 900 },
			tools: {
				convert: async (opts) => {
					await gate.promise;
					h.fs.files.set(opts.files.output, 300);
				},
				analyze: async (opts, { sessions }) => {
					if (path.basename(opts.input) === "e2.mkv") {
						// e1 is encoding: count the sessions a round of samples can take at once
						await settle();
						const taken: (() => void)[] = [];
						for (let i = 0; i < 12; i++) void sessions!.acquire().then((release) => taken.push(release));
						await settle();
						freeForSamples = taken.length;
						for (const release of taken) release();
					}
					return { quality: 30, xpsnr: 42.1, targetReached: true, samples: 12 };
				},
			},
		});

		const run = h.run();
		await settle();
		await settle();
		await settle();
		gate.resolve();
		await run;

		expect(freeForSamples).toBe(11);
	});

	it("does not analyze again a file measured by an earlier run", async () => {
		const first = harness({ files: { "e1.mkv": 900 }, tools: { convert: async () => Promise.reject(new Error("disk full")) } });
		await first.run();
		expect(first.states["e1.mkv"]).toMatchObject({ phase: "failed", note: "disk full", quality: 30 });

		const analyses: string[] = [];
		await first.run({
			tools: {
				probe: async () => probe("h264"),
				analyze: async (opts) => {
					analyses.push(opts.input);
					return { quality: 1, xpsnr: 1, targetReached: true, samples: 1 };
				},
				convert: async (opts) => {
					first.fs.files.set(opts.files.output, 300);
				},
				writeStatistics: async () => {},
			},
		});

		expect(analyses).toEqual([]);
		expect(first.states["e1.mkv"]).toMatchObject({ phase: "done", quality: 30 });
	});

	it("keeps the converted file when its statistics cannot be written", async () => {
		const warnings: string[] = [];
		const h = harness({ files: { "e1.mkv": 900 }, tools: { writeStatistics: async () => Promise.reject(new Error("no ffprobe")) } });

		await h.run({ warn: (message) => warnings.push(message) });

		expect(h.states["e1.mkv"].phase).toBe("done");
		expect(h.fs.files.get(file("e1.mkv"))).toBe(300);
		expect(warnings).toHaveLength(1);
	});

	it("removes the temporary files a crashed run left for a file", async () => {
		const tmp = getConvertedFilePath(file("hevc.mkv"));
		const h = harness({ files: { "hevc.mkv": 500 }, codecs: { "hevc.mkv": "hevc" } });
		h.fs.files.set(tmp, 123);
		h.fs.files.set(getStatisticsFilePath(tmp), 123);

		await h.run();

		expect(h.fs.names()).toEqual([file("hevc.mkv")]);
	});

	it("stops everything on a cancel: partial output removed, originals untouched, files marked cancelled", async () => {
		const h = harness({
			files: { "e1.mkv": 900, "e2.mkv": 900, "e3.mkv": 900, "e4.mkv": 900, "e5.mkv": 900 },
			tools: {
				convert: (opts, { signal }) =>
					new Promise<void>((_, reject) => {
						h.fs.files.set(opts.files.output, 10);
						signal.addEventListener("abort", () => reject(new Error("killed")));
					}),
			},
		});

		const run = h.run();
		await settle();
		h.controller.abort();
		await run;

		expect(Object.values(h.states).map((state) => state.phase)).toEqual(["aborted", "aborted", "aborted", "aborted", "aborted"]);
		expect(h.fs.names()).toEqual(["e1.mkv", "e2.mkv", "e3.mkv", "e4.mkv", "e5.mkv"].map(file).sort());
	});

	it("keeps a file whose conversion finished just before the cancel", async () => {
		const h = harness({
			files: { "e1.mkv": 900 },
			tools: {
				convert: async (opts) => {
					h.fs.files.set(opts.files.output, 300);
					h.controller.abort();
				},
			},
		});

		await h.run();

		expect(h.states["e1.mkv"]).toMatchObject({ phase: "done", outputSize: 300 });
		expect(h.fs.names()).toEqual([file("e1.mkv"), old("e1.mkv")].sort());
		expect(h.events.filter((e) => e.startsWith("statistics"))).toEqual([]);
	});

	it("reports the failure of one file and goes on with the others", async () => {
		const h = harness({
			files: { "e1.mkv": 900, "e2.mkv": 900 },
			tools: {
				analyze: async (opts) => {
					if (path.basename(opts.input) === "e1.mkv") throw new Error("GPU encoder busy");
					return { quality: 28, xpsnr: 42, targetReached: true, samples: 12 };
				},
			},
		});

		await h.run();

		expect(h.states["e1.mkv"]).toMatchObject({ phase: "failed", note: "GPU encoder busy" });
		expect(h.states["e2.mkv"]).toMatchObject({ phase: "done", quality: 28 });
	});
});

describe("expectedFrames", () => {
	it("multiplies the duration by the frame rate of the main video", () => {
		expect(expectedFrames(probe("h264"))).toBe(Math.floor((1420 * 24000) / 1001));
	});

	it("is 0 when the frame rate is unknown", () => {
		expect(expectedFrames({ format: { duration: "10" }, streams: [] } as unknown as FfprobeResult)).toBe(0);
	});
});
