import { createSlice } from "@reduxjs/toolkit";
import { setConfig } from "./configuration.async.actions";
import { ConfigurationState } from "@modules/configuration/configuration.types";
import { setSystemInformation } from "@modules/configuration/configuration.actions";

const initialState: ConfigurationState = {
	current: {} as ConfigurationState["current"],
	isWindowUnderSized: false,
	system: {},
};

export const slice = createSlice({
	name: "configuration",
	reducers: {},
	initialState,
	extraReducers: (builder) => {
		builder.addCase(setConfig.fulfilled, (state, action) => {
			state.current = action.meta.arg;
		});

		builder.addCase(setSystemInformation, (state, action) => {
			state.system = action.payload;
		});
	},
});

export const { reducer: configurationReducer } = slice;
