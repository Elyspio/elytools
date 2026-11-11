import { describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ write: vi.fn(), create: vi.fn() }));
vi.mock("@main/di/container.di", () => ({ mainContainer: { get: () => ({ allowDebug: true, appFolder: "." }) } }));
vi.mock("./context/main.context.module", () => ({ MainContextModule: class {} }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("winston", async (original) => {
	const actual = await original<typeof import("winston")>();
	return { ...actual, createLogger: mocks.create.mockReturnValue({ log: mocks.write }), transports: { Console: class {}, File: class {} } };
});
import { LogModule } from "./log.module";
describe("LogModule", () => {
	it("shares a backend and sanitizes metadata before console and file formatting", () => {
		const first = LogModule.create("First");
		const second = LogModule.create("Second");
		const error = new Error("failed");
		expect(() =>
			first.structured("error", "Exit run", {
				error,
				params: {
					get broken() {
						throw error;
					},
				},
			})
		).not.toThrow();
		second.info("hello", { n: 2n });
		expect(mocks.create).toHaveBeenCalledTimes(1);
		expect(mocks.write.mock.calls[0][0]).toMatchObject({ context: "First", error: { message: "failed" }, params: expect.any(String) });
		expect(mocks.write.mock.calls[1][0]).toMatchObject({ context: "Second", args: [{ n: "2" }] });
		expect(() => JSON.stringify(mocks.write.mock.calls)).not.toThrow();
	});
});
