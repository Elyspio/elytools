import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { getUriParam } from "@view/utils/url";
import { reducer as encoderReducer } from "./module/encoder/encoder.reducer";
import { torrentReducer } from "./module/torrent/torrent.reducer";
import { configurationReducer } from "./module/configuration/configuration.reducer";
import { mediaSlice } from "./module/media/media.reducer";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { Container } from "inversify";
import { logErrorMiddleware } from "@store/middlewares/log-error.middleware";
import { webContainer } from "@core/di/web.container";
import { processSlice } from "@modules/process/process.reducer";
import { sshReducer } from "@modules/ssh/ssh.reducer";

const reducers = combineReducers({
	config: configurationReducer,
	media: mediaSlice.reducer,
	encoder: encoderReducer,
	process: processSlice.reducer,
	torrent: torrentReducer,
	ssh: sshReducer,
});

export const store = configureStore({
	reducer: reducers,
	middleware: (defaults) =>
		defaults({
			serializableCheck: {
				ignoredActions: ["media/setCurrentProcess"],
			},
			thunk: {
				extraArgument: {
					container: webContainer,
				},
			},
		}).concat(logErrorMiddleware),
	preloadedState: getUriParam("store", { json: true, remove: true }) ?? undefined,
});

export type StoreState = ReturnType<typeof store.getState>;

window.store = store;

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<StoreState> = useSelector;

export type ExtraArgument = {
	container: Container;
};
