import { mkdirSync } from "node:fs";
import path from "node:path";
import { desktopDir, distDir, getContainerMountPath, getContainerRuntime, run } from "../shared/release-utils";

async function main() {
	const containerRuntime = getContainerRuntime();
	const imageTag = "elytools-linux-release-builder:local";
	const dockerfilePath = path.join("deploy", "release", "linux.Dockerfile");
	const distMountPath = `${getContainerMountPath(distDir)}:/project/desktop/dist`;
	const cacheVolume = "elytools-linux-builder-cache:/root/.cache";
	//
	// if (!githubToken) {
	// 	throw new Error("GITHUB_TOKEN must be defined on the host before building the Linux release image.");
	// }

	mkdirSync(distDir, { recursive: true });

	await run(containerRuntime, ["build", "-f", dockerfilePath, "-t", imageTag, "."], {
		cwd: desktopDir,
	});

	await run(containerRuntime, ["run", "--rm", "--volume", distMountPath, "--volume", cacheVolume, imageTag], {
		cwd: desktopDir,
	});
}

void main();
