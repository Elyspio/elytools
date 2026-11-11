import { LogModule } from "@main/modules/log.module";
import { log } from "@main/utils/logs.utils";
import { inject, injectable } from "inversify";
import { ProcessModule, ProcessStuckError, type RunOptions, type RunResult } from "@main/modules/process/process.module";
import type { Encoder, EncoderType, FfmpegAnalyzeOptions, FfmpegAnalyzeProgress, FfmpegAnalyzeResult, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { mapWithConcurrency } from "@shared/utils/concurrency";
import type { Semaphore } from "@shared/utils/semaphore";
import {
	buildConvertArgs,
	buildMkvpropeditArgs,
	buildPacketSizesArgs,
	buildSampleEncodeArgs,
	buildSampleMetricArgs,
	buildStatisticsArgs,
	computeSamplePositions,
	computeVideoStatistics,
	ENCODER_PROFILES,
	EXPECTED_SEARCH_ROUNDS,
	getStatisticsFilePath,
	getTargetXpsnr,
	parseXpsnr,
	searchQuality,
} from "@shared/encoder/encoder.profiles";

/** Samples per analysis */
const SAMPLE_COUNT = 12;

/** ffmpeg could not open a hardware encoder session: another application (OBS, ShadowPlay, a second Elytools…) holds them */
const ENCODER_BUSY = /OpenEncodeSessionEx failed|incompatible client key|out of memory|No capable devices found/i;

/**
 * A 6 s sample is encoded and measured in a few seconds. NVENC sometimes hangs on a session instead of failing:
 * past this delay the step is killed and tried again.
 */
const SAMPLE_STEP_TIMEOUT = 90_000;
const SAMPLE_STEP_TRIES = 3;

/** ffmpeg reports its progress twice a second: silent for this long, a conversion is hung (not a limit on its duration) */
const CONVERT_STALL = 5 * 60_000;

/** Waits between tries while the hardware encoder is busy, in seconds (one minute in total) */
const BUSY_RETRY_DELAYS = [2, 4, 8, 16, 30];

export type AnalyzeContext = {
	signal: AbortSignal;
	/** Encoder sessions shared with the running encodes; null when the encoder has no session limit */
	sessions: Semaphore | null;
	onProgress: (progress: FfmpegAnalyzeProgress) => void;
};

export type ConvertContext = {
	signal: AbortSignal;
	/** Called with the number of frames written so far */
	onFrame: (frame: number) => void;
};

@injectable()
export class FfmpegProcessModule extends LogModule {
	@inject(ProcessModule)
	private readonly processModule!: ProcessModule;

	private mkvpropedit: Promise<boolean> | undefined;

	public constructor() {
		super("FfmpegProcessModule");
	}

	@log.debug()
	public async getEncoders(): Promise<Encoder[]> {
		const { stdout } = await this.processModule.run("ffmpeg", ["-hide_banner", "-encoders"]);

		const lines = stdout.split(/\r?\n/);

		const startIndex = lines.findIndex((line) => line.includes("------")) + 1;

		// Regex breakdown:
		// ^\s+       : Starts with whitespace
		// ([A-Z\.]{6}): Capture the 6-character flag string (Group 1)
		// \s+        : Whitespace separator
		// (\S+)      : Capture the encoder name (Group 2)
		// \s+        : Whitespace separator
		// (.*)       : Capture the rest as description (Group 3)
		const pattern = /^\s+([A-Z.]{6})\s+(\S+)\s+(.*)$/;

		return lines
			.slice(startIndex)
			.map((line): Encoder | null => {
				const match = pattern.exec(line);

				if (match) {
					const flags = match[1]; // e.g. "V....."
					const name = match[2]; // e.g. "libx264"
					const desc = match[3].trim();

					// Parse the Type (1st character)
					let type: EncoderType;

					switch (flags[0]) {
						case "V":
							type = "video";
							break;
						case "A":
							type = "audio";
							break;
						case "S":
							type = "subtitle";
							break;
						default:
							type = "unknown";
							break;
					}

					return {
						id: name,
						description: desc,
						type: type,
						capabilities: {
							experimental: flags.includes("X"),
							frameMt: flags.includes("F"), // Frame-level multithreading
							sliceMt: flags.includes("S"), // Slice-level multithreading
							bandwidthLimited: flags.includes("B"),
							directRendering: flags.includes("D"),
						},
						rawFlags: flags,
					};
				} else {
					return null;
				}
			})
			.filter(Boolean) as Encoder[];
	}

	/**
	 * Check if ffmpeg is available on the system
	 */
	@log.debug()
	public async isAvailable(): Promise<boolean> {
		try {
			const result = await this.processModule.run("ffmpeg", ["-version"]);
			return result.stdout.includes("ffmpeg version");
		} catch {
			return false;
		}
	}

	/**
	 * Converts a file (encode or remux) and resolves once ffmpeg has written it completely.
	 */
	@log((opts: FfmpegConvertOptions) => `input=${opts.files.input} quality=${opts.quality}`)
	public async convert(opts: FfmpegConvertOptions, { signal, onFrame }: ConvertContext): Promise<void> {
		const args = buildConvertArgs(opts);

		this.logger.info("Starting ffmpeg " + args.join(" "));

		const result = await this.runEncoder(args, {
			signal,
			stallMs: CONVERT_STALL,
			onStderr: (chunk) => {
				const frame = [...chunk.matchAll(/frame=\s*(\d+)/g)].at(-1);
				if (frame) onFrame(Number.parseInt(frame[1], 10));
			},
		});

		if (result.code !== 0) throw this.encoderError("Conversion", result);
	}

	/**
	 * Searches the CQ/CRF reaching the XPSNR target: samples spread over the episode are encoded
	 * and compared with the source, for each value tried by the search.
	 */
	@log((opts: FfmpegAnalyzeOptions) => `input=${opts.input} profile=${opts.settings.profile}`)
	public async analyze(opts: FfmpegAnalyzeOptions, { signal, sessions, onProgress }: AnalyzeContext): Promise<FfmpegAnalyzeResult> {
		const profile = ENCODER_PROFILES[opts.settings.profile];
		const positions = computeSamplePositions(opts.duration, SAMPLE_COUNT);

		if (positions.length === 0) throw new Error(`Unknown duration for ${opts.input}`);

		// A failed sample aborts this controller (the other samples are killed), and so does the caller's signal
		const controller = new AbortController();

		const abort = () => controller.abort();

		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();

		const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "elytools-encoder-"));

		const target = getTargetXpsnr(opts.settings);
		const progress: FfmpegAnalyzeProgress = {
			round: 0,
			expectedRounds: EXPECTED_SEARCH_ROUNDS,
			quality: 0,
			samplesEncoded: 0,
			samplesMeasured: 0,
			samplesTotal: positions.length,
			trials: [],
		};

		const report = (update: Partial<FfmpegAnalyzeProgress>) => {
			Object.assign(progress, update);
			onProgress({ ...progress, trials: [...progress.trials] });
		};

		try {
			const result = await searchQuality(profile.qualityRange, target, async (quality) => {
				report({ round: progress.round + 1, quality, samplesEncoded: 0, samplesMeasured: 0 });

				// Every running sample has settled when this returns or throws: the folder can be removed safely
				const scores = await mapWithConcurrency(
					positions,
					profile.sampleParallelism,
					(start, index) =>
						this.measureSample(opts, path.join(dir, `sample-${quality}-${index}.mkv`), start, quality, controller.signal, sessions, (step) =>
							report(step === "encoded" ? { samplesEncoded: progress.samplesEncoded + 1 } : { samplesMeasured: progress.samplesMeasured + 1 })
						),
					controller
				);
				const xpsnr = scores.reduce((acc, score) => acc + score, 0) / scores.length;
				this.logger.info(`${profile.qualityLabel} ${quality}: XPSNR ${xpsnr.toFixed(2)} dB`, { input: opts.input });
				progress.trials.push({ quality, xpsnr, reached: xpsnr >= target });
				return xpsnr;
			});

			return { ...result, samples: positions.length };
		} finally {
			signal.removeEventListener("abort", abort);
			await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch((e) => this.logger.error("Failed to remove analysis samples", { dir, e }));
		}
	}

	/**
	 * Writes the statistics tags (bitrate, bytes, frames) ffmpeg leaves out: Explorer and Jellyfin read the video
	 * bitrate from them. In place with mkvpropedit when MKVToolNix is installed, otherwise through a tagged copy.
	 */
	@log((file: string) => `file=${file}`)
	public async writeStatistics(file: string, videoStreamIndex: number, signal: AbortSignal): Promise<void> {
		if (await this.hasMkvpropedit()) {
			const edit = await this.processModule.run("mkvpropedit", buildMkvpropeditArgs(file), { signal });
			// mkvpropedit exits with 1 on warnings: the tags are written
			if (edit.code === 0 || edit.code === 1) return;
			this.logger.warn("mkvpropedit failed, statistics written through a copy", { file, code: edit.code, output: edit.stdout.slice(-300) });
		}

		const packets = await this.processModule.run("ffprobe", buildPacketSizesArgs(file, videoStreamIndex), { signal });
		const format = await this.processModule.run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { signal });
		const statistics = computeVideoStatistics(packets.stdout, Number.parseFloat(format.stdout));

		if (packets.code !== 0 || format.code !== 0 || !statistics) {
			throw new Error(`Video statistics unavailable: ${(packets.stderr || format.stderr).slice(-300)}`);
		}

		const tagged = getStatisticsFilePath(file);

		try {
			const copy = await this.processModule.run("ffmpeg", buildStatisticsArgs(file, tagged, videoStreamIndex, statistics), { signal });
			if (copy.code !== 0) throw new Error(`Writing the video statistics failed (exit ${copy.code}): ${copy.stderr.slice(-300)}`);
			await fs.promises.rename(tagged, file);
		} catch (e) {
			// Never leave a second copy of the episode behind
			await fs.promises.rm(tagged, { force: true, maxRetries: 5 }).catch(() => {});
			throw e;
		}

		this.logger.info("Video statistics written", { file, ...statistics });
	}

	public async probe(file: string): Promise<FfprobeResult> {
		const result = await this.processModule.run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file]);

		if (result.code !== 0) {
			this.logger.error("ffprobe error", { file, code: result.code, error: result.stderr });
			throw new Error(`ffprobe failed (exit ${result.code}) for ${file}`);
		}

		return JSON.parse(result.stdout) as FfprobeResult;
	}

	private hasMkvpropedit(): Promise<boolean> {
		this.mkvpropedit ??= this.processModule.run("mkvpropedit", ["--version"]).then(
			(result) => result.code === 0,
			() => false
		);
		return this.mkvpropedit;
	}

	private async measureSample(
		opts: FfmpegAnalyzeOptions,
		sample: string,
		start: number,
		quality: number,
		signal: AbortSignal,
		sessions: Semaphore | null,
		onStep: (step: "encoded" | "measured") => void
	): Promise<number> {
		// Only the sample encode needs an encoder session: the measure runs on the CPU
		const release = sessions ? await sessions.acquire(signal) : null;
		let encode: RunResult;

		try {
			encode = await this.retryStuck("Sample encode", () =>
				this.runEncoder(buildSampleEncodeArgs(opts.input, sample, start, opts.settings, quality), { signal, timeoutMs: SAMPLE_STEP_TIMEOUT })
			);
		} finally {
			release?.();
		}

		if (encode.code !== 0) throw this.encoderError("Sample encoding", encode);
		onStep("encoded");

		const metric = await this.retryStuck("XPSNR measure", () =>
			this.processModule.run("ffmpeg", buildSampleMetricArgs(sample, opts.input, start, opts.settings.deband), { signal, timeoutMs: SAMPLE_STEP_TIMEOUT })
		);
		const xpsnr = parseXpsnr(metric.stderr);

		if (metric.code !== 0 || xpsnr === null) throw new Error(`XPSNR measure failed (exit ${metric.code}): ${metric.stderr.slice(-500)}`);
		onStep("measured");

		return xpsnr;
	}

	/**
	 * Runs a sample step again when its watchdog killed it.
	 */
	private async retryStuck(step: string, run: () => Promise<RunResult>): Promise<RunResult> {
		for (let attempt = 1; ; attempt++) {
			try {
				return await run();
			} catch (e) {
				if (!(e instanceof ProcessStuckError) || attempt >= SAMPLE_STEP_TRIES) throw e;
				this.logger.warn(`${step} hung, trying again (${attempt}/${SAMPLE_STEP_TRIES - 1})`);
			}
		}
	}

	/**
	 * Runs ffmpeg with an encoder; while the hardware encoder is busy, tries again with growing waits.
	 */
	private async runEncoder(args: string[], options: RunOptions): Promise<RunResult> {
		for (let attempt = 0; ; attempt++) {
			const result = await this.processModule.run("ffmpeg", args, options);
			const busy = result.code !== 0 && ENCODER_BUSY.test(result.stderr);

			if (!busy || options.signal?.aborted || attempt >= BUSY_RETRY_DELAYS.length) return result;

			this.logger.info(`Hardware encoder busy, trying again in ${BUSY_RETRY_DELAYS[attempt]} s`);

			try {
				await sleep(BUSY_RETRY_DELAYS[attempt] * 1000, undefined, { signal: options.signal });
			} catch {
				return result;
			}
		}
	}

	private encoderError(step: string, result: RunResult): Error {
		if (ENCODER_BUSY.test(result.stderr)) return new Error("GPU encoder busy: another application is using the NVENC sessions");
		return new Error(`${step} failed (exit ${result.code}): ${result.stderr.slice(-500)}`);
	}
}
