import { NyaaTorrentItem } from "@shared/types/torrent.types";

export type SendStatus = "sending" | "success" | "error" | "duplicate";

export type TorrentState = {
	query: string;
	results: GetTorrentGroupedResult[];
	parseEpisodeInfos: boolean;
	loading: boolean;
	sendStatuses: Record<string, SendStatus>;
};

export type GetTorrentGroupedResult = {
	template: string;
	min?: number;
	max?: number;
	data: NyaaTorrentItem[];
};
