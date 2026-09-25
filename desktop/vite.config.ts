import path from "node:path";
import { convertPathToAlias, defaultFmtConfig, defaultLintConfig } from "@elyspio/vite-eslint-config";
import { defineConfig } from "vite-plus";
import tsconfigNode from "./tsconfig.node.json";

// Build and dev still go through electron-vite (config/electron.vite.config.ts).
// This file only configures the vite-plus toolchain: fmt, lint and test.
const ignorePatterns = ["out/**", "resources/**", "build/**", "**/generated.ts"];

export default defineConfig({
	fmt: {
		...defaultFmtConfig,
		ignorePatterns: [...defaultFmtConfig.ignorePatterns, ...ignorePatterns],
	},
	lint: {
		...defaultLintConfig,
		// core/apis holds the NSwag client of the removed web API: nothing imports it and axios is not a dependency anymore.
		ignorePatterns: [...defaultLintConfig.ignorePatterns, ...ignorePatterns, "src/renderer/src/core/apis/**"],
	},
	resolve: {
		alias: convertPathToAlias(tsconfigNode.compilerOptions.paths, path.resolve(import.meta.dirname)),
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		passWithNoTests: true,
	},
});
