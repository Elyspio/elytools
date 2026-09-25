import { createAsyncActionGenerator, getService } from "@store/utils/utils.actions";
import { TorrentService } from "@services/media/torrent.service";
import { NyaaTorrentItem } from "@shared/types/torrent.types";
import { StringService } from "@services/common/string.service";
import { DataService } from "@services/common/data.service";
import type { GetTorrentGroupedResult } from "@modules/torrent/torrent.types";
import { torrentActions } from "@modules/torrent/torrent.reducer";

const createAsyncThunk = createAsyncActionGenerator("torrent");

export const searchTorrents = createAsyncThunk("search", async (query: string, { extra, getState, dispatch }) => {
	let torrents = await window.preload.ipc.send.torrent.nyaa.list(query);

	torrents = torrents.filter((torrent) => torrent.seeders > 0);

	const state = getState();

	const results: GetTorrentGroupedResult[] = [];

	if (state.torrent.parseEpisodeInfos) {
		const stringService = getService(StringService, extra);
		const torrentService = getService(TorrentService, extra);
		const dataService = getService(DataService, extra);

		const similars = stringService.findSimilar(torrents, (t) => t.title);

		const extracted = similars.map((d) =>
			d.map((datum) => ({
				...datum,
				infos: torrentService.extractEpisodeInfos(datum.title),
			}))
		);

		for (const torrents of extracted.filter((t) => t.every((i) => i.infos))) {
			results.push({
				max: dataService.maxBy(torrents, (i) => i.infos!.ep)?.infos!.ep ?? 0,
				min: dataService.minBy(torrents, (i) => i.infos!.ep)?.infos!.ep ?? 0,
				template: torrents[0].infos!.episodeTemplate,
				data: torrents,
			});
		}
	} else {
		for (const torrent of torrents) {
			results.push({
				template: torrent.title,
				data: [torrent],
			});
		}
	}

	// Pre-check duplicates against qBittorrent
	try {
		const torrentService = getService(TorrentService, extra);
		const existingHashes = await torrentService.getExistingHashes();
		const existingSet = new Set(existingHashes.map((h) => h.toLowerCase()));

		for (const group of results) {
			for (const item of group.data) {
				if (item.infoHash && existingSet.has(item.infoHash.toLowerCase())) {
					dispatch(torrentActions.setSendStatus({ id: item.id, status: "duplicate" }));
				}
			}
		}
	} catch {
		// qBittorrent unreachable, skip duplicate check
	}

	return results;
});

export const sendTorrent = createAsyncThunk("send", async (item: NyaaTorrentItem, { extra }) => {
	const torrentService = getService(TorrentService, extra);

	if (!item.torrentUrl) {
		throw new Error("torrent URL available for this entry");
	}

	const result = await torrentService.addTorrentFromUrl(item.torrentUrl, item.infoHash);

	return { id: item.id, duplicate: result.duplicate ?? false };
});

export const sendTorrentGroup = createAsyncThunk("sendGroup", async (group: GetTorrentGroupedResult, { extra, dispatch }) => {
	const torrentService = getService(TorrentService, extra);

	let existingHashes: string[] = [];
	try {
		existingHashes = await torrentService.getExistingHashes();
	} catch {
		// If we can't fetch hashes, proceed without duplicate check
	}

	const existingSet = new Set(existingHashes.map((h) => h.toLowerCase()));

	for (const item of group.data) {
		if (!item.torrentUrl) {
			dispatch(torrentActions.setSendStatus({ id: item.id, status: "error" }));
			continue;
		}

		if (item.infoHash && existingSet.has(item.infoHash.toLowerCase())) {
			dispatch(torrentActions.setSendStatus({ id: item.id, status: "duplicate" }));
			continue;
		}

		dispatch(torrentActions.setSendStatus({ id: item.id, status: "sending" }));

		try {
			await torrentService.addTorrentFromUrl(item.torrentUrl);
			dispatch(torrentActions.setSendStatus({ id: item.id, status: "success" }));
		} catch {
			dispatch(torrentActions.setSendStatus({ id: item.id, status: "error" }));
		}
	}

	return group.template;
});
