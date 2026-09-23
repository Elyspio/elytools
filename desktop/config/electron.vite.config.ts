import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { convertPathToAlias } from "@elyspio/vite-eslint-config";
import tsconfigNode from "../tsconfig.node.json";
import tsconfigWeb from "../tsconfig.web.json";
import path from "node:path";
import svgr from "vite-plugin-svgr";

const basePath = path.join(__dirname, "..");
const disableMainBytecode = process.env["ELYTOOLS_DISABLE_MAIN_BYTECODE"] === "1";
const cpuFeaturesShim = path.join(__dirname, "shims", "cpu-features.js");

const nodeAlias = convertPathToAlias(tsconfigNode.compilerOptions.paths, basePath);
const rendererAlias = convertPathToAlias(tsconfigWeb.compilerOptions.paths, basePath);

export default defineConfig({
	main: {
		build: {
			externalizeDeps: false,
			bytecode: !disableMainBytecode,
		},
		resolve: {
			alias: {
				...nodeAlias,
				"cpu-features": cpuFeaturesShim,
				"cpu-features/lib/index": cpuFeaturesShim,
			},
		},
	},
	preload: {
		build: {
			bytecode: false,
		},
		resolve: {
			alias: nodeAlias,
		},
	},
	renderer: {
		resolve: {
			alias: rendererAlias,
		},
		plugins: [svgr(), react()],
	},
});
