import { createAction } from "@reduxjs/toolkit";
import { createAsyncActionGenerator, getServices } from "@store/utils/utils.actions";
import { UpdateService } from "@services/update.service";
import type { UpdateStatus } from "@shared/types/update.types";

const createAsyncThunk = createAsyncActionGenerator("update");

export const updateStatusChanged = createAction<UpdateStatus>("update/status-changed");

/**
 * Follows the update status pushed by the main process
 */
export const initUpdate = createAsyncThunk("init", async (_, { extra, dispatch }) => {
	const services = getServices({ update: UpdateService }, extra);
	services.update.onStatus((status) => dispatch(updateStatusChanged(status)));
	dispatch(updateStatusChanged(await services.update.status()));
});

export const checkForUpdate = createAsyncThunk("check", async (_, { extra }) => {
	const services = getServices({ update: UpdateService }, extra);
	await services.update.check();
});

/**
 * Downloads the release found: only needed to go back to an older release (Dev to Stable) and in development
 */
export const downloadUpdate = createAsyncThunk("download", async (_, { extra }) => {
	const services = getServices({ update: UpdateService }, extra);
	await services.update.download();
});

export const installUpdate = createAsyncThunk("install", async (_, { extra }) => {
	const services = getServices({ update: UpdateService }, extra);
	await services.update.quitAndInstall();
});
