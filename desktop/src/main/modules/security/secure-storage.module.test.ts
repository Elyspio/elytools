import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MainContextModule } from "@main/modules/context/main.context.module";
import { SecureStorageModule } from "./secure-storage.module";

const safeStorage = vi.hoisted(() => ({
	isAsyncEncryptionAvailable: vi.fn<() => Promise<boolean>>(),
	encryptStringAsync: vi.fn<(plainText: string) => Promise<Buffer>>(),
	decryptStringAsync: vi.fn<(encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>>(),
}));

vi.mock("electron", () => ({ safeStorage }));
vi.mock("@main/modules/context/main.context.module", () => ({ MainContextModule: class {} }));

/** Reversible fake encryption, prefixed by the key generation in use */
function useKey(generation: string) {
	safeStorage.encryptStringAsync.mockImplementation(async (plainText) => Buffer.from(`${generation}:${plainText}`));
	safeStorage.decryptStringAsync.mockImplementation(async (encrypted) => {
		const [usedGeneration, ...rest] = encrypted.toString().split(":");
		return { result: rest.join(":"), shouldReEncrypt: usedGeneration !== generation };
	});
}

describe("SecureStorageModule", () => {
	let appFolder: string;
	let module: SecureStorageModule;

	const readStored = (key: string) => {
		const secrets = JSON.parse(fs.readFileSync(path.join(appFolder, "config", "secrets.json"), "utf-8")) as Record<string, string>;
		return Buffer.from(secrets[key]!, "base64").toString();
	};

	beforeEach(() => {
		appFolder = fs.mkdtempSync(path.join(os.tmpdir(), "elytools-secrets-"));
		module = new SecureStorageModule({ appFolder } as MainContextModule);
		safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
		useKey("k1");
	});

	afterEach(() => {
		fs.rmSync(appFolder, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("stores a secret encrypted and reads it back", async () => {
		await module.setSecret("oidc-refresh-token", "token");

		expect(readStored("oidc-refresh-token")).toBe("k1:token");
		await expect(module.getSecret("oidc-refresh-token")).resolves.toBe("token");
	});

	it("returns undefined for a missing or deleted secret", async () => {
		await expect(module.getSecret("oidc-refresh-token")).resolves.toBeUndefined();

		await module.setSecret("oidc-refresh-token", "token");
		await module.deleteSecret("oidc-refresh-token");

		await expect(module.getSecret("oidc-refresh-token")).resolves.toBeUndefined();
	});

	it("keeps every secret when writes are concurrent", async () => {
		await Promise.all([module.setMachinePassword("a", "pa"), module.setMachinePassword("b", "pb"), module.setMachinePrivateKey("a", "ka")]);

		await expect(module.getMachinePassword("a")).resolves.toBe("pa");
		await expect(module.getMachinePassword("b")).resolves.toBe("pb");
		await expect(module.getMachinePrivateKey("a")).resolves.toBe("ka");
	});

	it("applies a deletion requested after a write still being encrypted", async () => {
		const write = module.setSecret("oidc-refresh-token", "token");
		const deletion = module.deleteSecret("oidc-refresh-token");
		await Promise.all([write, deletion]);

		await expect(module.getSecret("oidc-refresh-token")).resolves.toBeUndefined();
	});

	it("keeps the last value of writes whose encryptions finish out of order", async () => {
		safeStorage.encryptStringAsync.mockImplementation(async (plainText) => {
			await new Promise((resolve) => setTimeout(resolve, plainText === "first" ? 20 : 0));
			return Buffer.from(`k1:${plainText}`);
		});

		await Promise.all([module.setSecret("oidc-refresh-token", "first"), module.setSecret("oidc-refresh-token", "second")]);

		await expect(module.getSecret("oidc-refresh-token")).resolves.toBe("second");
	});

	it("rejects when encryption is not available", async () => {
		safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);

		await expect(module.setSecret("oidc-refresh-token", "token")).rejects.toThrow("not available");
		await expect(module.getSecret("oidc-refresh-token")).rejects.toThrow("not available");
	});

	it("stores the secret again when its encryption key was rotated", async () => {
		await module.setSecret("oidc-refresh-token", "token");
		useKey("k2");

		await expect(module.getSecret("oidc-refresh-token")).resolves.toBe("token");
		expect(readStored("oidc-refresh-token")).toBe("k2:token");
	});

	it("still returns the secret when storing it again fails", async () => {
		await module.setSecret("oidc-refresh-token", "token");
		useKey("k2");
		safeStorage.encryptStringAsync.mockRejectedValue(new Error("keychain locked"));

		await expect(module.getSecret("oidc-refresh-token")).resolves.toBe("token");
		expect(readStored("oidc-refresh-token")).toBe("k1:token");
	});
});
