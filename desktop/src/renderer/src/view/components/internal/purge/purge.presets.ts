export type PurgePresetId = "node" | "dotnet" | "web" | "python" | "java" | "rust" | "misc";

export type PurgePreset = {
	id: PurgePresetId;
	title: string;
	description: string;
	targets: string[];
};

export const PURGE_PRESETS: PurgePreset[] = [
	{
		id: "node",
		title: "Node.js",
		description: "node_modules, dist, build, .next, .nuxt, .cache, .parcel-cache, .turbo",
		targets: ["node_modules", "dist", "build", "out", ".next", ".nuxt", ".cache", ".parcel-cache", ".turbo"],
	},
	{
		id: "dotnet",
		title: ".NET",
		description: "bin, obj",
		targets: ["bin", "obj"],
	},
	{
		id: "web",
		title: "Web Bundlers",
		description: "coverage, .nyc_output, .vite, .svelte-kit, .angular",
		targets: ["coverage", ".nyc_output", ".vite", ".svelte-kit", ".angular"],
	},
	{
		id: "python",
		title: "Python",
		description: "__pycache__, .pytest_cache, .mypy_cache, .ruff_cache",
		targets: ["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"],
	},
	{
		id: "java",
		title: "Java/Gradle",
		description: "target, .gradle",
		targets: ["target", ".gradle"],
	},
	{
		id: "rust",
		title: "Rust",
		description: "target",
		targets: ["target"],
	},
	{
		id: "misc",
		title: "Misc",
		description: "tmp, .tmp",
		targets: ["tmp", ".tmp"],
	},
];

export const DEFAULT_PRESET_IDS = PURGE_PRESETS.map((preset) => preset.id);

export const IGNORE_DIR_NAMES = [".git", ".hg", ".svn", ".idea", ".vscode", ".vs"];
