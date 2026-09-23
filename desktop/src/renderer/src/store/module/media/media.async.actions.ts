import { webContainer } from "@core/di/web.container";
import { DialogService } from "@services/electron/dialog.service";
import { createAsyncActionGenerator, getService } from "@store/utils/utils.actions";
import type { Media } from "@components/internal/encoder/type";
import type { FileInfo } from "@shared/types/dialog.types";
import FilesService from "@services/files/files.service";
import { IGNORE_DIR_NAMES } from "@components/internal/purge/purge.presets";
import { beginPurgeEstimate, setPurgeDeleteProgress, setPurgeEstimateProgress, setPurgeScanProgress } from "./media.actions";

const createAsyncThunk = createAsyncActionGenerator("media");

export const selectFolderOrFiles = createAsyncThunk("select/folder", async (mode: "folder" | "files") => {
	const processService = webContainer.get(DialogService);
	return await processService.selectFolder(mode === "files");
});

export const setMedias = createAsyncThunk("set", async (files: FileInfo[]) => {
	files = files.filter((f) => f.type === "file");

	const probes = await Promise.all(files.map(async (f) => [f, await window.preload.ipc.send.process.ffmpeg.probe(f.path)] as const));

	return probes.map(([file, probe]): Media => ({
		file,
		property: probe,
	}));
});

type ScanPurgeTargetsArgs = {
	root: string;
	matchNames: string[];
	estimateSizes: boolean;
};

export const scanPurgeTargets = createAsyncThunk("purge/scan", async ({ root, matchNames, estimateSizes }: ScanPurgeTargetsArgs, { dispatch, extra }) => {
	const filesService = getService(FilesService, extra);
	let lastProgressAt = 0;

	const targets = await filesService.scanDirectoriesByName(root, matchNames, {
		ignoreNames: IGNORE_DIR_NAMES,
		progress: (scannedFolders) => {
			const now = Date.now();
			if (now - lastProgressAt < 200) return;
			lastProgressAt = now;
			dispatch(setPurgeScanProgress(scannedFolders));
		},
	});

	let estimatedSize: number | null = null;

	if (estimateSizes && targets.length > 0) {
		dispatch(beginPurgeEstimate(targets.length));

		estimatedSize = await filesService.estimateDirectoriesSize(targets, (processed, total) => {
			dispatch(setPurgeEstimateProgress({ processed, total }));
		});
	}

	return {
		targets,
		estimatedSize,
	};
});

export const purgeMediaTargets = createAsyncThunk("purge/delete", async ({ targets }: { targets: string[] }, { dispatch }) => {
	let processed = 0;

	for (const target of targets) {
		await window.preload.ipc.send.file.delete(target, { recursive: true, force: true });
		processed += 1;
		dispatch(setPurgeDeleteProgress({ processed, total: targets.length }));
	}

	return { deleted: targets.length };
});
