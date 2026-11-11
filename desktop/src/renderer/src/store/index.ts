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
import { sshReducer } from "@modules/ssh/ssh.reducer";
import { updateReducer } from "@modules/update/update.reducer";

const reducers = combineReducers({
	config: configurationReducer,
	media: mediaSlice.reducer,
	encoder: encoderReducer,
	torrent: torrentReducer,
	ssh: sshReducer,
	update: updateReducer,
});

export const store = configureStore({
	reducer: reducers,

	middleware: (defaults) =>
		defaults({
			thunk: {
				extraArgument: {
					container: webContainer,
				},
			},
		}).concat(logErrorMiddleware),

	// Development only: a state given in the URL would otherwise be trusted by an installed app
	preloadedState: import.meta.env.DEV ? (getUriParam("store", { json: true, remove: true }) ?? undefined) : undefined,
});

export type StoreState = ReturnType<typeof store.getState>;

// Handle for the developer console, kept out of installed builds
if (import.meta.env.DEV) window.store = store;

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();

export const useAppSelector: TypedUseSelectorHook<StoreState> = useSelector;

export type ExtraArgument = {
	container: Container;
};
