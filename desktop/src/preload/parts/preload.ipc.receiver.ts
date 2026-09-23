import { ipcRendererWrapper } from "./preload.ipc.wrapper";
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
			 * Écoute le process main pour recevoir la disponibilité d'une mise à jour
			 * @param callback
			 */
			available: (callback: (version: string) => void) => {
				ipcRendererWrapper.on("update:available", (_, version) => {
					callback(version);
				});
			},
			/**
			 * Event envoyé lors de la fin du téléchargement de la mise à jour
			 */
			downloaded: (callback: () => void) => {
				ipcRendererWrapper.on("update:download:end", () => {
					callback();
				});
			},
			/**
			 * Event envoyé lors de la progression du téléchargement de la mise à jour
			 */
			downloading: (callback: (progress: number) => void) => {
				ipcRendererWrapper.on("update:download:progress", (_, progress) => {
					callback(progress);
				});
			},
		},
	};
}

export type PreloadReceivedIpc = ReturnType<typeof getIpcReceiver>;
