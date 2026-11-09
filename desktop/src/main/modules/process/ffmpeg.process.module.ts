import { LogModule } from "@main/modules/log.module";
import { log } from "@main/utils/logs.utils";
import { inject, injectable } from "inversify";
import { ProcessModule } from "@main/modules/process/process.module";
import { IpcModule } from "@main/modules/ipc.module";
import { resultGuards } from "@shared/types/process.types";
import type { Encoder, EncoderType, FfmpegAnalyzeOptions, FfmpegAnalyzeProgress, FfmpegAnalyzeResult, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { mapWithConcurrency } from "@shared/utils/concurrency";
import {
	buildConvertArgs,
	buildSampleEncodeArgs,
	buildSampleMetricArgs,
	computeSamplePositions,
	ENCODER_PROFILES,
	getTargetXpsnr,
	maxSearchRounds,
	parseXpsnr,
	searchQuality,
} from "@shared/encoder/encoder.profiles";

/** Samples per analysis: the 12 NVENC sessions allowed by the driver, all at once */
const SAMPLE_COUNT = 12;

/** Another application (OBS, ShadowPlay…) may hold an NVENC session: such a sample is tried again once */
const NVENC_SESSION_ERROR = /OpenEncodeSessionEx failed|incompatible client key|out of memory|No capable devices found/i;

@injectable()
export class FfmpegProcessModule extends LogModule {
	@inject(ProcessModule)
	private readonly processModule!: ProcessModule;

	@inject(IpcModule)
	private readonly ipcModule!: IpcModule;

	private readonly analyses = new Set<AbortController>();

	public constructor() {
		super("FfmpegProcessModule");
	}

	@log.debug()
	public async getEncoders(): Promise<Encoder[]> {
		const { stdout } = await this.processModule.execute("ffmpeg -encoders");

		const lines = stdout.split(os.EOL);

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
			const result = await this.processModule.execute("ffmpeg -version");
			return result.stdout.includes("ffmpeg version");
		} catch {
			return false;
		}
	}

	@log.debug()
	public async convert(opts: FfmpegConvertOptions): Promise<string> {
		const args = buildConvertArgs(opts);

		this.logger.info("Starting ffmpeg process " + args.join(" "));

		const result = await this.processModule.spawn("ffmpeg", args, {});

		if (resultGuards.is.error(result)) {
			this.logger.error("Failed to start ffmpeg process", { error: result.error });
			throw new Error("Failed to start ffmpeg process " + result.error);
		}

		return result.pid;
	}

	/**
	 * Searches the CQ/CRF reaching the XPSNR target: samples spread over the episode are encoded
	 * and compared with the source, for each value tried by the binary search.
	 */
	@log((opts: FfmpegAnalyzeOptions) => `input=${opts.input} profile=${opts.settings.profile}`)
	public async analyze(opts: FfmpegAnalyzeOptions): Promise<FfmpegAnalyzeResult> {
		const profile = ENCODER_PROFILES[opts.settings.profile];
		const positions = computeSamplePositions(opts.duration, SAMPLE_COUNT);

		if (positions.length === 0) throw new Error(`Unknown duration for ${opts.input}`);

		const controller = new AbortController();
		this.analyses.add(controller);
		const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "elytools-encoder-"));

		const target = getTargetXpsnr(opts.settings);
		const progress: FfmpegAnalyzeProgress = {
			input: opts.input,
			round: 0,
			maxRounds: maxSearchRounds(profile.qualityRange),
			quality: 0,
			samplesEncoded: 0,
			samplesMeasured: 0,
			samplesTotal: positions.length,
			trials: [],
		};
		const report = (update: Partial<FfmpegAnalyzeProgress>) => {
			Object.assign(progress, update);
			this.ipcModule.sendIpcToMainContent("process:ffmpeg:analyze:progress", { ...progress, trials: [...progress.trials] });
		};

		try {
			return await searchQuality(profile.qualityRange, target, async (quality) => {
				report({ round: progress.round + 1, quality, samplesEncoded: 0, samplesMeasured: 0 });

				// A failed sample aborts the controller: the other samples are killed and awaited before cleanup
				const scores = await mapWithConcurrency(
					positions,
					profile.sampleParallelism,
					(start, index) =>
						this.measureSample(opts, path.join(dir, `sample-${quality}-${index}.mkv`), start, quality, controller.signal, (step) =>
							report(step === "encoded" ? { samplesEncoded: progress.samplesEncoded + 1 } : { samplesMeasured: progress.samplesMeasured + 1 })
						),
					controller
				);
				const xpsnr = scores.reduce((acc, score) => acc + score, 0) / scores.length;
				this.logger.info(`${profile.qualityLabel} ${quality}: XPSNR ${xpsnr.toFixed(2)} dB`, { input: opts.input });
				progress.trials.push({ quality, xpsnr, reached: xpsnr >= target });
				return xpsnr;
			});
		} finally {
			this.analyses.delete(controller);
			await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch((e) => this.logger.error("Failed to remove analysis samples", { dir, e }));
		}
	}

	/**
	 * Stops every running analysis (their ffmpeg processes are killed).
	 */
	@log.debug()
	public cancelAnalyses() {
		for (const controller of this.analyses) controller.abort();
		this.analyses.clear();
	}

	private async measureSample(
		opts: FfmpegAnalyzeOptions,
		sample: string,
		start: number,
		quality: number,
		signal: AbortSignal,
		onStep: (step: "encoded" | "measured") => void
	): Promise<number> {
		const args = buildSampleEncodeArgs(opts.input, sample, start, opts.settings, quality);
		let encode = await this.processModule.run("ffmpeg", args, signal);

		if (encode.code !== 0 && NVENC_SESSION_ERROR.test(encode.stderr) && !signal.aborted) {
			this.logger.info("NVENC session refused, sample tried again", { input: opts.input, start });
			await new Promise((resolve) => setTimeout(resolve, 2000));
			encode = await this.processModule.run("ffmpeg", args, signal);
		}

		if (encode.code !== 0) throw new Error(`Sample encoding failed (exit ${encode.code}): ${encode.stderr.slice(-500)}`);
		onStep("encoded");

		const metric = await this.processModule.run("ffmpeg", buildSampleMetricArgs(sample, opts.input, start, opts.settings.deband), signal);
		const xpsnr = parseXpsnr(metric.stderr);

		if (metric.code !== 0 || xpsnr === null) throw new Error(`XPSNR measure failed (exit ${metric.code}): ${metric.stderr.slice(-500)}`);
		onStep("measured");

		return xpsnr;
	}

	public async probe(path: string): Promise<FfprobeResult> {
		const result = await this.processModule.execute(`ffprobe -v quiet -print_format json -show_format -show_streams "${path}"`);

		if (result.stderr) {
			this.logger.error("ffprobe error", { error: result.stderr });
			throw new Error("ffprobe error: " + result.stderr);
		}

		return JSON.parse(result.stdout) as FfprobeResult;
	}
}
