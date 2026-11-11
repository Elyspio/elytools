import path from "node:path";
import type {
	EncoderSettings,
	FfmpegAnalyzeOptions,
	FfmpegAnalyzeProgress,
	FfmpegAnalyzeResult,
	FfmpegConvertOptions,
	FileEncodeState,
	SourcePlan,
} from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import { Semaphore } from "@shared/utils/semaphore";
import {
	ENCODER_PROFILES,
	findAvailablePath,
	findOutputConflicts,
	getConvertedFilePath,
	getFinalFilePath,
	getMainVideoIndex,
	getMainVideoStream,
	getStatisticsFilePath,
	getTargetXpsnr,
	isFinalPathTaken,
	planSource,
} from "@shared/encoder/encoder.profiles";

/** File system operations of the pipeline, replaced by an in-memory one in the tests */
export type PipelineFs = {
	/** Size and modification time of a file, null when it does not exist */
	stat(file: string): Promise<{ size: number; mtimeMs: number } | null>;
	mkdir(dir: string): Promise<void>;
	move(from: string, to: string): Promise<void>;
	remove(file: string): Promise<void>;
};

export type PipelineTools = {
	probe(file: string): Promise<FfprobeResult>;
	analyze(
		opts: FfmpegAnalyzeOptions,
		context: { signal: AbortSignal; sessions: Semaphore | null; onProgress: (progress: FfmpegAnalyzeProgress) => void }
	): Promise<FfmpegAnalyzeResult>;
	/** Resolves once the output is completely written, rejects otherwise */
	convert(opts: FfmpegConvertOptions, context: { signal: AbortSignal; onFrame: (frame: number) => void }): Promise<void>;
	writeStatistics(file: string, videoStreamIndex: number, signal: AbortSignal): Promise<void>;
};

export type PipelineOptions = {
	paths: string[];
	settings: EncoderSettings;
	/** Aborted by a cancel or when the app quits */
	signal: AbortSignal;
	fs: PipelineFs;
	tools: PipelineTools;
	/** Analysis results of earlier runs, by {@link analysisKey}: a run started again does not measure twice */
	analysisCache: Map<string, FfmpegAnalyzeResult>;
	update: (file: string, state: Partial<FileEncodeState>) => void;
	warn?: (message: string, error: unknown) => void;
	now?: () => number;
};

type Job = {
	path: string;
	size: number;
	probe: FfprobeResult;
	plan: SourcePlan;
	/** CQ/CRF from the analysis, null for a remux */
	quality: number | null;
};

/**
 * Identifies an analysis: the same file (path, size, modification time) with the same encoder and target
 * always gives the same result.
 */
export function analysisKey(file: string, stats: { size: number; mtimeMs: number }, settings: EncoderSettings): string {
	return [file, stats.size, stats.mtimeMs, settings.profile, getTargetXpsnr(settings), settings.deband].join("|");
}

/**
 * Converts the files. One calibrator analyzes them in order while the encoders convert the files already
 * analyzed, so the first file is done long before the last analysis:
 *
 * - "overlap" profiles (GPU): the calibrator stays at most `fileParallelism` files ahead; the encodes and the
 *   analysis samples share the encoder sessions of the driver;
 * - "alternate" profiles (CPU): a file is analyzed, then encoded, then the next one.
 *
 * Never rejects for one file: its state says what happened. After an abort, every unfinished file is "aborted".
 */
export async function runEncoderPipeline(options: PipelineOptions): Promise<void> {
	const { paths, settings, signal, fs, tools, analysisCache } = options;
	const now = options.now ?? Date.now;
	const profile = ENCODER_PROFILES[settings.profile];
	const sessions = profile.sessionLimit === null ? null : new Semaphore(profile.sessionLimit);
	const lookahead = profile.pipeline === "alternate" ? 1 : profile.fileParallelism;

	const phases = new Map<string, FileEncodeState["phase"]>(paths.map((file) => [file, "pending"]));

	const update = (file: string, state: Partial<FileEncodeState>) => {
		if (state.phase) phases.set(file, state.phase);
		options.update(file, state);
	};

	const fail = (file: string, error: unknown) => update(file, signal.aborted ? { phase: "aborted" } : { phase: "failed", note: errorMessage(error) });

	// Jobs analyzed and waiting for an encoder
	const ready: Job[] = [];
	let calibrating = true;
	let activeEncodes = 0;

	// Both stages wait on the same changes: a job queued or taken, an encode finished, the end of the calibration, an abort
	const waiters = new Set<() => void>();

	const wake = () => {
		for (const waiter of waiters) waiter();
		waiters.clear();
	};

	const changed = () => new Promise<void>((resolve) => waiters.add(resolve));

	signal.addEventListener("abort", wake, { once: true });

	const conflicts = findOutputConflicts(paths);

	/** Decides what to do with a file; null when it is left untouched (its state says why) */
	const plan = async (file: string): Promise<Job | null> => {
		const conflict = conflicts.get(file);
		if (conflict) return skip(file, conflict);

		const stats = await fs.stat(file);
		if (!stats) return skip(file, "File not found (already converted?)");

		// Left by a run that crashed: the file would be converted again anyway
		await removeQuietly(fs, getConvertedFilePath(file));
		await removeQuietly(fs, getStatisticsFilePath(getConvertedFilePath(file)));

		const probe = await tools.probe(file);
		const sourcePlan = planSource(probe, file);
		update(file, { size: stats.size });

		if (sourcePlan.action === "skip") return skip(file, sourcePlan.reason);

		const finalPath = getFinalFilePath(file);
		if (isFinalPathTaken(file, (await fs.stat(finalPath)) !== null)) return skip(file, `${finalPath} already exists`);

		if (sourcePlan.action === "remux") update(file, { note: sourcePlan.reason });

		return { path: file, size: stats.size, probe, plan: sourcePlan, quality: null };
	};

	const skip = (file: string, note: string) => {
		update(file, { phase: "skipped", note });
		return null;
	};

	const analyze = async (job: Job) => {
		const stats = await fs.stat(job.path);
		if (!stats) throw new Error("File not found");

		const key = analysisKey(job.path, stats, settings);
		let analysis = analysisCache.get(key);

		if (!analysis) {
			update(job.path, { phase: "analyzing" });
			analysis = await tools.analyze(
				{ input: job.path, duration: Number(job.probe.format.duration), settings },
				{ signal, sessions, onProgress: (progress) => update(job.path, { analysis: progress }) }
			);
			analysisCache.set(key, analysis);
		}

		job.quality = analysis.quality;
		update(job.path, {
			phase: "pending",
			analysis: undefined,
			quality: analysis.quality,
			xpsnr: analysis.xpsnr,
			targetReached: analysis.targetReached,
			samples: analysis.samples,
		});
	};

	const calibrator = async () => {
		for (const file of paths) {
			if (signal.aborted) break;

			try {
				const job = await plan(file);
				if (!job) continue;

				// "alternate" also waits for the running encode: both stages would fight for the CPU
				while (!signal.aborted && ready.length + (profile.pipeline === "alternate" ? activeEncodes : 0) >= lookahead) await changed();
				if (signal.aborted) break;

				if (job.plan.action === "encode") await analyze(job);

				ready.push(job);
				wake();
			} catch (e) {
				fail(file, e);
			}
		}

		calibrating = false;
		wake();
	};

	const encoder = async () => {
		for (;;) {
			while (ready.length === 0 && calibrating && !signal.aborted) await changed();
			if (signal.aborted) return;

			const job = ready.shift();
			if (!job) return;

			activeEncodes++;
			wake();

			try {
				await convert(job);
			} catch (e) {
				fail(job.path, e);
			} finally {
				activeEncodes--;
				wake();
			}
		}
	};

	const convert = async (job: Job) => {
		const output = getConvertedFilePath(job.path);
		const videoStreamIndex = getMainVideoIndex(job.probe);
		const frames = expectedFrames(job.probe);
		const encode = job.quality !== null;

		// A remux uses no encoder session
		const release = encode && sessions ? await sessions.acquire(signal) : null;

		try {
			update(job.path, { phase: encode ? "encoding" : "remuxing", progress: 0, startedAt: now() });

			await tools.convert(
				{
					settings,
					quality: job.quality,
					files: { input: job.path, output },
					videoStreamIndex,
					subtitleCodecs: job.probe.streams.filter((s) => s.codec_type === "subtitle").map((s) => s.codec_name),
				},
				{
					signal,

					onFrame: (frame) => {
						if (frames > 0) update(job.path, { progress: Math.min(frame / frames, 0.99) });
					},
				}
			);
		} catch (e) {
			await removeQuietly(fs, output);
			throw e;
		} finally {
			release?.();
		}

		// From here the output is complete: it is kept even if the run is cancelled meanwhile
		let outputSize = (await fs.stat(output))?.size ?? 0;

		if (encode && outputSize >= job.size) {
			await removeQuietly(fs, output);
			update(job.path, { phase: "skipped", note: "Larger than the source, original kept", outputSize, progress: 1 });
			return;
		}

		// A remux keeps the tags of the source, still right. A failure only costs the tags.
		if (encode && !signal.aborted) {
			try {
				await tools.writeStatistics(output, videoStreamIndex, signal);
				outputSize = (await fs.stat(output))?.size ?? outputSize;
			} catch (e) {
				if (!signal.aborted) options.warn?.(`Video statistics not written for ${output}`, e);
			}
		}

		await replaceOriginal(fs, job.path, output);
		update(job.path, { phase: "done", outputSize, progress: 1 });
	};

	await Promise.all([calibrator(), ...Array.from({ length: profile.fileParallelism }, encoder)]);
	signal.removeEventListener("abort", wake);

	if (signal.aborted) {
		for (const [file, phase] of phases) {
			if (phase === "pending" || phase === "analyzing" || phase === "encoding" || phase === "remuxing") update(file, { phase: "aborted", analysis: undefined });
		}
	}
}

/**
 * Moves the original to `old/` (under a free name) and the converted file to the original path (as .mkv).
 * If the second move fails, the original is put back.
 */
export async function replaceOriginal(fs: PipelineFs, source: string, output: string): Promise<void> {
	const finalPath = getFinalFilePath(source);

	if (isFinalPathTaken(source, (await fs.stat(finalPath)) !== null)) {
		throw new Error(`${finalPath} appeared during the encode, converted file left at ${output}`);
	}

	const oldDir = path.join(path.dirname(source), "old");
	await fs.mkdir(oldDir);
	const oldPath = await findAvailablePath(path.join(oldDir, path.basename(source)), async (candidate) => (await fs.stat(candidate)) !== null);

	await fs.move(source, oldPath);

	try {
		await fs.move(output, finalPath);
	} catch (e) {
		await fs.move(oldPath, source);
		throw e;
	}
}

/** Expected number of frames of the main video, 0 when unknown (no progress is shown then) */
export function expectedFrames(probe: FfprobeResult): number {
	const [numerator, denominator] = (getMainVideoStream(probe)?.avg_frame_rate ?? "").split("/").map(Number);
	const frames = Math.floor((Number(probe.format.duration) * numerator) / denominator);

	return Number.isFinite(frames) && frames > 0 ? frames : 0;
}

async function removeQuietly(fs: PipelineFs, file: string) {
	try {
		if (await fs.stat(file)) await fs.remove(file);
	} catch {
		// Leftover file, nothing else to do
	}
}

function errorMessage(e: unknown) {
	return e instanceof Error ? e.message : String(e);
}
