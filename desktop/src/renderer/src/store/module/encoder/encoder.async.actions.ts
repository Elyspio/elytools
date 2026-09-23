import { createAsyncActionGenerator, getService } from "@store/utils/utils.actions";
import { webContainer } from "@core/di/web.container";
import { FfmpegService } from "@services/media/ffmpeg.service";
import type { Encoder } from "@shared/types/ffmpeg.types";
import { waitProcessExits } from "@modules/process/process.async.actions";
import { removeFileProcess, setFileProcesses, setProcessProgress } from "@modules/encoder/encoder.reducer";
import FilesService from "@services/files/files.service";
import { PathService } from "@services/files/path.service";
import type { Media } from "@components/internal/encoder/type";
import { ProcessService } from "@services/common/process.service";

const createAsyncThunk = createAsyncActionGenerator("encoder");

type IgnoreAlreadyConvertedFilesParams = {
	format: string;
	files: Media[];
};

/**
 * Ignore files that are already converted to the target format.
 * Marks their progress as 100%
 * @warning This function only supports hevc, h264 and av1 for now
 * @warning Files will not be modified nor have an associated process
 */
export const ignoreAlreadyConvertedFiles = createAsyncThunk("skip-already-converted", ({ files, format }: IgnoreAlreadyConvertedFilesParams, { dispatch }) => {
	let alreadyConverted: Media[] = [];

	if (format.includes("hevc")) {
		alreadyConverted = files.filter((f) => f.property.streams.find((s) => s.codec_name === "hevc"));
	}

	if (format.includes("h264")) {
		alreadyConverted = files.filter((f) => f.property.streams.find((s) => s.codec_name === "h264"));
	}

	if (format.includes("av1")) {
		alreadyConverted = files.filter((f) => f.property.streams.find((s) => s.codec_name === "av1"));
	}

	if (alreadyConverted.length > 0) {
		for (const media of alreadyConverted) {
			dispatch(setProcessProgress({ path: media.file.path, value: 1 }));
		}
	}

	return alreadyConverted;
});

export const encoderConvertStates = {
	isConverting: false,
};

/**
 * Convert media files to the selected format
 * @throws Error if no format is selected
 * @throws Error if no files are selected
 */
export const convertMedia = createAsyncThunk("convert", async (_, { getState, dispatch, extra }) => {
	encoderConvertStates.isConverting = true;

	const state = getState();

	const { format, fps } = state.encoder.current;

	if (!format) throw new Error("Unknown format");

	const ffmpegService = getService(FfmpegService, extra);
	const fileService = getService(FilesService, extra);
	const pathService = getService(PathService, extra);

	const files = state.media.data;

	if (files.length === 0) throw new Error("No files to convert");

	// region Skip already converted files
	const alreadyConverted = await dispatch(
		ignoreAlreadyConvertedFiles({
			format,
			files,
		})
	).unwrap();

	// endregion Skip already converted files

	const parallelConversions = 3;

	const conversionBatches: Media[][] = files.reduce((acc, curr, index) => {
		const arrayIndex = index % parallelConversions;

		acc[arrayIndex] ??= [];

		acc[arrayIndex].push(curr);

		return acc;
	}, [] as Media[][]);

	await Promise.allSettled(
		conversionBatches.map(async (batch) => {
			for (const file of batch.filter((f) => !alreadyConverted.includes(f))) {
				if (!encoderConvertStates.isConverting) break;

				const outputPath = getConvertedFilePath(file.file.path);

				const pid = await ffmpegService.convert({
					format: { id: format },
					files: {
						input: file.file.path,
						output: outputPath,
					},
					fps,
				});

				dispatch(setFileProcesses({ path: file.file.path, pid }));

				const sourceNbFrames = ffmpegService.extractNbFrames(file.property);
				const sourceFps = ffmpegService.extractFps(file.property);
				const nbFrames = sourceFps > 0 ? Math.floor(sourceNbFrames * (fps / sourceFps)) : sourceNbFrames;

				const removeListener = window.preload.ipc.on.process.spawn.stderr((pid1, data) => {
					if (pid1 !== pid) return;

					const frame = ffmpegService.extractNbFrameProcessed(data);

					if (frame === null) return;

					const percentProgress = frame / nbFrames;

					dispatch(
						setProcessProgress({
							path: file.file.path,
							value: percentProgress,
						})
					);
				});

				try {
					await waitProcessExits(getState, pid);
				} catch {
					removeListener();
					break;
				}

				removeListener();

				if (!encoderConvertStates.isConverting) break;

				// Move converted file to original location
				const originalDir = pathService.dirname(file.file.path);

				const oldDir = pathService.join(originalDir, "old");

				const oldPath = pathService.join(oldDir, pathService.filename(file.file.path));

				await fileService.move(file.file.path, oldPath);

				await fileService.move(outputPath, file.file.path);
			}
		})
	);

	dispatch(removeFileProcess({ pids: getState().encoder.current.pids }));
});

export const SpecialEncodingProgressValues = {
	Aborted: -1,
};

export const stopConvertMedia = createAsyncThunk("stop-convert", async (_, { dispatch, getState, extra }) => {
	const state = getState();

	const pids = [...state.encoder.current.pids];

	encoderConvertStates.isConverting = false;

	if (pids.length === 0) return;

	const processService = getService(ProcessService, extra);

	for (const pid of pids) {
		await processService.kill(pid);

		await sleep(500);

		const currentPath = Object.entries(state.encoder.processes.pids).find(([, p]) => p === pid)?.[0];

		if (currentPath) {
			dispatch(
				setProcessProgress({
					path: currentPath,
					value: SpecialEncodingProgressValues.Aborted,
				})
			);
		}
	}

	dispatch(removeFileProcess({ pids }));
});

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getConvertedFilePath(filePath: string): string {
	const extensionIndex = filePath.lastIndexOf(".");

	if (extensionIndex === -1) {
		return `${filePath}_converted`;
	}

	const name = filePath.substring(0, extensionIndex);
	const extension = filePath.substring(extensionIndex);
	return `${name}_converted${extension}`;
}

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
