import fs from "node:fs";
import { inject, injectable } from "inversify";
import { LogModule } from "@main/modules/log.module";
import { log } from "@main/utils/logs.utils";
import { IpcModule } from "@main/modules/ipc.module";
import { ConfigModule } from "@main/modules/config/config.module";
import { FfmpegProcessModule } from "@main/modules/process/ffmpeg.process.module";
import type { EncoderQueueStatus, FfmpegAnalyzeResult, FileEncodeState } from "@shared/types/ffmpeg.types";
import { DEFAULT_ENCODER_SETTINGS, ENCODER_PROFILES } from "@shared/encoder/encoder.profiles";
import { type PipelineFs, runEncoderPipeline } from "./encoder.pipeline";

/** Analysis results kept in memory: enough for the batches of a session */
const ANALYSIS_CACHE_SIZE = 500;

const nodeFs: PipelineFs = {
	async stat(file) {
		try {
			const stats = await fs.promises.stat(file);
			return { size: stats.size, mtimeMs: stats.mtimeMs };
		} catch {
			return null;
		}
	},
	async mkdir(dir) {
		await fs.promises.mkdir(dir, { recursive: true });
	},
	move: (from, to) => fs.promises.rename(from, to),
	remove: (file) => fs.promises.rm(file, { force: true, maxRetries: 5 }),
};

/**
 * Owns the encoder queue: the window only starts and cancels it, and shows its status. A run goes on when
 * the window reloads or is hidden in the tray.
 */
@injectable()
export class EncoderQueueModule extends LogModule {
	@inject(FfmpegProcessModule)
	private readonly ffmpeg!: FfmpegProcessModule;

	@inject(IpcModule)
	private readonly ipcModule!: IpcModule;

	@inject(ConfigModule)
	private readonly configModule!: ConfigModule;

	private status: EncoderQueueStatus = { running: false, stopping: false, order: [], files: {} };
	private controller: AbortController | null = null;
	private run: Promise<void> | null = null;
	private publishing = false;
	private readonly analysisCache = new Map<string, FfmpegAnalyzeResult>();

	public constructor() {
		super("EncoderQueueModule");
	}

	public getStatus(): EncoderQueueStatus {
		return this.status;
	}

	/**
	 * Starts converting the files with the encoder settings of the config. Returns once the run has started:
	 * its progress is sent with the status.
	 */
	@log((paths: string[]) => `files=${paths.length}`)
	public async start(paths: string[]): Promise<void> {
		if (this.status.running) throw new Error("The encoder is already running");
		if (paths.length === 0) throw new Error("No files to convert");

		// Reserved before the first await: a second start cannot slip in
		this.status = {
			running: true,
			stopping: false,
			order: [...paths],
			files: Object.fromEntries(paths.map((file): [string, FileEncodeState] => [file, { phase: "pending" }])),
		};

		try {
			const settings = (await this.configModule.getConfig()).encoder ?? DEFAULT_ENCODER_SETTINGS;
			const profile = ENCODER_PROFILES[settings.profile];

			if (!(await this.ffmpeg.getEncoders()).some((encoder) => encoder.id === profile.encoder)) {
				throw new Error(`Encoder ${profile.encoder} is not available in this ffmpeg build`);
			}

			const controller = new AbortController();
			this.controller = controller;
			this.publish();

			this.run = runEncoderPipeline({
				paths,
				settings,
				signal: controller.signal,
				fs: nodeFs,
				tools: {
					probe: (file) => this.ffmpeg.probe(file),
					analyze: (opts, context) => this.ffmpeg.analyze(opts, context),
					convert: (opts, context) => this.ffmpeg.convert(opts, context),
					writeStatistics: (file, index, signal) => this.ffmpeg.writeStatistics(file, index, signal),
				},
				analysisCache: this.analysisCache,
				update: (file, state) => this.update(file, state),
				warn: (message, error) => this.logger.warn(message, { error }),
			})
				.catch((e) => this.logger.error("Encoder run failed", e))
				.finally(() => {
					this.trimCache();
					this.controller = null;
					this.run = null;
					this.status = { ...this.status, running: false, stopping: false };
					this.publish();
				});
		} catch (e) {
			this.status = { running: false, stopping: false, order: [], files: {} };
			this.publish();
			throw e;
		}
	}

	/**
	 * Stops the run: analyses and encodes are killed, a file already converted is kept. Resolves once it has settled.
	 */
	@log()
	public async cancel(): Promise<void> {
		if (!this.controller || !this.run) return;

		this.status = { ...this.status, stopping: true };
		this.publish();
		this.controller.abort();
		await this.run;
	}

	private update(file: string, state: Partial<FileEncodeState>) {
		const current = this.status.files[file] ?? { phase: "pending" };
		this.status = { ...this.status, files: { ...this.status.files, [file]: { ...current, ...state } } };
		this.publish();
	}

	/** Sends the status once per turn of the event loop, whatever the number of changes (ffmpeg progress, samples) */
	private publish() {
		if (this.publishing) return;
		this.publishing = true;

		setImmediate(() => {
			this.publishing = false;
			this.ipcModule.sendIpcToMainContent("encoder:status", this.status);
		});
	}

	private trimCache() {
		for (const key of this.analysisCache.keys()) {
			if (this.analysisCache.size <= ANALYSIS_CACHE_SIZE) break;
			this.analysisCache.delete(key);
		}
	}
}
