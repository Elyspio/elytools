import { ipcRendererWrapper } from "./preload.ipc.wrapper";
import type { UpdateStatus } from "@shared/types/update.types";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import type { EncoderQueueStatus } from "@shared/types/ffmpeg.types";
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
		encoder: {
			status: (callback: (status: EncoderQueueStatus) => void) => {
				return ipcRendererWrapper.onAndGetRemover("encoder:status", (_, status) => {
					callback(status);
				});
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
		auth: {
			oidc: {
				/**
				 * Écoute l'état des sessions des profils OIDC (vérification périodique, session expirée)
				 */
				status: (callback: (statuses: OidcAuthStatus[]) => void) => {
					ipcRendererWrapper.on("auth:oidc:status", (_, statuses) => {
						callback(statuses);
					});
				},
			},
		},
	};
}

export type PreloadReceivedIpc = ReturnType<typeof getIpcReceiver>;
