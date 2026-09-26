import { ConfigurationService } from "@services/configuration.service";
import { createAsyncActionGenerator, getServices } from "../../utils/utils.actions";
import { addProcessStd, completeProcess } from "@modules/process/process.actions";
import { LatestConfig } from "@shared/config/app.config";
import { SystemService } from "@services/system/system.service";
import { setSystemInformation, setUpdateStatus } from "@modules/configuration/configuration.actions";
import { initSsh } from "@modules/ssh/ssh.async.actions";

const createAsyncThunk = createAsyncActionGenerator("configuration");

export const setConfig = createAsyncThunk("set", async (config: LatestConfig, { extra }) => {
	const services = getServices({ config: ConfigurationService }, extra);

	await services.config.set(config);
});

/**
 * Reloads the store from the configuration written by the main process (e.g. after an auth profile change)
 */
export const reloadConfig = createAsyncThunk("reload", async (_, { extra }) => {
	const services = getServices({ config: ConfigurationService }, extra);

	return await services.config.get();
});

export const regenerateConfig = createAsyncThunk("regenerate", async (_, { extra }) => {
	const services = getServices({ config: ConfigurationService }, extra);

	await services.config.regenerate();
});

export const initConfig = createAsyncThunk("init", async (_, { extra, dispatch, getState }) => {
	const services = getServices({ config: ConfigurationService, system: SystemService }, extra);

	await dispatch(setConfig(await services.config.get()));

	setInterval(() => {
		void (async () => {
			const state = getState();

			if (!state.config.current.frame.show.resourceUtilization) {
				return;
			}

			const [cpu, mem, gpu] = await Promise.all([services.system.cpuLoad(), services.system.memoryUsed(), services.system.gpuLoad()]);
			dispatch(
				setSystemInformation({
					cpuLoad: cpu,
					mem: mem,
					gpuLoad: gpu,
				})
			);
		})();
	}, 1000);
});

export const resetDimensions = createAsyncThunk("reset-dimensions", async () => {
	// const services = getServices({ window: WindowService }, extra);
	//
	// services.window.resetDimensions();
});

// export const watchWindowResize = createAsyncThunk("watch-window-resize", async (_, { extra, getState,  }) => {
// 	setInterval(() => {
// 		const {
// 			config: { current: config },
// 			routing: { routes, path },
// 		} = getState();
//
// 		const services = getServices({ window: WindowService, config: ConfigurationService }, extra);
//
// 		const current = routes[path];
// 		if (current?.autoResize.width || current?.autoResize.height) {
// 			const keys = Object.keys(config.frame.resize) as Array<keyof Configuration["frame"]["resize"]>;
// 			const dim = keys.filter((k) => config.frame.resize[k] && current.autoResize[k]);
// 			const delta = services.window.isUnderSized(dim);
// 			if (dim.map((d) => delta[d]).some((v) => v > 0)) {
// 				services.window.resize(delta);
// 			}
// 		}
// 	}, 250);
// });

export const initApp = createAsyncThunk("init-app", async (_, { dispatch }) => {
	await dispatch(initConfig());
	await dispatch(initSsh());
	// dispatch(watchWindowResize());

	window.preload.ipc.on.update.status((status) => dispatch(setUpdateStatus(status)));
	dispatch(setUpdateStatus(await window.preload.ipc.send.update.status()));

	window.preload.ipc.on.process.spawn.exit((pid, code) => {
		dispatch(completeProcess({ pid, exitStatus: code ?? -1 }));
	});

	window.preload.ipc.on.process.spawn.stdout((pid, data) => {
		dispatch(addProcessStd({ pid, type: "stdout", data }));
	});

	window.preload.ipc.on.process.spawn.stderr((pid, data) => {
		dispatch(addProcessStd({ pid, type: "stderr", data }));
	});
});
