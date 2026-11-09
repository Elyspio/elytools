import { describe, expect, it } from "vite-plus/test";
import {
	devReleaseNotes,
	devReleaseProblems,
	devTags,
	nextDevVersion,
	parseReleaseVersion,
	releaseAssets,
	releasedVersions,
	releaseProblems,
	type DevRepositoryState,
	type RepositoryState,
} from "./release";

const cleanMain: RepositoryState = { branch: "main", dirty: false, upToDate: true, tags: ["v0.1.0", "v0.2.0-dev.1"] };

describe("parseReleaseVersion", () => {
	it("accepts a stable version", () => {
		expect(parseReleaseVersion("1.2.0")).toEqual({ version: "1.2.0", tag: "v1.2.0", prerelease: false });
	});

	it("refuses invalid versions and every prerelease", () => {
		for (const version of ["1.2", "v1.2.0x", "1.2.0-rc.1", "1.2.0-beta.1", "1.2.0-dev.1", "1.2.0+build.1"]) {
			expect(() => parseReleaseVersion(version), version).toThrow();
		}
	});
});

describe("releasedVersions", () => {
	it("keeps the stable versions only, newest first", () => {
		expect(releasedVersions(["v1.9.0", "v1.10.0", "v1.11.0-dev.2", "v1.10.1-beta.1", "vnext"])).toEqual(["1.10.0", "1.9.0"]);
	});
});

describe("releaseProblems", () => {
	it("accepts a new version from an up to date main", () => {
		expect(releaseProblems(parseReleaseVersion("0.2.0"), cleanMain)).toEqual([]);
	});

	it("reports every problem of the repository", () => {
		const problems = releaseProblems(parseReleaseVersion("0.1.0"), { branch: "feat/x", dirty: true, upToDate: false, tags: ["v0.1.0"] });
		expect(problems).toHaveLength(5);
	});

	it("refuses a version lower than the latest release", () => {
		expect(releaseProblems(parseReleaseVersion("0.1.5"), { ...cleanMain, tags: ["v0.2.0"] })).toEqual(["Version 0.1.5 must be greater than the latest tag v0.2.0"]);
	});

	it("ignores tags that are not versions and the development builds", () => {
		expect(releaseProblems(parseReleaseVersion("0.2.0"), { ...cleanMain, tags: ["vnext", "v0.1.0", "v0.2.0-dev.3"] })).toEqual([]);
	});
});

const pushedBranch: DevRepositoryState = { branch: "feat/x", dirty: false, upstream: "origin/feat/x", pushed: true };

describe("devReleaseProblems", () => {
	it("accepts any pushed branch, main included", () => {
		expect(devReleaseProblems(pushedBranch)).toEqual([]);
		expect(devReleaseProblems({ ...pushedBranch, branch: "main", upstream: "origin/main" })).toEqual([]);
	});

	it("requires a clean, pushed branch", () => {
		expect(devReleaseProblems({ ...pushedBranch, dirty: true })).toEqual(["The working tree has uncommitted changes"]);
		expect(devReleaseProblems({ ...pushedBranch, pushed: false })).toEqual(["HEAD is not origin/feat/x: push or pull first"]);
		expect(devReleaseProblems({ ...pushedBranch, upstream: null, pushed: false })).toHaveLength(1);
		expect(devReleaseProblems({ ...pushedBranch, branch: "HEAD" })).toHaveLength(1);
	});
});

describe("nextDevVersion", () => {
	it("starts at dev.1 of the version of package.json", () => {
		expect(nextDevVersion("0.2.0", ["v0.1.0"])).toEqual({ version: "0.2.0-dev.1", tag: "v0.2.0-dev.1", prerelease: true });
	});

	it("follows the development builds of the same version", () => {
		expect(nextDevVersion("0.2.0", ["v0.1.0", "v0.2.0-dev.1", "v0.2.0-dev.9", "v0.1.0-dev.20"]).version).toBe("0.2.0-dev.10");
	});

	it("drops the prerelease of package.json", () => {
		expect(nextDevVersion("0.2.0-beta.1", ["v0.1.0"]).version).toBe("0.2.0-dev.1");
	});

	it("never goes below the latest development build", () => {
		// A branch still at 0.1.0 continues the numbering of 0.2.0
		const tags = ["v0.1.0", ...[1, 2, 3].map((n) => `v0.2.0-dev.${n}`)];
		expect(nextDevVersion("0.1.0", tags).version).toBe("0.2.0-dev.4");
	});

	it("moves to the next patch once the version is released", () => {
		expect(nextDevVersion("0.2.0", ["v0.2.0", "v0.2.0-dev.4"]).version).toBe("0.2.1-dev.1");
		expect(nextDevVersion("0.2.0", ["v0.3.0", "v0.3.1-dev.2"]).version).toBe("0.3.1-dev.3");
	});
});

describe("devTags", () => {
	it("lists the development builds, newest first", () => {
		expect(devTags(["v0.1.0", "v0.2.0-dev.2", "v0.2.0-dev.10", "v0.2.1-dev.1"])).toEqual(["v0.2.1-dev.1", "v0.2.0-dev.10", "v0.2.0-dev.2"]);
	});
});

describe("devReleaseNotes", () => {
	it("lists the commits since the previous development build", () => {
		expect(devReleaseNotes("feat/x", "abc1234", "v0.2.0-dev.1", ["abc1234 fix: b", "def5678 feat: a"])).toBe(
			["Development build from `feat/x` @ abc1234.", "", "Commits since v0.2.0-dev.1:", "", "- abc1234 fix: b", "- def5678 feat: a", ""].join("\n")
		);
	});

	it("handles the first build and an empty range", () => {
		expect(devReleaseNotes("main", "abc1234", null, [])).toContain("First development build.");
		expect(devReleaseNotes("main", "abc1234", "v0.2.0-dev.1", [])).toContain("No new commit since v0.2.0-dev.1.");
	});
});

describe("releaseAssets", () => {
	it("lists the installers and the update files", () => {
		expect(releaseAssets("elytools", parseReleaseVersion("1.2.0"))).toEqual([
			"elytools-1.2.0-setup.exe",
			"elytools-1.2.0-setup.exe.blockmap",
			"latest.yml",
			"elytools-1.2.0.AppImage",
			"elytools_1.2.0_amd64.deb",
			"latest-linux.yml",
		]);
		// The GitHub publisher writes latest*.yml for the development builds too
		expect(releaseAssets("elytools", nextDevVersion("1.2.0", []))).toContain("elytools_1.2.0-dev.1_amd64.deb");
	});
});
