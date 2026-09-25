export type NyaaTorrentItem = {
	id: string;
	title: string;
	magnet?: string;
	torrentUrl?: string;
	pageUrl?: string;
	size?: string;
	seeders?: number;
	leechers?: number;
	date?: string;
	category?: string;
	trusted?: boolean;
};

export type TorrentAddResult = {
	success: boolean;
	message?: string;
};
