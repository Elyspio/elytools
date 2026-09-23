export const qbittorrentConfig = {
	/** Base URL of the qBittorrent Web API */
	baseUrl: (import.meta.env.VITE_QBITTORRENT_URL as string | undefined) ?? "https://torrent.elyspio.fr/",
	/** Username for qBittorrent Web API (leave empty to configure later) */
	username: (import.meta.env.VITE_QBITTORRENT_USERNAME as string | undefined) ?? "",
	/** Password for qBittorrent Web API (leave empty to configure later) */
	password: (import.meta.env.VITE_QBITTORRENT_PASSWORD as string | undefined) ?? "",
};
