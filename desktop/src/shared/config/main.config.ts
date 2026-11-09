const repository = { owner: "Elyspio", repo: "elytools" };

export const autoUpdate = {
	/** Minutes between two update checks */
	checkDelay: 60,
	/** GitHub repository of the releases (also in config/electron-builder.yml) */
	repository,
	releasesUrl: `https://github.com/${repository.owner}/${repository.repo}/releases`,
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
