import { createAsyncActionGenerator, getService } from "@store/utils/utils.actions";
import { webContainer } from "@core/di/web.container";
import { FfmpegService } from "@services/media/ffmpeg.service";
import type { Encoder, EncoderSettings, SourcePlan } from "@shared/types/ffmpeg.types";
import { waitProcessExits } from "@modules/process/process.async.actions";
import { removeFileProcess, resetFileEncodes, setFileProcesses, setProcessProgress, updateFileEncode } from "@modules/encoder/encoder.reducer";
import FilesService from "@services/files/files.service";
import { PathService } from "@services/files/path.service";
import type { Media } from "@components/internal/encoder/type";
import { ProcessService } from "@services/common/process.service";
import { DEFAULT_ENCODER_SETTINGS, ENCODER_PROFILES, getConvertedFilePath, getFinalFilePath, planSource } from "@shared/encoder/encoder.profiles";
import type { ExtraArgument, StoreState } from "@store";

const createAsyncThunk = createAsyncActionGenerator("encoder");

export const encoderConvertStates = {
	isConverting: false,
};

type Job = {
	media: Media;
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
	encoderConvertStates.isConverting = true;

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

	const jobs: Job[] = [];

	// region Plan and analyze
	for (const media of files) {
		if (!encoderConvertStates.isConverting) break;

		const path = media.file.path;
		const plan = planSource(media.property, path);

		if (plan.action === "skip") {
			dispatch(updateFileEncode({ path, phase: "skipped", note: plan.reason }));
			continue;
		}

		if (plan.action === "remux") {
			dispatch(updateFileEncode({ path, phase: "pending", note: plan.reason }));
			jobs.push({ media, plan, quality: null });
			continue;
		}

		dispatch(updateFileEncode({ path, phase: "analyzing" }));

		try {
			const analysis = await ffmpegService.analyze({ input: path, duration: Number(media.property.format.duration), settings });
			dispatch(updateFileEncode({ path, phase: "pending", quality: analysis.quality, xpsnr: analysis.xpsnr, targetReached: analysis.targetReached }));
			jobs.push({ media, plan, quality: analysis.quality });
		} catch (e) {
			const aborted = !encoderConvertStates.isConverting;
			dispatch(updateFileEncode({ path, phase: aborted ? "aborted" : "failed", note: aborted ? undefined : errorMessage(e) }));
		}
	}
	// endregion

	// region Encode
	const queue = [...jobs];

	await Promise.allSettled(
		Array.from({ length: profile.fileParallelism }, async () => {
			for (let job = queue.shift(); job && encoderConvertStates.isConverting; job = queue.shift()) {
				try {
					await runJob(job, settings, { dispatch, getState, extra });
				} catch (e) {
					const aborted = !encoderConvertStates.isConverting;
					dispatch(updateFileEncode({ path: job.media.file.path, phase: aborted ? "aborted" : "failed", note: aborted ? undefined : errorMessage(e) }));
				}
			}
		})
	);
	// endregion

	dispatch(removeFileProcess({ pids: getState().encoder.current.pids }));
});

type ThunkApi = {
	dispatch: (action: ReturnType<typeof updateFileEncode | typeof setFileProcesses | typeof setProcessProgress>) => unknown;
	getState: () => StoreState;
	extra: ExtraArgument;
};

async function runJob({ media, plan, quality }: Job, settings: EncoderSettings, { dispatch, getState, extra }: ThunkApi) {
	const ffmpegService = getService(FfmpegService, extra);
	const fileService = getService(FilesService, extra);
	const pathService = getService(PathService, extra);

	const path = media.file.path;
	const outputPath = getConvertedFilePath(path);

	dispatch(updateFileEncode({ path, phase: plan.action === "remux" ? "remuxing" : "encoding" }));

	const pid = await ffmpegService.convert({
		settings,
		quality,
		files: { input: path, output: outputPath },
		subtitleCodecs: media.property.streams.filter((s) => s.codec_type === "subtitle").map((s) => s.codec_name),
	});

	dispatch(setFileProcesses({ path, pid }));

	const nbFrames = ffmpegService.extractNbFrames(media.property);

	const removeListener = window.preload.ipc.on.process.spawn.stderr((pid1, data) => {
		if (pid1 !== pid) return;

		const frame = ffmpegService.extractNbFrameProcessed(data);

		if (frame === null || nbFrames === 0) return;

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

	if (!encoderConvertStates.isConverting) {
		await deleteQuietly(outputPath);
		return;
	}

	const outputSize = (await window.preload.ipc.send.file.lstat(outputPath)).size;

	if (plan.action === "encode" && outputSize >= media.file.size) {
		await deleteQuietly(outputPath);
		dispatch(updateFileEncode({ path, phase: "skipped", note: "Larger than the source, original kept", outputSize }));
		dispatch(setProcessProgress({ path, value: 1 }));
		return;
	}

	// The original goes to old/, the converted file takes its place (always .mkv)
	const oldDir = pathService.join(pathService.dirname(path), "old");
	await fileService.ensureDir(oldDir);
	await fileService.move(path, pathService.join(oldDir, pathService.filename(path)));
	await fileService.move(outputPath, getFinalFilePath(path));

	dispatch(updateFileEncode({ path, phase: "done", outputSize }));
	dispatch(setProcessProgress({ path, value: 1 }));
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
	encoderConvertStates.isConverting = false;

	const ffmpegService = getService(FfmpegService, extra);
	await ffmpegService.cancelAnalyses();

	const state = getState();
	const pids = [...state.encoder.current.pids];

	const processService = getService(ProcessService, extra);

	for (const pid of pids) {
		await processService.kill(pid);
	}

	for (const [path, file] of Object.entries(state.encoder.processes.files)) {
		if (file.phase === "analyzing" || file.phase === "encoding" || file.phase === "remuxing") {
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
