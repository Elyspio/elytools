import { describe, expect, it, vi } from "vite-plus/test";
import { HttpError } from "builder-util-runtime";
import type { AppUpdater } from "electron-updater";
import type { GitHubProvider } from "electron-updater/out/providers/GitHubProvider";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import type { RequestOptions } from "node:http";
import semver from "semver";
import { releaseProvider } from "./release.provider";
import type { UpdateChannel } from "@shared/config/app.config";

function feed(tags: string[]) {
	return `<feed>${tags.map((tag) => `<entry><link href="https://github.com/o/r/releases/tag/${tag}"/><title>${tag}</title><content>Notes for ${tag}</content></entry>`).join("")}</feed>`;
}

function updateInfo(version: string) {
	return `version: ${version}\nfiles:\n  - url: app.exe\n    sha512: verified-by-electron-updater\nreleaseDate: 2026-10-12T00:00:00.000Z\n`;
}

function provider(tags: string[], assets: Record<string, string | Error>, channel: UpdateChannel = "stable", platform: "win32" | "linux" = "win32") {
	const request = vi.fn(async (options: RequestOptions) => {
		const path = String(options.path);
		if (path.endsWith(".atom")) return feed(tags);
		const result = assets[path];
		if (result instanceof Error) throw result;
		if (result === undefined) throw new Error(`Unexpected request: ${path}`);
		return result;
	});
	const options = releaseProvider("o", "r", () => channel);
	const updater = { currentVersion: new semver.SemVer("0.3.2"), fullChangelog: false } as AppUpdater;
	const runtime = { platform, executor: { request }, isUseMultipleRangeRequest: false } as unknown as ProviderRuntimeOptions;
	const instance = new options.updateProvider!(options, updater, runtime) as GitHubProvider;
	return { instance, request };
}

describe("release provider", () => {
	it("falls back from a draft tag in the feed to the latest downloadable release", async () => {
		const { instance, request } = provider(["v0.4.1", "v0.4.0"], {
			"/o/r/releases/download/v0.4.1/latest.yml": new HttpError(404, "Not Found"),
			"/o/r/releases/download/v0.4.0/latest.yml": updateInfo("0.4.0"),
		});
		await expect(instance.getLatestVersion()).resolves.toMatchObject({ tag: "v0.4.0", version: "0.4.0", releaseName: "v0.4.0", releaseNotes: "Notes for v0.4.0" });
		expect(request.mock.calls.map(([options]) => options.path)).toEqual([
			"/o/r/releases.atom",
			"/o/r/releases/download/v0.4.1/latest.yml",
			"/o/r/releases/download/v0.4.0/latest.yml",
		]);
	});

	it("reports no published versions when every eligible release returns 404", async () => {
		const { instance } = provider(["v0.4.1", "v0.4.0", "v0.5.0-dev.1"], {
			"/o/r/releases/download/v0.4.1/latest.yml": new HttpError(404),
			"/o/r/releases/download/v0.4.0/latest.yml": new HttpError(404),
		});
		await expect(instance.getLatestVersion()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" });
	});

	it("uses platform metadata and keeps the highest eligible version after several unavailable tags", async () => {
		const { instance, request } = provider(
			["v0.4.0", "v0.5.0-dev.2", "v0.6.0-dev.1", "v0.4.2", "v0.5.0-dev.1"],
			{
				"/o/r/releases/download/v0.6.0-dev.1/latest-linux.yml": new HttpError(404),
				"/o/r/releases/download/v0.5.0-dev.2/latest-linux.yml": new HttpError(404),
				"/o/r/releases/download/v0.5.0-dev.1/latest-linux.yml": updateInfo("0.5.0-dev.1"),
			},
			"dev",
			"linux"
		);
		const info = await instance.getLatestVersion();
		expect(info).toMatchObject({ tag: "v0.5.0-dev.1", version: "0.5.0-dev.1" });
		expect(request).toHaveBeenCalledTimes(4);
		const files = instance.resolveFiles(info);
		expect(files[0].url.href).toBe("https://github.com/o/r/releases/download/v0.5.0-dev.1/app.exe");
		expect(files[0].info.sha512).toBe("verified-by-electron-updater");
	});

	it.each([403, 429, 500])("preserves HTTP %i errors instead of hiding them with an older release", async (statusCode) => {
		const error = new HttpError(statusCode);
		const { instance, request } = provider(["v0.4.1", "v0.4.0"], { "/o/r/releases/download/v0.4.1/latest.yml": error });
		await expect(instance.getLatestVersion()).rejects.toBe(error);
		expect(request).toHaveBeenCalledTimes(2);
	});

	it("preserves network errors", async () => {
		const error = new Error("net::ERR_INTERNET_DISCONNECTED");
		const { instance } = provider(["v0.4.1", "v0.4.0"], { "/o/r/releases/download/v0.4.1/latest.yml": error });
		await expect(instance.getLatestVersion()).rejects.toBe(error);
	});

	it("preserves malformed update metadata errors", async () => {
		const { instance } = provider(["v0.4.1", "v0.4.0"], { "/o/r/releases/download/v0.4.1/latest.yml": "version: [" });
		await expect(instance.getLatestVersion()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO" });
	});

	it("takes the latest stable release outside the feed when only development builds are listed", async () => {
		const devBuilds = Array.from({ length: 10 }, (_, i) => `v0.5.0-dev.${10 - i}`);
		const { instance, request } = provider(devBuilds, {
			"/o/r/releases/latest": JSON.stringify({ tag_name: "v0.4.0" }),
			"/o/r/releases/download/v0.4.0/latest.yml": updateInfo("0.4.0"),
		});
		await expect(instance.getLatestVersion()).resolves.toMatchObject({ tag: "v0.4.0", version: "0.4.0", releaseName: "v0.4.0" });
		expect(request.mock.calls.map(([options]) => options.path)).toEqual(["/o/r/releases.atom", "/o/r/releases/latest", "/o/r/releases/download/v0.4.0/latest.yml"]);
	});

	it("does not ask for the latest stable release when the feed lists one", async () => {
		const { instance, request } = provider(["v0.5.0-dev.1", "v0.4.0"], { "/o/r/releases/download/v0.5.0-dev.1/latest.yml": updateInfo("0.5.0-dev.1") }, "dev");
		await expect(instance.getLatestVersion()).resolves.toMatchObject({ version: "0.5.0-dev.1" });
		expect(request.mock.calls.map(([options]) => options.path)).not.toContain("/o/r/releases/latest");
	});

	it.each([404, 406])("reports no published versions without any stable release (HTTP %i)", async (statusCode) => {
		const { instance } = provider(["v0.5.0-dev.1"], { "/o/r/releases/latest": new HttpError(statusCode) });
		await expect(instance.getLatestVersion()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_PUBLISHED_VERSIONS" });
	});

	it("retries the latest tag on the next check after a draft is published", async () => {
		const assets = {
			"/o/r/releases/download/v0.4.1/latest.yml": new HttpError(404) as string | Error,
			"/o/r/releases/download/v0.4.0/latest.yml": updateInfo("0.4.0"),
		};
		const { instance } = provider(["v0.4.1", "v0.4.0"], assets);
		await expect(instance.getLatestVersion()).resolves.toMatchObject({ version: "0.4.0" });
		assets["/o/r/releases/download/v0.4.1/latest.yml"] = updateInfo("0.4.1");
		await expect(instance.getLatestVersion()).resolves.toMatchObject({ version: "0.4.1" });
	});
});
