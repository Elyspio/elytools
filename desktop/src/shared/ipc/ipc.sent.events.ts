/*************************************************************************************
 * Les événements IPC qui sont envoyés par le process main vers les browserWindow.
 *
 * Attention, on ne peut pas utiliser des types des librairies NodeJS, electron pour IpcSentEvents
 * *************************************************************************************/
import type { IpcMainInvokeEvent } from "electron";
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
	 * Event lors ce qu'une nouvelle version de l'application est disponible
	 * @param event
	 * @param version
	 */
	"update:available": (event: IpcMainInvokeEvent, version: string) => void;
	"update:download:end": (event: IpcMainInvokeEvent) => void;

	/**
	 * Mise à jour du téléchargement de la mise à jour
	 * @param event Événement IPC
	 * @param progress Progression du téléchargement en pourcentage
	 */
	"update:download:progress": (event: IpcMainInvokeEvent, progress: number) => void;

	/**
	 * La sortie standard d'un process spawn
	 * @param event Événement IPC
	 * @param pid Identifiant du process
	 * @param data Donnée reçue sur la sortie standard
	 */
	"process:spawn:stdout": (event: IpcMainInvokeEvent, pid: string, data: string) => void;

	/**
	 * La sortie d'erreur d'un process spawn
	 * @param event Événement IPC
	 * @param pid Identifiant du process
	 * @param data Donnée reçue sur la sortie d'erreur
	 */
	"process:spawn:stderr": (event: IpcMainInvokeEvent, pid: string, data: string) => void;

	/**
	 * Événement de fin d'un process spawn
	 * @param event Événement IPC
	 * @param pid Identifiant du process
	 * @param code Code de sortie du process
	 * @param signal Signal de sortie du process
	 */
	"process:spawn:exit": (event: IpcMainInvokeEvent, pid: string, code: number | null, signal: NodeJS.Signals | null) => void;
	"ssh:connection:status": (event: IpcMainInvokeEvent, payload: SshConnectionStatusEvent) => void;
	"ssh:transfer:progress": (event: IpcMainInvokeEvent, payload: SshTransferProgressEvent) => void;
	"ssh:command:chunk": (event: IpcMainInvokeEvent, payload: SshCommandChunkEvent) => void;
	"ssh:command:completed": (event: IpcMainInvokeEvent, payload: SshCommandCompletedEvent) => void;
};
