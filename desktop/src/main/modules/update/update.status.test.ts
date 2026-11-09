import { describe, expect, it } from "vite-plus/test";
import { canCheck, fromUpdateInfo, isDowngrade, isNoReleaseError, pickReleaseTag, shortErrorMessage } from "./update.status";

describe("canCheck", () => {
	it("allows a check when nothing is pending", () => {
		for (const state of ["idle", "up-to-date", "no-release", "available", "error"] as const) expect(canCheck(state)).toBe(true);
	});

	it("refuses a check while checking or once a download started", () => {
		for (const state of ["checking", "downloading", "downloaded"] as const) expect(canCheck(state)).toBe(false);
	});
});

describe("pickReleaseTag", () => {
	const tags = ["v0.3.1-dev.1", "v0.3.0", "v0.3.0-beta.2", "v0.2.0", "v0.2.0-dev.1", "v0.1.0-alpha.1", "nightly"];

	it("takes the highest version of the channel and of the stable releases", () => {
		expect(pickReleaseTag(tags, "stable")).toBe("v0.3.0");
		expect(pickReleaseTag(tags, "dev")).toBe("v0.3.1-dev.1");
	});

	it("prefers a stable release with a higher version", () => {
		expect(pickReleaseTag(["v0.2.0-dev.1", "v0.3.0"], "dev")).toBe("v0.3.0");
		expect(pickReleaseTag(["v0.3.0-dev.4", "v0.3.0"], "dev")).toBe("v0.3.0");
	});

	it("ignores the development builds on the stable channel, the other prereleases and the unknown tags", () => {
		expect(pickReleaseTag(["v0.4.0-dev.1", "v0.3.0"], "stable")).toBe("v0.3.0");
		expect(pickReleaseTag(["v0.4.0-beta.1", "v0.1.0-alpha.1", "nightly"], "dev")).toBeNull();
		expect(pickReleaseTag([], "dev")).toBeNull();
	});
});

describe("isDowngrade", () => {
	it("compares the versions with semver", () => {
		expect(isDowngrade("1.3.0-dev.1", "1.2.0")).toBe(true);
		expect(isDowngrade("1.3.0-dev.1", "1.3.0")).toBe(false);
		expect(isDowngrade("1.3.0-dev.2", "1.3.0-dev.1")).toBe(true);
		expect(isDowngrade("1.2.0", "1.10.0")).toBe(false);
	});
});

describe("fromUpdateInfo", () => {
	it("keeps the HTML release notes, trimmed", () => {
		expect(fromUpdateInfo({ version: "1.2.0", releaseDate: "2026-10-01T10:00:00.000Z", releaseNotes: "  <p>Notes</p>\n" })).toEqual({
			latestVersion: "1.2.0",
			releaseDate: "2026-10-01T10:00:00.000Z",
			releaseNotes: "<p>Notes</p>",
		});
	});

	it("joins the notes of several versions", () => {
		const status = fromUpdateInfo({
			version: "1.2.0",
			releaseDate: "",
			releaseNotes: [
				{ version: "1.2.0", note: "<p>B</p>" },
				{ version: "1.1.0", note: null },
			],
		});
		expect(status.releaseNotes).toBe("<p>B</p>");
		expect(status.releaseDate).toBeNull();
	});

	it("maps missing notes to null", () => {
		expect(fromUpdateInfo({ version: "1.2.0", releaseDate: "2026-10-01", releaseNotes: null }).releaseNotes).toBeNull();
		expect(fromUpdateInfo({ version: "1.2.0", releaseDate: "2026-10-01", releaseNotes: "  " }).releaseNotes).toBeNull();
	});
});

describe("isNoReleaseError", () => {
	it("recognizes a channel without release", () => {
		expect(isNoReleaseError({ message: "No published versions on GitHub", code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" })).toBe(true);
		expect(
			isNoReleaseError({
				message:
					"Cannot parse releases feed: Error: Unable to find latest version on GitHub (https://github.com/o/r/releases/latest), please ensure a production release exists",
				code: "ERR_UPDATER_INVALID_RELEASE_FEED",
			})
		).toBe(true);
		expect(isNoReleaseError({ message: "net::ERR_INTERNET_DISCONNECTED" })).toBe(false);
	});
});

describe("shortErrorMessage", () => {
	it("keeps the first line, shortened", () => {
		expect(shortErrorMessage("Cannot download\nXML: <feed>")).toBe("Cannot download");
		expect(shortErrorMessage("x".repeat(300))).toHaveLength(200);
	});
});
