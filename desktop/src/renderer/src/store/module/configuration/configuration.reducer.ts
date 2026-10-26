import { createSlice } from "@reduxjs/toolkit";
import { reloadConfig, setConfig } from "./configuration.async.actions";
import { ConfigurationState } from "@modules/configuration/configuration.types";
import { closeSettings, openSettings, setAuthStatuses, setSystemInformation, setUpdateStatus } from "@modules/configuration/configuration.actions";

const initialState: ConfigurationState = {
	current: {} as ConfigurationState["current"],
	isWindowUnderSized: false,
	system: {},
	update: null,
	authStatuses: [],
	settings: { open: false },
};

export const slice = createSlice({
	name: "configuration",
	reducers: {},
	initialState,
	extraReducers: (builder) => {
		builder.addCase(setConfig.fulfilled, (state, action) => {
			state.current = action.meta.arg;
		});

		builder.addCase(reloadConfig.fulfilled, (state, action) => {
			state.current = action.payload;
		});

		builder.addCase(setSystemInformation, (state, action) => {
			state.system = action.payload;
		});

		builder.addCase(setUpdateStatus, (state, action) => {
			state.update = action.payload;
		});

		builder.addCase(setAuthStatuses, (state, action) => {
			state.authStatuses = action.payload;
		});

		builder.addCase(openSettings, (state, action) => {
			state.settings = { open: true, section: action.payload };
		});

		builder.addCase(closeSettings, (state) => {
			state.settings = { ...state.settings, open: false };
		});
	},
});

export const { reducer: configurationReducer } = slice;
