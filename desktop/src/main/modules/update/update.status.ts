import semver from "semver";
import type { UpdateInfo } from "electron-updater";
import type { UpdateChannel } from "@shared/config/app.config";
import type { UpdateState, UpdateStatus } from "@shared/types/update.types";

/**
 * A check must not replace a check in progress, nor a download in progress or ready to install
 */
export function canCheck(state: UpdateState): boolean {
	return state !== "checking" && state !== "downloading" && state !== "downloaded";
}

/**
 * Prerelease identifiers followed by a channel, besides the stable releases: the Dev channel also takes the stable releases
 */
const channelPrereleases: Record<UpdateChannel, readonly string[]> = {
	stable: [],
	dev: ["dev"],
};

/**
 * Release of a channel among the GitHub release tags (`v1.2.0`, `v1.3.0-dev.2`): the highest version followed by the
 * channel, so a stable release with a higher version replaces a development build
 */
export function pickReleaseTag(tags: readonly string[], channel: UpdateChannel): string | null {
	let best: string | null = null;
	for (const tag of tags) {
		if (!semver.valid(tag)) continue;
		const prerelease = semver.prerelease(tag)?.[0];
		if (prerelease !== undefined && !channelPrereleases[channel].includes(String(prerelease))) continue;
		if (best === null || semver.gt(tag, best)) best = tag;
	}
	return best;
}

export function isDowngrade(currentVersion: string, latestVersion: string) {
	return semver.lt(latestVersion, currentVersion);
}

export function fromUpdateInfo(info: Pick<UpdateInfo, "version" | "releaseDate" | "releaseNotes">): Pick<UpdateStatus, "latestVersion" | "releaseDate" | "releaseNotes"> {
	const notes = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((note) => note.note ?? "").join("\n") : info.releaseNotes;
	return {
		latestVersion: info.version,
		releaseDate: info.releaseDate || null,
		releaseNotes: notes?.trim() || null,
	};
}

/**
 * GitHub has no release for the channel: no stable release yet (`/releases/latest` answers 406) or no development build
 */
export function isNoReleaseError(error: { message: string; code?: string }) {
	return error.code === "ERR_UPDATER_NO_PUBLISHED_VERSIONS" || /Unable to find latest version on GitHub|No published versions on GitHub/.test(error.message);
}

/**
 * First line of an updater error, shortened: the full message (with the release feed) only goes to the logs
 */
export function shortErrorMessage(message: string, max = 200) {
	const line = message.split("\n")[0].trim();
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
