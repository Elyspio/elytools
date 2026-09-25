import { XMLParser } from "fast-xml-parser";
import { injectable } from "inversify";
import { LogModule } from "@main/modules/log.module";
import type { NyaaRawItem, NyaaRssResult, NyaaTorrentItem } from "@shared/types/torrent.types";

const RSS_URL = "https://nyaa.si/?page=rss&f=0&c=0_0";

@injectable()
export class NyaaModule extends LogModule {
	private parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

	constructor() {
		super("NyaaModule");
	}

	async list(query: string): Promise<NyaaTorrentItem[]> {
		const trimmed = query.trim();
		if (!trimmed) return [];

		const url = `${RSS_URL}&q=${trimmed.replaceAll(" ", "+")}`;
		this.logger.debug("Fetching nyaa feed", url);

		const res = await fetch(url, { method: "GET" });
		if (!res.ok) {
			throw new Error(`Failed to query nyaa.to (${res.status})`);
		}

		const xml = await res.text();

		const json = this.parser.parse(xml) as NyaaRssResult;

		const items = json?.rss?.channel?.item ?? [];

		const normalized = (Array.isArray(items) ? items : [items]).filter(Boolean).map((item) => this.normalizeItem(item));

		return normalized.filter((i): i is NyaaTorrentItem => !!i.id && !!i.title);
	}

	private normalizeItem(item: NyaaRawItem): NyaaTorrentItem {
		const seeders = this.toNumber(item["nyaa:seeders"])!;
		const leechers = this.toNumber(item["nyaa:leechers"])!;

		return {
			id: this.parseId(item),
			title: item.title ?? "",
			torrentUrl: item.link,
			infoHash: item["nyaa:infoHash"],
			size: item["nyaa:size"],
			seeders,
			leechers,
			date: new Date(item.pubDate),
		};
	}

	private static readonly extractIdFromItem = /\/(\d+.)torrent$/;

	private parseId(item: NyaaRawItem) {
		if (item.link.endsWith(".torrent")) {
			const id = NyaaModule.extractIdFromItem.exec(item.link)?.[1];

			if (!id) throw new Error(`Failed to extract id from nyaa item ${item.link}`);

			return id;
		}

		if (item.link.startsWith("magnet:")) {
			const url = new URL(item.link);
			const xt = url.searchParams.get("xt");
			if (xt) {
				const match = /urn:btih:(\w+)/.exec(xt);
				if (match) {
					return match[1];
				}
			}
		}

		throw new Error(`Failed to extract id from nyaa item ${item.link}`);
	}

	private toNumber(val: unknown): number | undefined {
		if (val === undefined || val === null) return undefined;
		const num = Number(val);
		return Number.isNaN(num) ? undefined : num;
	}
}
