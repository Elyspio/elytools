import { ipcRendererWrapper } from "./preload.ipc.wrapper";
import type { UpdateStatus } from "@shared/types/update.types";
import { SshCommandChunkEvent, SshCommandCompletedEvent, SshConnectionStatusEvent, SshTransferProgressEvent } from "@shared/types/ssh.types";

export function getIpcReceiver() {
	return {
		app: {
			deeplink: {
				handle: (callback: (link: string) => void) => {
					ipcRendererWrapper.on("app:deeplink:handle", (_, link) => {
						callback(link);
					});
				},
			},
			screen: {
				toggleFullScreen: (callback: (isMaximized: boolean) => void) => {
					ipcRendererWrapper.on("app:screen:toggle-full-screen", (_, isMaximized) => {
						callback(isMaximized);
					});
				},
			},
		},
		process: {
			spawn: {
				stdout: (callback: (pid: string, data: string) => void | Promise<void>) => {
					return ipcRendererWrapper.onAndGetRemover("process:spawn:stdout", (_, pid, data) => {
						void callback(pid, data);
					});
				},
				stderr: (callback: (pid: string, data: string) => void | Promise<void>) => {
					return ipcRendererWrapper.onAndGetRemover("process:spawn:stderr", (_, pid, data) => {
						void callback(pid, data);
					});
				},
				exit: (callback: (pid: string, code: number | null) => void | Promise<void>) => {
					return ipcRendererWrapper.onAndGetRemover("process:spawn:exit", (_, pid, code) => {
						void callback(pid, code);
					});
				},
			},
		},
		ssh: {
			connection: {
				status: (callback: (event: SshConnectionStatusEvent) => void) => {
					return ipcRendererWrapper.onAndGetRemover("ssh:connection:status", (_, payload) => {
						callback(payload);
					});
				},
			},
			transfer: {
				progress: (callback: (event: SshTransferProgressEvent) => void) => {
					return ipcRendererWrapper.onAndGetRemover("ssh:transfer:progress", (_, payload) => {
						callback(payload);
					});
				},
			},
			command: {
				chunk: (callback: (event: SshCommandChunkEvent) => void) => {
					return ipcRendererWrapper.onAndGetRemover("ssh:command:chunk", (_, payload) => {
						callback(payload);
					});
				},
				completed: (callback: (event: SshCommandCompletedEvent) => void) => {
					return ipcRendererWrapper.onAndGetRemover("ssh:command:completed", (_, payload) => {
						callback(payload);
					});
				},
			},
		},
		update: {
			/**
			 * Écoute les changements d'état de la mise à jour automatique
			 */
			status: (callback: (status: UpdateStatus) => void) => {
				ipcRendererWrapper.on("update:status", (_, status) => {
					callback(status);
				});
			},
		},
	};
}

export type PreloadReceivedIpc = ReturnType<typeof getIpcReceiver>;
