/*************************************************************************************
 * Les événements IPC qui sont envoyés par le process main vers les browserWindow.
 *
 * Attention, on ne peut pas utiliser des types des librairies NodeJS, electron pour IpcSentEvents
 * *************************************************************************************/
import type { IpcMainInvokeEvent } from "electron";
import type { UpdateStatus } from "@shared/types/update.types";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import type { EncoderQueueStatus } from "@shared/types/ffmpeg.types";
import type { SshCommandChunkEvent, SshCommandCompletedEvent, SshConnectionStatusEvent, SshTransferProgressEvent } from "@shared/types/ssh.types";

export type IpcSentEvents = {
	/**
	 * L'application à reçu un deeplink et demande la gestion à MonSisra.Front
	 */
	"app:deeplink:handle": (event: IpcMainInvokeEvent, url: string) => void;
	/**
	 * Gestion du plein écran
	 */
	"app:screen:toggle-full-screen": (event: IpcMainInvokeEvent, isMaximized: boolean) => void;
	/**
	 * État de la mise à jour automatique (vérification, disponibilité, téléchargement), à chaque changement
	 */
	"update:status": (event: IpcMainInvokeEvent, status: UpdateStatus) => void;
	/**
	 * État des sessions des profils OIDC, après chaque vérification périodique et à chaque changement de santé
	 */
	"auth:oidc:status": (event: IpcMainInvokeEvent, statuses: OidcAuthStatus[]) => void;

	/**
	 * État de la file d'encodage, à chaque changement (phase d'un fichier, progression, résultat d'analyse)
	 */
	"encoder:status": (event: IpcMainInvokeEvent, status: EncoderQueueStatus) => void;
	"ssh:connection:status": (event: IpcMainInvokeEvent, payload: SshConnectionStatusEvent) => void;
	"ssh:transfer:progress": (event: IpcMainInvokeEvent, payload: SshTransferProgressEvent) => void;
	"ssh:command:chunk": (event: IpcMainInvokeEvent, payload: SshCommandChunkEvent) => void;
	"ssh:command:completed": (event: IpcMainInvokeEvent, payload: SshCommandCompletedEvent) => void;
};
