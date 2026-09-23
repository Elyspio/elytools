export type NyaaTorrentItem = {
	id: string;
	title: string;
	torrentUrl: string;
	infoHash?: string;
	size: string;
	seeders: number;
	leechers: number;
	date: Date;
	category?: string;
};

export type TorrentAddResult = {
	success: boolean;
	duplicate?: boolean;
	message?: string;
};

export interface NyaaRssResult {
	readonly rss: Rss;
}

export interface Rss {
	readonly channel: Channel;
	readonly "@_xmlns:atom": string;
	readonly "@_xmlns:nyaa": string;
	readonly "@_version": string;
}

export interface Channel {
	readonly title: string;
	readonly description: string;
	readonly link: string;
	readonly "atom:link": AtomLink;
	readonly item: NyaaRawItem[];
}

export interface AtomLink {
	readonly "@_href": string;
	readonly "@_rel": string;
	readonly "@_type": string;
}

export interface NyaaRawItem {
	readonly title: string;
	readonly link: string;
	readonly guid: Guid;
	readonly pubDate: string;
	readonly "nyaa:seeders": number;
	readonly "nyaa:leechers": number;
	readonly "nyaa:downloads": number;
	readonly "nyaa:infoHash": string;
	readonly "nyaa:categoryId": NyaaCategoryId;
	readonly "nyaa:category": NyaaCategory;
	readonly "nyaa:size": string;
	readonly "nyaa:comments": number;
	readonly "nyaa:trusted": Nyaa;
	readonly "nyaa:remake": Nyaa;
	readonly description: string;
}

export interface Guid {
	readonly "#text": string;
	readonly "@_isPermaLink": string;
}

export type NyaaCategory = "Anime - English-translated" | "Literature - Raw" | "Anime - Raw";

export type NyaaCategoryId = "1_2" | "3_3" | "1_4";

export type Nyaa = "No" | "Yes";
