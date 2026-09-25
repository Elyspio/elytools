import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "@view/router/Router";
import { Provider } from "react-redux";
import { store } from "@store";
import { initApp } from "@modules/configuration/configuration.async.actions";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./main.scss";

void store.dispatch(initApp()).then(() => {
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<Provider store={store}>
				<RouterProvider router={router} />
			</Provider>
		</StrictMode>
	);
});
