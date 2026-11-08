import { createAsyncActionGenerator, getService } from "@store/utils/utils.actions";
import { webContainer } from "@core/di/web.container";
import { FfmpegService } from "@services/media/ffmpeg.service";
import type { Encoder, EncoderSettings, SourcePlan } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import { waitProcessExits } from "@modules/process/process.async.actions";
import { removeFileProcess, resetFileEncodes, setFileProcesses, setProcessProgress, updateFileEncode } from "@modules/encoder/encoder.reducer";
import FilesService from "@services/files/files.service";
import { PathService } from "@services/files/path.service";
import { ProcessService } from "@services/common/process.service";
import {
	DEFAULT_ENCODER_SETTINGS,
	ENCODER_PROFILES,
	findAvailablePath,
	findOutputConflicts,
	getConvertedFilePath,
	getFinalFilePath,
	getMainVideoIndex,
	isFinalPathTaken,
	planSource,
} from "@shared/encoder/encoder.profiles";
import type { ExtraArgument, StoreState } from "@store";

const createAsyncThunk = createAsyncActionGenerator("encoder");

/**
 * One run of the Encoder. A cancelled run keeps its token cancelled even when a new run starts,
 * so its last workers never pick up more work.
 */
type RunToken = { cancelled: boolean };

let currentRun: RunToken | null = null;

type Source = {
	path: string;
	/** Size read when the run starts, in bytes */
	size: number;
	/** Probe read when the run starts: a file converted by a previous run is seen as it is now */
	probe: FfprobeResult;
};

type Job = {
	source: Source;
	plan: SourcePlan;
	/** CQ/CRF from the analysis, null for a remux */
	quality: number | null;
};

/**
 * Converts the selected files with the encoder settings of the local config.
 * Every file is planned and analyzed first (the analysis uses every NVENC session),
 * then the files are encoded a few at a time.
 */
export const convertMedia = createAsyncThunk("convert", async (_, { getState, dispatch, extra }) => {
	const run: RunToken = { cancelled: false };
	currentRun = run;

	const state = getState();
	const settings: EncoderSettings = state.config.current.encoder ?? DEFAULT_ENCODER_SETTINGS;
	const profile = ENCODER_PROFILES[settings.profile];

	if (!state.encoder.ffmpeg?.encoders.some((e) => e.id === profile.encoder)) {
		throw new Error(`Encoder ${profile.encoder} is not available in this ffmpeg build`);
	}

	const ffmpegService = getService(FfmpegService, extra);
	const files = state.media.data;

	if (files.length === 0) throw new Error("No files to convert");

	dispatch(resetFileEncodes());

	const conflicts = findOutputConflicts(files.map((f) => f.file.path));
	const jobs: Job[] = [];

	// region Plan and analyze
	for (const { file } of files) {
		if (run.cancelled) break;

		const path = file.path;
		const conflict = conflicts.get(path);

		if (conflict) {
			dispatch(updateFileEncode({ path, phase: "skipped", note: conflict }));
			continue;
		}

		const source = await readSource(path, ffmpegService);

		if (!source) {
			dispatch(updateFileEncode({ path, phase: "skipped", note: "File not found (already converted?)" }));
			continue;
		}

		const plan = planSource(source.probe, path);

		if (plan.action === "skip") {
			dispatch(updateFileEncode({ path, phase: "skipped", note: plan.reason }));
			continue;
		}

		if (isFinalPathTaken(path, await window.preload.ipc.send.file.exists(getFinalFilePath(path)))) {
			dispatch(updateFileEncode({ path, phase: "skipped", note: `${getFinalFilePath(path)} already exists` }));
			continue;
		}

		if (plan.action === "remux") {
			dispatch(updateFileEncode({ path, phase: "pending", note: plan.reason }));
			jobs.push({ source, plan, quality: null });
			continue;
		}

		dispatch(updateFileEncode({ path, phase: "analyzing" }));

		try {
			const analysis = await ffmpegService.analyze({ input: path, duration: Number(source.probe.format.duration), settings });
			dispatch(updateFileEncode({ path, phase: "pending", quality: analysis.quality, xpsnr: analysis.xpsnr, targetReached: analysis.targetReached }));
			jobs.push({ source, plan, quality: analysis.quality });
		} catch (e) {
			dispatch(updateFileEncode({ path, phase: run.cancelled ? "aborted" : "failed", note: run.cancelled ? undefined : errorMessage(e) }));
		}
	}
	// endregion

	// region Encode
	const queue = [...jobs];

	await Promise.allSettled(
		Array.from({ length: profile.fileParallelism }, async () => {
			for (let job = queue.shift(); job && !run.cancelled; job = queue.shift()) {
				try {
					await runJob(job, settings, run, { dispatch, getState, extra });
				} catch (e) {
					dispatch(updateFileEncode({ path: job.source.path, phase: run.cancelled ? "aborted" : "failed", note: run.cancelled ? undefined : errorMessage(e) }));
				}
			}
		})
	);

	// Jobs left in the queue by a cancel
	for (const job of queue) dispatch(updateFileEncode({ path: job.source.path, phase: "aborted" }));
	// endregion

	dispatch(removeFileProcess({ pids: getState().encoder.current.pids }));
	if (currentRun === run) currentRun = null;
});

async function readSource(path: string, ffmpegService: FfmpegService): Promise<Source | null> {
	if (!(await window.preload.ipc.send.file.exists(path))) return null;

	const [probe, stats] = await Promise.all([ffmpegService.probe(path), window.preload.ipc.send.file.lstat(path)]);

	return { path, size: stats.size, probe };
}

type ThunkApi = {
	dispatch: (action: ReturnType<typeof updateFileEncode | typeof setFileProcesses | typeof setProcessProgress>) => unknown;
	getState: () => StoreState;
	extra: ExtraArgument;
};

async function runJob({ source, plan, quality }: Job, settings: EncoderSettings, run: RunToken, { dispatch, getState, extra }: ThunkApi) {
	const ffmpegService = getService(FfmpegService, extra);
	const processService = getService(ProcessService, extra);

	const { path, probe } = source;
	const outputPath = getConvertedFilePath(path);
	// Computed before ffmpeg starts: nothing may throw between its start and the wait for its exit
	const nbFrames = ffmpegService.extractNbFrames(probe);

	dispatch(updateFileEncode({ path, phase: plan.action === "remux" ? "remuxing" : "encoding" }));

	const pid = await ffmpegService.convert({
		settings,
		quality,
		files: { input: path, output: outputPath },
		videoStreamIndex: getMainVideoIndex(probe),
		subtitleCodecs: probe.streams.filter((s) => s.codec_type === "subtitle").map((s) => s.codec_name),
	});

	dispatch(setFileProcesses({ path, pid }));

	// Cancelled while ffmpeg was starting: the stop did not know this pid yet
	if (run.cancelled) await processService.kill(pid);

	const removeListener = window.preload.ipc.on.process.spawn.stderr((pid1, data) => {
		if (pid1 !== pid || nbFrames === 0) return;

		const frame = ffmpegService.extractNbFrameProcessed(data);

		if (frame === null) return;

		dispatch(setProcessProgress({ path, value: Math.min(frame / nbFrames, 0.99) }));
	});

	try {
		await waitProcessExits(getState, pid);
	} catch (e) {
		await deleteQuietly(outputPath);
		throw e;
	} finally {
		removeListener();
	}

	// ffmpeg exited successfully: the file is complete, it is kept even if the run was cancelled meanwhile
	const outputSize = (await window.preload.ipc.send.file.lstat(outputPath)).size;

	if (plan.action === "encode" && outputSize >= source.size) {
		await deleteQuietly(outputPath);
		dispatch(updateFileEncode({ path, phase: "skipped", note: "Larger than the source, original kept", outputSize }));
		dispatch(setProcessProgress({ path, value: 1 }));
		return;
	}

	await replaceOriginal(path, outputPath, extra);

	dispatch(updateFileEncode({ path, phase: "done", outputSize }));
	dispatch(setProcessProgress({ path, value: 1 }));
}

/**
 * Moves the original to `old/` (under a free name) and the converted file to the original path (as .mkv).
 * If the second move fails, the original is put back.
 */
async function replaceOriginal(path: string, outputPath: string, extra: ExtraArgument) {
	const fileService = getService(FilesService, extra);
	const pathService = getService(PathService, extra);

	const finalPath = getFinalFilePath(path);

	if (isFinalPathTaken(path, await fileService.checkPathExists(finalPath))) {
		throw new Error(`${finalPath} appeared during the encode, converted file left at ${outputPath}`);
	}

	const oldDir = pathService.join(pathService.dirname(path), "old");
	await fileService.ensureDir(oldDir);
	const oldPath = await findAvailablePath(pathService.join(oldDir, pathService.filename(path)), (candidate) => fileService.checkPathExists(candidate));

	await fileService.move(path, oldPath);

	try {
		await fileService.move(outputPath, finalPath);
	} catch (e) {
		await fileService.move(oldPath, path);
		throw e;
	}
}

async function deleteQuietly(path: string) {
	try {
		if (await window.preload.ipc.send.file.exists(path)) await window.preload.ipc.send.file.delete(path);
	} catch {
		// Leftover file, nothing else to do
	}
}

function errorMessage(e: unknown) {
	return e instanceof Error ? e.message : String(e);
}

export const stopConvertMedia = createAsyncThunk("stop-convert", async (_, { dispatch, getState, extra }) => {
	if (currentRun) currentRun.cancelled = true;

	const ffmpegService = getService(FfmpegService, extra);
	await ffmpegService.cancelAnalyses();

	const state = getState();
	const pids = [...state.encoder.current.pids];

	const processService = getService(ProcessService, extra);

	for (const pid of pids) {
		await processService.kill(pid);
	}

	for (const [path, file] of Object.entries(state.encoder.processes.files)) {
		if (file.phase === "analyzing" || file.phase === "encoding" || file.phase === "remuxing" || file.phase === "pending") {
			dispatch(updateFileEncode({ path, phase: "aborted" }));
		}
	}

	dispatch(removeFileProcess({ pids }));
});

export const setupFfmpeg = createAsyncThunk("ffmpeg/setup", async (): Promise<{ isAvailable: boolean; encoders?: Encoder[] }> => {
	const ffmpegService = webContainer.get(FfmpegService);

	const isAvailable = await ffmpegService.isAvailable();

	if (!isAvailable) {
		return {
			isAvailable: false,
		};
	}

	return {
		isAvailable: true,
		encoders: await ffmpegService.getEncoders(),
	};
});
