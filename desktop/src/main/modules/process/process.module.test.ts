import { describe, expect, it, vi } from "vite-plus/test";

// The real logger needs Electron (log folder): a silent one is enough here
vi.mock("../log.module", () => ({
	LogModule: class {
		public logger = { log() {}, info() {}, debug() {}, warn() {}, error() {}, verbose() {}, structured() {} };
	},
}));
import { ProcessModule, ProcessStuckError } from "./process.module";

const node = process.execPath;

describe("ProcessModule.run", () => {
	it("passes the arguments as they are, without a shell", async () => {
		const tricky = '$(echo injected) `echo injected` %PATH% "quoted" & echo injected';
		const result = await new ProcessModule().run(node, ["-e", "process.stdout.write(process.argv[1])", tricky]);

		expect(result).toMatchObject({ code: 0, stdout: tricky });
	});

	it("returns the exit code and the end of stderr", async () => {
		const result = await new ProcessModule().run(node, ["-e", "console.error('boom'); process.exit(3)"]);

		expect(result.code).toBe(3);
		expect(result.stderr).toContain("boom");
	});

	it("forwards stderr chunks", async () => {
		const chunks: string[] = [];
		await new ProcessModule().run(node, ["-e", "console.error('frame=  12')"], { onStderr: (chunk) => chunks.push(chunk) });

		expect(chunks.join("")).toContain("frame=  12");
	});

	it("rejects when the program cannot start", async () => {
		await expect(new ProcessModule().run("elytools-missing-program", [])).rejects.toThrow();
	});

	it("kills a process running past its timeout", async () => {
		const run = new ProcessModule().run(node, ["-e", "setTimeout(() => {}, 60000)"], { timeoutMs: 300 });

		await expect(run).rejects.toBeInstanceOf(ProcessStuckError);
	});

	it("kills a process that stops writing, not one that keeps reporting", async () => {
		const module = new ProcessModule();
		const silent = module.run(node, ["-e", "console.error('start'); setTimeout(() => {}, 60000)"], { stallMs: 400 });
		const chatty = module.run(node, ["-e", "let n = 0; const t = setInterval(() => { console.error(n); if (++n === 8) clearInterval(t); }, 150)"], { stallMs: 1000 });

		await expect(silent).rejects.toThrow("stopped responding");
		await expect(chatty).resolves.toMatchObject({ code: 0 });
	});

	it("kills the process when the signal aborts, and on killAll", async () => {
		const module = new ProcessModule();
		const controller = new AbortController();
		const aborted = module.run(node, ["-e", "setTimeout(() => {}, 60000)"], { signal: controller.signal });
		const killed = module.run(node, ["-e", "setTimeout(() => {}, 60000)"]);

		setTimeout(() => {
			controller.abort();
			module.killAll();
		}, 200);

		await expect(aborted).rejects.toThrow();
		await expect(killed).resolves.toMatchObject({ code: null });
	});
});
