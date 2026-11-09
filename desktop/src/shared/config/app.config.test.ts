import { describe, expect, it } from "vite-plus/test";
import { channelOfVersion, readUpdateSettings } from "./app.config";

describe("channelOfVersion", () => {
	it("follows the development builds from a development build", () => {
		expect(channelOfVersion("1.2.0")).toBe("stable");
		expect(channelOfVersion("1.2.0-dev.7")).toBe("dev");
		expect(channelOfVersion("1.2.0-beta.1")).toBe("stable");
	});
});

describe("readUpdateSettings", () => {
	it("uses the channel of the installed version without saved settings", () => {
		expect(readUpdateSettings(undefined, "1.2.0")).toEqual({ autoCheck: true, channel: "stable" });
		expect(readUpdateSettings(undefined, "1.2.0-dev.2")).toEqual({ autoCheck: true, channel: "dev" });
		expect(readUpdateSettings({ autoCheck: false }, "1.2.0-dev.2")).toEqual({ autoCheck: false, channel: "dev" });
	});

	it("keeps a saved channel", () => {
		expect(readUpdateSettings({ autoCheck: true, channel: "dev" }, "1.2.0")).toEqual({ autoCheck: true, channel: "dev" });
		expect(readUpdateSettings({ channel: "stable" }, "1.2.0-dev.2")).toEqual({ autoCheck: true, channel: "stable" });
	});
});
