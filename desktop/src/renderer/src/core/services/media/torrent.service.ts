import { injectable } from "inversify";
import type { TorrentAddResult } from "@shared/types/torrent.types";

@injectable()
export class TorrentService {
	async addTorrentFromUrl(torrentUrl: string, infoHash?: string): Promise<TorrentAddResult> {
		return await window.preload.ipc.send.torrent.qbittorrent.addFromUrl(torrentUrl, infoHash);
	}

	async getExistingHashes(): Promise<string[]> {
		return await window.preload.ipc.send.torrent.qbittorrent.getExistingHashes();
	}

	/**
	 * Extract the template from a title
	 * @example the Sorcerer Can See S01E06 VOSTFR 1080p WEB x264 AAC -Tsundere-Raws (CR).mkv -> the Sorcerer Can See S[XX]E[YY] VOSTFR 1080p WEB x264 AAC -Tsundere-Raws (CR).mkv
	 * @param title
	 */
	extractEpisodeInfos(title: string): {
		episodeTemplate: string;
		ep: number;
		season: number;
	} | null {
		const match = title.match(epSeasonAndNumber);

		if (!match) {
			return null;
		}

		const season = Number.parseInt(match[1]);
		const ep = Number.parseInt(match[2]);

		const episodeTemplate = title.replace(epSeasonAndNumber, "");

		return {
			ep,
			season,
			episodeTemplate,
		};
	}
}

const epSeasonAndNumber = /S(\d{2})E(\d{2})/i;
