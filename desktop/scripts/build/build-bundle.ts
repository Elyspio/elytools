import { desktopDir, electronViteCli, run } from "../shared/release-utils";

async function main() {
	await run(process.execPath, [electronViteCli, "-c", "config/electron.vite.config.ts", "build"], {
		cwd: desktopDir,
	});
}

void main();
