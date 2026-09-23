import { rmSync } from "node:fs";
import { desktopDir, electronBuilderCli, electronViteCli, outDir, run } from "../shared/release-utils";

async function main() {
	rmSync(outDir, { force: true, recursive: true });

	await run(process.execPath, [electronViteCli, "-c", "config/electron.vite.config.ts", "build"], {
		cwd: desktopDir,
		env: {
			...process.env,
			ELYTOOLS_DISABLE_MAIN_BYTECODE: "1",
		},
	});

	await run(process.execPath, [electronBuilderCli, "--config", "config/electron-builder.yml", "--linux", "AppImage", "deb", "--publish", "never"], {
		cwd: desktopDir,
	});
}

void main();
