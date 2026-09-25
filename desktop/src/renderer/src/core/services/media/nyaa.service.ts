import { injectable } from "inversify";
import { NyaaTorrentItem } from "@shared/types/torrent.types";

@injectable()
export class NyaaService {
	async search(query: string): Promise<NyaaTorrentItem[]> {
		if (!query.trim()) return [];
		return await window.preload.ipc.send.torrent.nyaa.list(query);
	}
}
