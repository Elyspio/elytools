import { createSlice } from "@reduxjs/toolkit";
import type { UpdateStatus } from "@shared/types/update.types";
import { updateStatusChanged } from "./update.async.actions";

export type UpdateSliceState = {
	status: UpdateStatus | null;
};

const initialState: UpdateSliceState = {
	status: null,
};

const slice = createSlice({
	name: "update",
	initialState,
	reducers: {},
	extraReducers: (builder) => {
		builder.addCase(updateStatusChanged, (state, action) => {
			state.status = action.payload;
		});
	},
});

export const updateReducer = slice.reducer;
