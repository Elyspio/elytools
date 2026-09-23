import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { desktopDir, distDir, electronBuilderCli, run } from "../shared/release-utils";

async function main() {
	const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

	if (!githubToken) {
		throw new Error("GITHUB_TOKEN must be defined on the host before publishing.");
	}

	const packageJson = JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")) as {
		version: string;
	};
	const ignoredArtifacts = new Set(["builder-debug.yml", "builder-effective-config.yaml"]);
	const allowedExtensions = new Set([".yml", ".yaml", ".blockmap", ".exe", ".AppImage", ".deb", ".rpm", ".pacman"]);

	const files = readdirSync(distDir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((fileName) => !ignoredArtifacts.has(fileName))
		.filter((fileName) => allowedExtensions.has(path.extname(fileName)))
		.map((fileName) => path.join(distDir, fileName))
		.sort((left, right) => left.localeCompare(right));

	if (files.length === 0) {
		throw new Error("No release artifacts were found in dist/. Run the release build before publishing.");
	}

	const publishArgs = [electronBuilderCli, "publish", "--config", "config/electron-builder.yml", "--version", packageJson.version, "--policy", "always"];

	for (const file of files) {
		publishArgs.push("--files", file);
	}

	await run(process.execPath, publishArgs, {
		cwd: desktopDir,
		env: {
			...process.env,
			GH_TOKEN: githubToken,
			GITHUB_TOKEN: githubToken,
		},
	});
}

void main();
