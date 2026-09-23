import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { addProcessStd, completeProcess, setCurrentProcess } from "@modules/process/process.actions";

type ProcessState = {
	byPids: {
		[pid: string]: {
			stdout: string;
			stderr: string;
			exitStatus?: number;
		};
	};
	current?: string;
};
const initialState: ProcessState = {
	byPids: {},
};

export const processSlice = createSlice({
	name: "process",
	initialState,
	reducers: {
		setProcessExistStatus: (state, action: PayloadAction<{ pid: string; existStatus: number }>) => {
			const { pid, existStatus } = action.payload;
			state.byPids[pid].exitStatus = existStatus;
		},
	},
	extraReducers: (builder) => {
		builder.addCase(addProcessStd, (state, action) => {
			const { pid, type, data } = action.payload;
			if (!state.byPids[pid]) {
				state.byPids[pid] = { stdout: "", stderr: "" };
			}
			state.byPids[pid][type] += data + "\n";
		});

		builder.addCase(completeProcess, (state, action) => {
			// // Mark the process as completed
			// // and clear the current std to free up memory
			state.byPids[action.payload.pid] = {
				stdout: "",
				stderr: "",
				exitStatus: action.payload.exitStatus,
			};
			state.current = undefined;
		});

		builder.addCase(setCurrentProcess, (state, action) => {
			state.current = action.payload?.pid;
		});
	},
});

export const { setProcessExistStatus } = processSlice.actions;
