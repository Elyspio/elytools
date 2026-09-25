export const autoUpdate = {
	/**
	 * Délai en minutes entre les checks de mise à jour
	 */
	checkDelay: 60, // 1h
};

export const ports = {
	https: 51521,
	virtualPrinterPort: 6313,
};

export const names = {
	public: "Elytools",
	client: "aura",
	folder: "elytools",
	protocol: "elytools",
};

export const colors = {
	main: "#85BE55",
	frame: "#6FA246",
};

export const urlsHeadersFilter = [];
export const urlsRewriteCookie = [];

export const mainConfig = {
	autoUpdate,
	ports,
	names,
	colors,
	urlsHeadersFilter,
	urlsRewriteCookie,
};
