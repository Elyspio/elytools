import { CancellationToken, type CustomPublishOptions, type GithubOptions, HttpError, newError, parseXml, type XElement } from "builder-util-runtime";
import type { AppUpdater } from "electron-updater";
import { computeReleaseNotes, GitHubProvider } from "electron-updater/out/providers/GitHubProvider";
import { parseUpdateInfo, type ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import { newUrlFromBase } from "electron-updater/out/util";
import type { UpdateChannel } from "@shared/config/app.config";
import { pickReleaseTag } from "./update.status";

type ReleaseInfo = Awaited<ReturnType<GitHubProvider["getLatestVersion"]>>;

const tagRegExp = /\/tag\/(v?[^/]+)$/;

/**
 * Update provider of electron-updater (custom provider) reading the GitHub releases of the repository.
 *
 * The GitHub provider only follows the releases of one prerelease channel: here a channel also follows the more stable
 * releases (dev → stable) and the highest version wins ({@link pickReleaseTag}). Every release ships
 * latest*.yml (scripts/release/release.ts), downloads and SHA-512 checks are unchanged. The Atom feed can list tags
 * whose release is still a draft: only versions with publicly downloadable update metadata are offered. The feed only
 * lists the 10 latest releases: without a stable release among them (development builds published since), the latest
 * stable release comes from `/releases/latest`.
 */
export function releaseProvider(owner: string, repo: string, getChannel: () => UpdateChannel): CustomPublishOptions {
	class ReleaseProvider extends GitHubProvider {
		private readonly releasesPath = `/${owner}/${repo}/releases`;

		public constructor(
			options: CustomPublishOptions,
			private readonly appUpdater: AppUpdater,
			runtimeOptions: ProviderRuntimeOptions
		) {
			super({ ...options, provider: "github", owner, repo } satisfies GithubOptions, appUpdater, runtimeOptions);
		}

		public override async getLatestVersion(): Promise<ReleaseInfo> {
			const cancellationToken = new CancellationToken();
			const feedXml = await this.httpRequest(
				newUrlFromBase(`${this.releasesPath}.atom`, this.baseUrl),
				{ accept: "application/xml, application/atom+xml, text/xml, */*" },
				cancellationToken
			);
			const feed = parseXml(feedXml ?? "");
			const releases: { tag: string; entry: XElement | null }[] = feed.getElements("entry").flatMap((entry) => {
				const tag = tagRegExp.exec(entry.element("link").attribute("href"))?.[1];
				return tag ? [{ tag, entry }] : [];
			});
			if (
				pickReleaseTag(
					releases.map((release) => release.tag),
					"stable"
				) === null
			) {
				const latestStable = await this.latestStableTag(cancellationToken);
				if (latestStable) releases.push({ tag: latestStable, entry: null });
			}

			const channelFile = `${this.getDefaultChannelName()}.yml`;
			const channel = getChannel();
			let candidates = releases;
			while (candidates.length > 0) {
				const tag = pickReleaseTag(
					candidates.map((release) => release.tag),
					channel
				);
				const release = candidates.find((candidate) => candidate.tag === tag);
				if (!release) break;
				const channelFileUrl = newUrlFromBase(`${this.releasesPath}/download/${release.tag}/${channelFile}`, this.baseUrl);
				let rawData: string | null;
				try {
					rawData = await this.httpRequest(channelFileUrl, null, cancellationToken);
				} catch (error) {
					if (!(error instanceof HttpError) || error.statusCode !== 404) throw error;
					// Drafts and releases without metadata for this platform cannot be downloaded yet.
					candidates = candidates.filter((candidate) => candidate.tag !== tag);
					continue;
				}
				const info = parseUpdateInfo(rawData, channelFile, channelFileUrl);
				info.releaseName ??= release.entry?.elementValueOrEmpty("title") ?? release.tag;
				if (release.entry) info.releaseNotes ??= computeReleaseNotes(this.appUpdater.currentVersion, this.appUpdater.fullChangelog, feed, release.entry);
				return { tag: release.tag, ...info };
			}
			throw newError("No published versions on GitHub", "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
		}

		/**
		 * Tag of the latest stable release (GitHub excludes the prereleases and the drafts), null without any
		 */
		private async latestStableTag(cancellationToken: CancellationToken): Promise<string | null> {
			try {
				const rawData = await this.httpRequest(newUrlFromBase(`${this.releasesPath}/latest`, this.baseUrl), { accept: "application/json" }, cancellationToken);
				const tag = rawData ? (JSON.parse(rawData) as { tag_name?: unknown }).tag_name : null;
				return typeof tag === "string" ? tag : null;
			} catch (error) {
				// No stable release yet: 404, or 406 for the JSON answer
				if (error instanceof HttpError && (error.statusCode === 404 || error.statusCode === 406)) return null;
				throw error;
			}
		}
	}

	return { provider: "custom", updateProvider: ReleaseProvider, owner, repo };
}
