import { createHashRouter, createRoutesFromElements, Route } from "react-router";
import { Root } from "../pages/Root";
import { HomeAssistant } from "@components/external/home-assistant/HomeAssistant";
import { Encoder } from "@components/internal/encoder/Encoder";
import { routes } from "@/config/routes.config";
import { Dashboard } from "@components/Dashboard";
import { Torrent } from "@components/internal/torrent/Torrent";
import { Purge } from "@components/internal/purge/Purge";
import { SSH } from "@components/internal/ssh/SSH";

const routesData = createRoutesFromElements(
	<Route path={"/"} element={<Root />}>
		<Route index element={<Dashboard />} />
		<Route id={routes["/external/home-assistant"].name} path={routes["/external/home-assistant"].path} element={<HomeAssistant />} />
		<Route id={routes["/internal/encoder"].name} path={routes["/internal/encoder"].path} element={<Encoder />} />
		<Route id={routes["/internal/torrent"].name} path={routes["/internal/torrent"].path} element={<Torrent />} />
		<Route id={routes["/internal/purge"].name} path={routes["/internal/purge"].path} element={<Purge />} />
		<Route id={routes["/internal/ssh"].name} path={routes["/internal/ssh"].path} element={<SSH />} />
	</Route>
);

export const router: ReturnType<typeof createHashRouter> = createHashRouter(routesData);
