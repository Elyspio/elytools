import { toast } from "react-toastify";
import { SshService } from "@services/common/ssh.service";
import { createAsyncActionGenerator, getServices } from "@store/utils/utils.actions";
import { sshActions } from "./ssh.reducer";
import type { SshCommandRequest, SshFolderInput, SshMachineInput } from "@shared/types/ssh.types";

const createAsyncThunk = createAsyncActionGenerator("ssh");
let sshListenersBound = false;

export const loadFolders = createAsyncThunk("folders/load", async (_, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	return await services.ssh.listFolders();
});

export const loadMachines = createAsyncThunk("machines/load", async (_, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	return await services.ssh.listMachines();
});

export const saveFolder = createAsyncThunk("folders/save", async (folder: SshFolderInput, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	return await services.ssh.saveFolder(folder);
});

export const deleteFolder = createAsyncThunk("folders/delete", async (folderId: string, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	await services.ssh.deleteFolder(folderId);
});

export const saveMachine = createAsyncThunk("machines/save", async (machine: SshMachineInput, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	return await services.ssh.saveMachine(machine);
});

export const deleteMachine = createAsyncThunk("machines/delete", async (machineId: string, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	await services.ssh.deleteMachine(machineId);
});

export const openSession = createAsyncThunk("sessions/open", async ({ machineId, path }: { machineId: string; path?: string }, { extra, dispatch }) => {
	const services = getServices({ ssh: SshService }, extra);
	const listing = await services.ssh.openSession(machineId, path);
	dispatch(sshActions.setMachineConnectionState({ machineId, state: "connected" }));
	return listing;
});

export const refreshSession = createAsyncThunk("sessions/refresh", async ({ sessionId, path, useSudo }: { sessionId: string; path?: string; useSudo?: boolean }, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	return await services.ssh.listDirectory(sessionId, path, useSudo);
});

export const closeSession = createAsyncThunk("sessions/close", async (sessionId: string, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	await services.ssh.closeSession(sessionId);
});

export const startDownload = createAsyncThunk(
	"transfers/download",
	async ({ sessionId, remotePath, localDirectory }: { sessionId: string; remotePath: string; localDirectory: string }, { extra }) => {
		const services = getServices({ ssh: SshService }, extra);
		return await services.ssh.download(sessionId, remotePath, localDirectory);
	}
);

export const startUpload = createAsyncThunk(
	"transfers/upload",
	async ({ sessionId, localPath, remoteDirectory }: { sessionId: string; localPath: string; remoteDirectory: string }, { extra }) => {
		const services = getServices({ ssh: SshService }, extra);
		return await services.ssh.upload(sessionId, localPath, remoteDirectory);
	}
);

export const cancelTransfer = createAsyncThunk("transfers/cancel", async (transferId: string, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	await services.ssh.cancelTransfer(transferId);
});

export const runCommand = createAsyncThunk("command/run", async (request: SshCommandRequest, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	return await services.ssh.runCommand(request);
});

export const stopCommand = createAsyncThunk("command/stop", async ({ runId, runTargetId }: { runId: string; runTargetId?: string }, { extra }) => {
	const services = getServices({ ssh: SshService }, extra);
	await services.ssh.stopCommand(runId, runTargetId);
});

export const initSsh = createAsyncThunk("init", async (_, { dispatch }) => {
	await dispatch(loadFolders());
	await dispatch(loadMachines());

	if (sshListenersBound) return;
	sshListenersBound = true;

	window.preload.ipc.on.ssh.connection.status((event) => {
		dispatch(sshActions.setMachineConnectionState({ machineId: event.machineId, state: event.state }));
		if (event.error) {
			toast.error(event.error);
		}
	});

	window.preload.ipc.on.ssh.transfer.progress((event) => {
		dispatch(sshActions.updateTransferProgress(event));
		if (event.status === "failed" && event.error) {
			toast.error(event.error);
		}
	});

	window.preload.ipc.on.ssh.command.chunk((event) => {
		dispatch(sshActions.appendCommandChunk(event));
	});

	window.preload.ipc.on.ssh.command.completed((event) => {
		dispatch(sshActions.completeCommandTarget(event));
		if (event.status === "failed" && event.error) {
			toast.error(event.error);
		}
	});
});
