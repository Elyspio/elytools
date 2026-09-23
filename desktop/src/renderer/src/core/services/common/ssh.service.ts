import { injectable } from "inversify";
import type { SshCommandRequest, SshCommandRun, SshDirectoryListing, SshFolder, SshFolderInput, SshMachine, SshMachineInput, SshTransfer } from "@shared/types/ssh.types";

@injectable()
export class SshService {
	public async listFolders(): Promise<SshFolder[]> {
		return await window.preload.ipc.send.ssh.folders.list();
	}

	public async saveFolder(folder: SshFolderInput): Promise<SshFolder> {
		return await window.preload.ipc.send.ssh.folders.save(folder);
	}

	public async deleteFolder(folderId: string): Promise<void> {
		await window.preload.ipc.send.ssh.folders.delete(folderId);
	}

	public async listMachines(): Promise<SshMachine[]> {
		return await window.preload.ipc.send.ssh.machines.list();
	}

	public async saveMachine(machine: SshMachineInput): Promise<SshMachine> {
		return await window.preload.ipc.send.ssh.machines.save(machine);
	}

	public async deleteMachine(machineId: string): Promise<void> {
		await window.preload.ipc.send.ssh.machines.delete(machineId);
	}

	public async getMachineCredentials(machineId: string): Promise<{ password?: string; privateKey?: string }> {
		return await window.preload.ipc.send.ssh.machines.getCredentials(machineId);
	}

	public async openSession(machineId: string, remotePath?: string): Promise<SshDirectoryListing> {
		return await window.preload.ipc.send.ssh.sessions.open(machineId, remotePath);
	}

	public async closeSession(sessionId: string): Promise<void> {
		await window.preload.ipc.send.ssh.sessions.close(sessionId);
	}

	public async listDirectory(sessionId: string, remotePath?: string, useSudo?: boolean): Promise<SshDirectoryListing> {
		return await window.preload.ipc.send.ssh.sessions.listDirectory(sessionId, remotePath, useSudo);
	}

	public async download(sessionId: string, remotePath: string, localDirectory: string): Promise<SshTransfer> {
		return await window.preload.ipc.send.ssh.transfers.download(sessionId, remotePath, localDirectory);
	}

	public async upload(sessionId: string, localPath: string, remoteDirectory: string): Promise<SshTransfer> {
		return await window.preload.ipc.send.ssh.transfers.upload(sessionId, localPath, remoteDirectory);
	}

	public async cancelTransfer(transferId: string): Promise<void> {
		await window.preload.ipc.send.ssh.transfers.cancel(transferId);
	}

	public async runCommand(request: SshCommandRequest): Promise<SshCommandRun> {
		return await window.preload.ipc.send.ssh.command.run(request);
	}

	public async stopCommand(runId: string, runTargetId?: string): Promise<void> {
		await window.preload.ipc.send.ssh.command.stop(runId, runTargetId);
	}
}
