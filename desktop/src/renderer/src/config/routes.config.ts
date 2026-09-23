import { ReactNode } from "react";
import VideoSettingsIcon from "@mui/icons-material/VideoSettings";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import HomeIcon from "@mui/icons-material/Home";
import DnsIcon from "@mui/icons-material/Dns";
import { createElement } from "react";

export type RouteDescription = {
	name: string;
	description?: string;
	icon?: ReactNode;
	show: {
		// if this module will be shown in AppBoard
		appboard: boolean;
		// if it will be showed at top of the page
		name: boolean;
	};
};

export type RoutePath = "/" | "/internal/encoder" | "/internal/torrent" | "/internal/purge" | "/internal/ssh" | "/external/home-assistant";

const routesInfoBase: Record<RoutePath, RouteDescription> = {
	"/": {
		name: "Dashboard",
		show: {
			appboard: false,
			name: false,
		},
	},
	"/internal/encoder": {
		name: "Encoder",
		description: "Video encoder tools and settings",
		icon: createElement(VideoSettingsIcon),
		show: {
			appboard: true,
			name: true,
		},
	},
	"/internal/torrent": {
		name: "Torrent",
		description: "Search nyaa.si and send torrents to qBittorrent",
		icon: createElement(CloudDownloadIcon),
		show: {
			appboard: true,
			name: true,
		},
	},
	"/internal/purge": {
		name: "Purge",
		description: "Purge node_modules and build caches",
		icon: createElement(DeleteSweepIcon),
		show: {
			appboard: true,
			name: true,
		},
	},
	"/internal/ssh": {
		name: "SSH",
		description: "Operate machines, files and commands over SSH",
		icon: createElement(DnsIcon),
		show: {
			appboard: true,
			name: true,
		},
	},
	"/external/home-assistant": {
		name: "Home Assistant",
		description: "Access your Home Assistant instance",
		icon: createElement(HomeIcon),
		show: {
			appboard: true,
			name: true,
		},
	},
};

export const routes = Object.entries(routesInfoBase).reduce(
	(acc, [key, route]) => {
		acc[key] = { ...route, path: key };
		return acc;
	},
	{} as Record<RoutePath, RouteDescription & { path: RoutePath }>
);
