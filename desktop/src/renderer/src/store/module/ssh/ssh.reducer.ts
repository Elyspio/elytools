import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
	SshCommandChunkEvent,
	SshCommandCompletedEvent,
	SshCommandRun,
	SshConnectionState,
	SshDirectoryListing,
	SshFolder,
	SshMachine,
	SshTransfer,
	SshTransferProgressEvent,
} from "@shared/types/ssh.types";
import {
	cancelTransfer,
	closeSession,
	deleteFolder,
	deleteMachine,
	loadFolders,
	loadMachines,
	openSession,
	refreshSession,
	runCommand,
	saveFolder,
	saveMachine,
	startDownload,
	startUpload,
} from "./ssh.async.actions";

type RunTargetOutput = {
	stdout: string;
	stderr: string;
	status: "running" | "completed" | "failed" | "cancelled";
	exitCode?: number | null;
	error?: string;
};

type SshRunState = {
	meta: SshCommandRun;
	outputsByTargetId: Record<string, RunTargetOutput>;
	timeline: SshCommandChunkEvent[];
};

export type SshState = {
	machines: {
		items: SshMachine[];
		loading: boolean;
		filter: string;
		selectedMachineIds: string[];
		connectionStates: Record<string, SshConnectionState>;
	};
	folders: {
		items: SshFolder[];
		loading: boolean;
	};
	sessions: {
		byId: Record<string, SshDirectoryListing>;
		order: string[];
		activeSessionId?: string;
		loadingById: Record<string, boolean>;
	};
	transfers: {
		byId: Record<string, SshTransfer>;
		order: string[];
	};
	commands: {
		byId: Record<string, SshRunState>;
		order: string[];
	};
};

const initialState: SshState = {
	machines: {
		items: [],
		loading: false,
		filter: "",
		selectedMachineIds: [],
		connectionStates: {},
	},
	folders: {
		items: [],
		loading: false,
	},
	sessions: {
		byId: {},
		order: [],
		loadingById: {},
	},
	transfers: {
		byId: {},
		order: [],
	},
	commands: {
		byId: {},
		order: [],
	},
};

const slice = createSlice({
	name: "ssh",
	initialState,
	reducers: {
		setFilter(state, action: PayloadAction<string>) {
			state.machines.filter = action.payload;
		},
		toggleMachineSelection(state, action: PayloadAction<string>) {
			const machineId = action.payload;
			state.machines.selectedMachineIds = state.machines.selectedMachineIds.includes(machineId)
				? state.machines.selectedMachineIds.filter((id) => id !== machineId)
				: [...state.machines.selectedMachineIds, machineId];
		},
		setMachineSelection(state, action: PayloadAction<string[]>) {
			state.machines.selectedMachineIds = action.payload;
		},
		setActiveSession(state, action: PayloadAction<string | undefined>) {
			state.sessions.activeSessionId = action.payload;
		},
		setMachineConnectionState(state, action: PayloadAction<{ machineId: string; state: SshConnectionState }>) {
			state.machines.connectionStates[action.payload.machineId] = action.payload.state;
		},
		updateTransferProgress(state, action: PayloadAction<SshTransferProgressEvent>) {
			const current = state.transfers.byId[action.payload.transferId];
			if (!current) return;
			current.status = action.payload.status;
			current.transferredBytes = action.payload.transferredBytes;
			current.totalBytes = action.payload.totalBytes;
			current.error = action.payload.error;
		},
		appendCommandChunk(state, action: PayloadAction<SshCommandChunkEvent>) {
			const run = state.commands.byId[action.payload.runId];
			if (!run) return;

			run.timeline.push(action.payload);

			const output = run.outputsByTargetId[action.payload.runTargetId];
			if (!output) return;

			if (action.payload.stream === "stdout") {
				output.stdout += action.payload.data;
			} else {
				output.stderr += action.payload.data;
			}
		},
		completeCommandTarget(state, action: PayloadAction<SshCommandCompletedEvent>) {
			const run = state.commands.byId[action.payload.runId];
			if (!run) return;

			const output = run.outputsByTargetId[action.payload.runTargetId];
			if (!output) return;

			output.status = action.payload.status;
			output.exitCode = action.payload.exitCode;
			output.error = action.payload.error;
		},
	},
	extraReducers: (builder) => {
		builder.addCase(loadFolders.pending, (state) => {
			state.folders.loading = true;
		});
		builder.addCase(loadFolders.fulfilled, (state, action) => {
			state.folders.loading = false;
			state.folders.items = action.payload;
		});
		builder.addCase(loadFolders.rejected, (state) => {
			state.folders.loading = false;
		});
		builder.addCase(loadMachines.pending, (state) => {
			state.machines.loading = true;
		});
		builder.addCase(loadMachines.fulfilled, (state, action) => {
			state.machines.loading = false;
			state.machines.items = action.payload;
		});
		builder.addCase(loadMachines.rejected, (state) => {
			state.machines.loading = false;
		});
		builder.addCase(saveMachine.fulfilled, (state, action) => {
			const next = state.machines.items.filter((machine) => machine.id !== action.payload.id);
			next.push(action.payload);
			state.machines.items = next.sort((a, b) => a.name.localeCompare(b.name));
		});
		builder.addCase(saveFolder.fulfilled, (state, action) => {
			const next = state.folders.items.filter((folder) => folder.id !== action.payload.id);
			next.push(action.payload);
			state.folders.items = next.sort((a, b) => a.name.localeCompare(b.name));
		});
		builder.addCase(deleteFolder.fulfilled, (state, action) => {
			state.folders.items = state.folders.items.filter((folder) => folder.id !== action.meta.arg);
			for (const machine of state.machines.items) {
				if (machine.folderId === action.meta.arg) {
					machine.folderId = null;
				}
			}
		});
		builder.addCase(deleteMachine.fulfilled, (state, action) => {
			state.machines.items = state.machines.items.filter((machine) => machine.id !== action.meta.arg);
			state.machines.selectedMachineIds = state.machines.selectedMachineIds.filter((machineId) => machineId !== action.meta.arg);
			delete state.machines.connectionStates[action.meta.arg];
			for (const [sessionId, session] of Object.entries(state.sessions.byId)) {
				if (session.machineId !== action.meta.arg) continue;
				delete state.sessions.byId[sessionId];
				delete state.sessions.loadingById[sessionId];
				state.sessions.order = state.sessions.order.filter((id) => id !== sessionId);
			}
			if (state.sessions.activeSessionId && !state.sessions.byId[state.sessions.activeSessionId]) {
				state.sessions.activeSessionId = state.sessions.order.at(0);
			}
		});
		builder.addCase(openSession.fulfilled, (state, action) => {
			state.sessions.byId[action.payload.sessionId] = action.payload;
			if (!state.sessions.order.includes(action.payload.sessionId)) {
				state.sessions.order.push(action.payload.sessionId);
			}
			state.sessions.activeSessionId = action.payload.sessionId;
			state.sessions.loadingById[action.payload.sessionId] = false;
		});
		builder.addCase(refreshSession.pending, (state, action) => {
			state.sessions.loadingById[action.meta.arg.sessionId] = true;
		});
		builder.addCase(refreshSession.fulfilled, (state, action) => {
			state.sessions.byId[action.payload.sessionId] = action.payload;
			state.sessions.loadingById[action.payload.sessionId] = false;
		});
		builder.addCase(refreshSession.rejected, (state, action) => {
			state.sessions.loadingById[action.meta.arg.sessionId] = false;
		});
		builder.addCase(closeSession.fulfilled, (state, action) => {
			delete state.sessions.byId[action.meta.arg];
			delete state.sessions.loadingById[action.meta.arg];
			state.sessions.order = state.sessions.order.filter((id) => id !== action.meta.arg);
			if (state.sessions.activeSessionId === action.meta.arg) {
				state.sessions.activeSessionId = state.sessions.order.at(-1);
			}
		});
		builder.addCase(startDownload.fulfilled, (state, action) => {
			state.transfers.byId[action.payload.id] = action.payload;
			state.transfers.order = [action.payload.id, ...state.transfers.order.filter((id) => id !== action.payload.id)];
		});
		builder.addCase(startUpload.fulfilled, (state, action) => {
			state.transfers.byId[action.payload.id] = action.payload;
			state.transfers.order = [action.payload.id, ...state.transfers.order.filter((id) => id !== action.payload.id)];
		});
		builder.addCase(cancelTransfer.fulfilled, (state, action) => {
			const transfer = state.transfers.byId[action.meta.arg];
			if (!transfer) return;
			transfer.status = "cancelled";
		});
		builder.addCase(runCommand.fulfilled, (state, action) => {
			state.commands.byId[action.payload.id] = {
				meta: action.payload,
				outputsByTargetId: action.payload.targets.reduce<Record<string, RunTargetOutput>>((acc, target) => {
					acc[target.runTargetId] = {
						stdout: "",
						stderr: "",
						status: "running",
					};
					return acc;
				}, {}),
				timeline: [],
			};
			state.commands.order = [action.payload.id, ...state.commands.order.filter((id) => id !== action.payload.id)];
		});
	},
});

export const sshReducer = slice.reducer;
export const sshActions = slice.actions;
