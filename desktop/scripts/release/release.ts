/**
 * Publishes GitHub releases, read by the auto update of the application (src/main/modules/update).
 *
 * `pnpm release`: publishes the stable version of package.json. Run it on Windows, from an up to date `main`,
 * with Docker or Podman and an authenticated `gh`: checks the code, builds the Windows installer locally and the
 * Linux packages in a container, pushes the tag then publishes the release (notes generated from the merged PRs).
 *
 * `pnpm release:dev` (`release.ts dev`): publishes a development build `X.Y.Z-dev.N` from any branch, as a published
 * prerelease followed by the "Dev" update channel. The version is injected at build time (package.json is unchanged)
 * and the notes list the commits since the previous development build. Every development build is kept.
 *
 * `pnpm package` (`release.ts package`) builds both platforms in parallel, like a release, without publishing.
 *
 * `pnpm package:linux` (`release.ts package-linux`) only builds the Linux packages: electron-builder cannot build
 * the AppImage from Windows, so it runs in the container there, natively on Linux.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import semver from "semver";

export type ReleaseVersion = {
	version: string;
	tag: string;
	/** Development builds are published as GitHub prereleases */
	prerelease: boolean;
};

export type RepositoryState = {
	branch: string;
	dirty: boolean;
	/** HEAD is the commit of origin/main */
	upToDate: boolean;
	tags: string[];
};

export type DevRepositoryState = {
	/** "HEAD" when detached */
	branch: string;
	dirty: boolean;
	/** Remote branch tracked by the current branch, null without one */
	upstream: string | null;
	/** HEAD is the commit of the upstream branch */
	pushed: boolean;
};

const devTagPattern = /^v(\d+\.\d+\.\d+)-dev\.(\d+)$/;

/**
 * Validates the version of package.json: a stable version (1.2.0); development builds use `pnpm release:dev`
 */
export function parseReleaseVersion(version: string): ReleaseVersion {
	const parsed = semver.parse(version);
	if (!parsed || parsed.build.length > 0 || parsed.prerelease.length > 0) {
		throw new Error(`Invalid version "${version}": expected x.y.z (development builds: pnpm release:dev)`);
	}

	return { version: parsed.version, tag: `v${parsed.version}`, prerelease: false };
}

/**
 * Stable versions of the tags, newest first: the development builds and the other prereleases are ignored
 */
export function releasedVersions(tags: string[]): string[] {
	return tags
		.map((tag) => semver.valid(semver.clean(tag)))
		.filter((version): version is string => version !== null && semver.prerelease(version) === null)
		.sort(semver.rcompare);
}

/**
 * Reasons the release cannot be made from the current repository, empty when it can
 */
export function releaseProblems(release: ReleaseVersion, repository: RepositoryState): string[] {
	const problems: string[] = [];
	if (repository.branch !== "main") problems.push(`Releases are made from main (current branch: ${repository.branch}): use pnpm release:dev for a development build`);
	if (repository.dirty) problems.push("The working tree has uncommitted changes");
	if (!repository.upToDate) problems.push("HEAD is not origin/main: pull or push first");
	if (repository.tags.includes(release.tag)) problems.push(`Tag ${release.tag} already exists: bump the version in package.json`);

	// Only the stable releases count: a development build of the version does not block its release
	const latest = releasedVersions(repository.tags)[0];
	if (latest && !semver.gt(release.version, latest)) problems.push(`Version ${release.version} must be greater than the latest tag v${latest}`);

	return problems;
}

/**
 * Reasons the development build cannot be made from the current repository, empty when it can
 */
export function devReleaseProblems(repository: DevRepositoryState): string[] {
	const problems: string[] = [];
	if (repository.branch === "HEAD") problems.push("HEAD is detached: check out a branch");
	if (repository.dirty) problems.push("The working tree has uncommitted changes");
	if (!repository.upstream) problems.push(`Branch ${repository.branch} has no remote branch: push it first (git push -u origin ${repository.branch})`);
	else if (!repository.pushed) problems.push(`HEAD is not ${repository.upstream}: push or pull first`);
	return problems;
}

/**
 * Version of the next development build: `X.Y.Z-dev.N`.
 *
 * X.Y.Z is the version of package.json (without prerelease) until it is released, then the patch after the latest release,
 * and never lower than the latest development build: a branch behind another one continues its numbering, so the versions
 * follow the publication order. N follows the development builds of X.Y.Z already tagged.
 */
export function nextDevVersion(packageVersion: string, tags: string[]): ReleaseVersion {
	const parsed = semver.parse(packageVersion);
	if (!parsed) throw new Error(`Invalid version "${packageVersion}" in package.json`);

	const latestRelease = releasedVersions(tags)[0];
	let base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
	if (latestRelease && !semver.gt(base, latestRelease)) base = semver.inc(latestRelease, "patch")!;

	const latestDevBase = devTags(tags).map((tag) => devTagPattern.exec(tag)![1])[0];
	if (latestDevBase && semver.gt(latestDevBase, base)) base = latestDevBase;

	const builds = tags.map((tag) => devTagPattern.exec(tag)).filter((match) => match?.[1] === base);
	const number = Math.max(0, ...builds.map((match) => Number(match![2]))) + 1;

	const version = `${base}-dev.${number}`;
	return { version, tag: `v${version}`, prerelease: true };
}

/**
 * Development build tags, newest first
 */
export function devTags(tags: string[]): string[] {
	return tags.filter((tag) => devTagPattern.test(tag)).sort((a, b) => semver.rcompare(a.slice(1), b.slice(1)));
}

/**
 * Notes of a development build: where it comes from, then the commits since the previous development build
 */
export function devReleaseNotes(branch: string, commit: string, previousTag: string | null, commits: string[]): string {
	const lines = [`Development build from \`${branch}\` @ ${commit}.`, ""];
	if (commits.length === 0) {
		lines.push(previousTag ? `No new commit since ${previousTag}.` : "First development build.");
	} else {
		lines.push(previousTag ? `Commits since ${previousTag}:` : "Commits:", "", ...commits.map((line) => `- ${line}`));
	}
	return `${lines.join("\n")}\n`;
}

/**
 * Files uploaded to the release: installers, their blockmap and the update files of electron-updater.
 *
 * The GitHub publisher ignores the version channel: development builds also ship latest*.yml,
 * the only update file read by the release provider (src/main/modules/update/release.provider.ts).
 */
export function releaseAssets(name: string, release: ReleaseVersion): string[] {
	const { version } = release;
	return [
		`${name}-${version}-setup.exe`,
		`${name}-${version}-setup.exe.blockmap`,
		"latest.yml",
		`${name}-${version}.AppImage`,
		`${name}_${version}_amd64.deb`,
		"latest-linux.yml",
	];
}

/** The desktop project, where pnpm and electron-builder run: also the build context of the Linux container */
const rootDir = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(rootDir, "dist");
const linuxImage = "elytools-release-linux";
/** `pnpm build` empties dist/ (prebuild) while the other platform writes into it: electron-vite runs directly */
const viteBuild = ["exec", "electron-vite", "-c", "config/electron.vite.config.ts", "build"];

/** pnpm is a .cmd shim on Windows; git, gh, docker and podman are executables, run without a shell (arguments kept intact) */
function needsShell(command: string) {
	return process.platform === "win32" && command === "pnpm";
}

/**
 * Runs a command; with a label (builds running in parallel), each output line is prefixed with it
 */
function run(command: string, args: string[], label?: string) {
	const prefix = label ? `[${label}] ` : "";
	console.log(`\n${prefix}> ${command} ${args.join(" ")}`);
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: label ? ["ignore", "pipe", "pipe"] : "inherit", shell: needsShell(command) });
		if (label) {
			createInterface({ input: child.stdout! }).on("line", (line) => console.log(prefix + line));
			createInterface({ input: child.stderr! }).on("line", (line) => console.error(prefix + line));
		}
		child.on("error", reject);
		child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${prefix}${command} ${args[0] ?? ""} failed with exit code ${code}`))));
	});
}

function output(command: string, args: string[]) {
	return execFileSync(command, args, { cwd: rootDir, encoding: "utf-8" }).trim();
}

function succeeds(command: string, args: string[]) {
	try {
		execFileSync(command, args, { cwd: rootDir, stdio: "ignore", shell: needsShell(command) });
		return true;
	} catch {
		return false;
	}
}

function readRepository(): RepositoryState {
	output("git", ["fetch", "--tags", "origin", "main"]);
	return {
		branch: output("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
		dirty: output("git", ["status", "--porcelain"]) !== "",
		upToDate: output("git", ["rev-parse", "HEAD"]) === output("git", ["rev-parse", "origin/main"]),
		tags: output("git", ["tag", "--list", "v*"]).split("\n").filter(Boolean),
	};
}

function readDevRepository(): DevRepositoryState {
	output("git", ["fetch", "--tags", "origin"]);
	const upstream = succeeds("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
		? output("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
		: null;
	return {
		branch: output("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
		dirty: output("git", ["status", "--porcelain"]) !== "",
		upstream,
		pushed: upstream !== null && output("git", ["rev-parse", "HEAD"]) === output("git", ["rev-parse", "@{u}"]),
	};
}

/**
 * Tags on GitHub: local tags may be stale
 */
function remoteTags() {
	return output("git", ["ls-remote", "--tags", "--refs", "origin", "v*"])
		.split("\n")
		.map((line) => line.split("refs/tags/")[1])
		.filter((tag): tag is string => Boolean(tag));
}

function containerRuntime() {
	const runtime = ["docker", "podman"].find((command) => succeeds(command, ["info"]));
	if (!runtime) throw new Error("Docker or Podman must be running to build the Linux packages");
	return runtime;
}

/** electron-builder arguments setting the version of the packages without changing package.json */
function versionArgs(version?: string) {
	return version ? [`-c.extraMetadata.version=${version}`] : [];
}

/**
 * Builds the AppImage and the deb into dist/: natively on Linux, in deploy/release/linux.Dockerfile elsewhere
 */
async function packageLinux(runtime = process.platform === "linux" ? null : containerRuntime(), version?: string, label?: string) {
	mkdirSync(distDir, { recursive: true });

	if (!runtime) {
		await run("pnpm", viteBuild, label);
		await run(
			"pnpm",
			["exec", "electron-builder", "--config", "config/electron-builder.yml", "--linux", "AppImage", "deb", "--publish", "never", ...versionArgs(version)],
			label
		);
		return;
	}

	await run(runtime, ["build", "-f", path.join(rootDir, "deploy/release/linux.Dockerfile"), "-t", linuxImage, rootDir], label);
	await run(
		runtime,
		[
			"run",
			"--rm",
			"--volume",
			`${distDir.replaceAll("\\", "/")}:/project/desktop/dist`,
			"--volume",
			`${linuxImage}-cache:/root/.cache`,
			...(version ? ["--env", `RELEASE_VERSION=${version}`] : []),
			linuxImage,
		],
		label
	);
}

async function checkCode() {
	await run("pnpm", ["exec", "vp", "check"]);
	await run("pnpm", ["test"]);
}

/**
 * Builds both platforms into a clean dist/ and returns the release assets
 */
async function buildAssets(name: string, release: ReleaseVersion, runtime: string, version?: string) {
	rmSync(path.join(rootDir, "out"), { recursive: true, force: true });
	rmSync(distDir, { recursive: true, force: true });
	mkdirSync(distDir);

	// In parallel: the container builds its own out/ (out/ and dist/ are not in its build context, .dockerignore),
	// and both platforms write distinct files into dist/ (linux-unpacked, win-unpacked, latest-linux.yml, latest.yml)
	const builds = await Promise.allSettled([
		packageLinux(runtime, version, "linux"),
		(async () => {
			await run("pnpm", viteBuild, "windows");
			await run("pnpm", ["exec", "electron-builder", "--config", "config/electron-builder.yml", "--win", "nsis", "--publish", "never", ...versionArgs(version)], "windows");
		})(),
	]);
	const failures = builds.filter((build): build is PromiseRejectedResult => build.status === "rejected").map((build) => (build.reason as Error).message);
	if (failures.length > 0) throw new Error(`Build failed:\n- ${failures.join("\n- ")}`);

	const assets = releaseAssets(name, release).map((file) => path.join(distDir, file));
	const missing = assets.filter((file) => !existsSync(file));
	if (missing.length > 0) throw new Error(`Missing release artifacts:\n- ${missing.join("\n- ")}`);
	return assets;
}

function readPackageJson() {
	return JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf-8")) as { name: string; version: string };
}

function checkTools() {
	if (!succeeds("gh", ["auth", "status"])) throw new Error("gh must be authenticated: gh auth login");
	return containerRuntime();
}

async function main() {
	const packageJson = readPackageJson();
	const release = parseReleaseVersion(packageJson.version);
	console.log(`Release ${release.tag}`);

	if (process.platform !== "win32") throw new Error("Releases are built from Windows: the NSIS installer is built locally");
	const repository = readRepository();
	const problems = releaseProblems(release, repository);
	if (problems.length > 0) throw new Error(`Cannot release:\n- ${problems.join("\n- ")}`);
	const runtime = checkTools();

	await checkCode();
	const assets = await buildAssets(packageJson.name, release, runtime);

	await run("git", ["tag", "--annotate", release.tag, "--message", release.tag]);
	await run("git", ["push", "origin", release.tag]);

	// Notes from the previous stable release: the development builds in between are not releases
	const previous = releasedVersions(repository.tags)[0];
	const notesStart = previous ? ["--notes-start-tag", `v${previous}`] : [];
	await run("gh", ["release", "create", release.tag, "--verify-tag", "--title", release.tag, "--generate-notes", ...notesStart, ...assets]);

	console.log(`\nRelease published: ${output("gh", ["release", "view", release.tag, "--json", "url", "--jq", ".url"])}`);
}

/**
 * Builds the packages of both platforms in parallel, like a release, without publishing anything
 */
async function packageAll() {
	if (process.platform !== "win32") throw new Error("Both platforms are built from Windows: the NSIS installer is built locally");
	const packageJson = readPackageJson();
	const assets = await buildAssets(packageJson.name, parseReleaseVersion(packageJson.version), containerRuntime());
	console.log(`\nPackages built:\n- ${assets.join("\n- ")}`);
}

async function mainDev() {
	const packageJson = readPackageJson();
	if (process.platform !== "win32") throw new Error("Releases are built from Windows: the NSIS installer is built locally");

	const repository = readDevRepository();
	const problems = devReleaseProblems(repository);
	if (problems.length > 0) throw new Error(`Cannot release a development build:\n- ${problems.join("\n- ")}`);
	const runtime = checkTools();

	const tags = remoteTags();
	const release = nextDevVersion(packageJson.version, tags);
	const previousTag = devTags(tags)[0] ?? null;
	console.log(`Development build ${release.tag} from ${repository.branch}`);

	await checkCode();
	const assets = await buildAssets(packageJson.name, release, runtime, release.version);

	const commit = output("git", ["rev-parse", "--short", "HEAD"]);
	const range = previousTag && succeeds("git", ["rev-parse", "--verify", "--quiet", `${previousTag}^{commit}`]) ? `${previousTag}..HEAD` : "HEAD";
	const commits = output("git", ["log", "--format=%h %s", "--max-count=50", range]).split("\n").filter(Boolean);
	const notesFile = path.join(distDir, "release-notes.md");
	writeFileSync(notesFile, devReleaseNotes(repository.branch, commit, previousTag, commits));

	await run("git", ["tag", "--annotate", release.tag, "--message", `${release.tag} (${repository.branch})`]);
	await run("git", ["push", "origin", release.tag]);
	await run("gh", ["release", "create", release.tag, "--prerelease", "--latest=false", "--verify-tag", "--title", release.tag, "--notes-file", notesFile, ...assets]);

	console.log(`\nDevelopment build published: ${output("gh", ["release", "view", release.tag, "--json", "url", "--jq", ".url"])}`);
}

if (import.meta.main) {
	try {
		if (process.argv[2] === "package-linux") await packageLinux();
		else if (process.argv[2] === "package") await packageAll();
		else if (process.argv[2] === "dev") await mainDev();
		else await main();
	} catch (error) {
		console.error(`\n${(error as Error).message}`);
		process.exitCode = 1;
	}
}
