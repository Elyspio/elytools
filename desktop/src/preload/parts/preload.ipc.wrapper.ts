import { IpcHandledEvents } from "@shared/ipc/ipc.handled.events";
import { ipcRenderer } from "electron";
import { IpcSentEvents } from "@shared/ipc/ipc.sent.events";

export type SkipFirst<T extends unknown[]> = T extends [unknown, ...infer U] ? U : never;

export const ipcRendererWrapper = {
	invoke<Channel extends keyof IpcHandledEvents>(channel: Channel, ...args: SkipFirst<Parameters<IpcHandledEvents[Channel]>>): Promise<ReturnType<IpcHandledEvents[Channel]>> {
		return ipcRenderer.invoke(channel, ...args);
	},

	/**
	 * Adds a listener
	 * @param channel
	 * @param listener
	 */
	on<Channel extends keyof IpcSentEvents>(channel: Channel, listener: (...args: Parameters<IpcSentEvents[Channel]>) => void | Promise<void>) {
		ipcRenderer.on(channel, (_, ...args) => {
			// @ts-expect-error TS is dumb as usual
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			return void listener(_, ...args);
		});

		return this;
	},

	/**
	 * Adds a listener and returns a function to remove it
	 * @param channel
	 * @param listener
	 */
	onAndGetRemover<Channel extends keyof IpcSentEvents>(channel: Channel, listener: (...args: Parameters<IpcSentEvents[Channel]>) => void | Promise<void>) {
		this.on(channel, listener);

		return () => {
			this.removeListener(channel, listener as never);
		};
	},

	/**
	 * Removes a listener
	 * @param processSpawnStdout
	 * @param listener
	 */
	removeListener(processSpawnStdout: string, listener: (...args: never[]) => void) {
		ipcRenderer.removeListener(processSpawnStdout, listener as never);

		return this;
	},
};
