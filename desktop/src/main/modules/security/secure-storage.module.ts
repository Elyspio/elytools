import { injectable } from "inversify";
import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { MainContextModule } from "@main/modules/context/main.context.module";
import { inject } from "inversify";

type SecretKey =
	/** Single OIDC session of config V2 to V5, only deleted by the V6 migration */
	"oidc-refresh-token" | `oidc-profile:${string}:refresh-token` | `ssh-machine:${string}:password` | `ssh-machine:${string}:private-key`;

type SecretsFilePayload = Partial<Record<SecretKey, string>>;

@injectable()
export class SecureStorageModule {
	/** Writes of the secrets file, chained: each one reads, modifies and writes the whole file */
	private mutations: Promise<void> = Promise.resolve();

	public constructor(@inject(MainContextModule) private readonly mainContextModule: MainContextModule) {}

	public async setSecret(key: SecretKey, value: string): Promise<void> {
		this.ensureEncryptionAvailable();
		await this.mutate((secrets) => {
			secrets[key] = safeStorage.encryptString(value).toString("base64");
			return true;
		});
	}

	public async getSecret(key: SecretKey): Promise<string | undefined> {
		this.ensureEncryptionAvailable();
		const secrets = await this.readSecrets();
		const encrypted = secrets[key];
		if (!encrypted) return undefined;
		return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
	}

	public async deleteSecret(key: SecretKey): Promise<void> {
		await this.mutate((secrets) => {
			if (!secrets[key]) return false;
			delete secrets[key];
			return true;
		});
	}

	public async setMachinePassword(machineId: string, password: string): Promise<void> {
		await this.setSecret(this.getMachinePasswordKey(machineId), password);
	}

	public async getMachinePassword(machineId: string): Promise<string | undefined> {
		return await this.getSecret(this.getMachinePasswordKey(machineId));
	}

	public async deleteMachinePassword(machineId: string): Promise<void> {
		await this.deleteSecret(this.getMachinePasswordKey(machineId));
	}

	public async setMachinePrivateKey(machineId: string, privateKey: string): Promise<void> {
		await this.setSecret(this.getMachinePrivateKeyKey(machineId), privateKey);
	}

	public async getMachinePrivateKey(machineId: string): Promise<string | undefined> {
		return await this.getSecret(this.getMachinePrivateKeyKey(machineId));
	}

	public async deleteMachinePrivateKey(machineId: string): Promise<void> {
		await this.deleteSecret(this.getMachinePrivateKeyKey(machineId));
	}

	public async deleteMachineSecrets(machineId: string): Promise<void> {
		await Promise.all([this.deleteMachinePassword(machineId), this.deleteMachinePrivateKey(machineId)]);
	}

	private getMachinePasswordKey(machineId: string): `ssh-machine:${string}:password` {
		return `ssh-machine:${machineId}:password`;
	}

	private getMachinePrivateKeyKey(machineId: string): `ssh-machine:${string}:private-key` {
		return `ssh-machine:${machineId}:private-key`;
	}

	private ensureEncryptionAvailable() {
		if (!safeStorage.isEncryptionAvailable()) {
			throw new Error("Secure storage encryption is not available on this system");
		}
	}

	private get secretsFilePath() {
		return path.resolve(this.mainContextModule.appFolder, "config", "secrets.json");
	}

	/**
	 * Applies a change to the secrets file after the previous ones, so concurrent changes do not overwrite each other
	 * @param change returns false when the file is left unchanged
	 */
	private async mutate(change: (secrets: SecretsFilePayload) => boolean): Promise<void> {
		const mutation = this.mutations.then(async () => {
			const secrets = await this.readSecrets();
			if (change(secrets)) {
				await this.writeSecrets(secrets);
			}
		});
		// A failed change must not block the next ones
		this.mutations = mutation.catch(() => undefined);
		await mutation;
	}

	private async readSecrets(): Promise<SecretsFilePayload> {
		if (!fs.existsSync(this.secretsFilePath)) {
			return {};
		}

		try {
			const content = await fs.promises.readFile(this.secretsFilePath, "utf-8");
			return JSON.parse(content) as SecretsFilePayload;
		} catch {
			return {};
		}
	}

	private async writeSecrets(secrets: SecretsFilePayload): Promise<void> {
		await fs.promises.mkdir(path.dirname(this.secretsFilePath), { recursive: true });
		await fs.promises.writeFile(this.secretsFilePath, JSON.stringify(secrets, null, 2));
	}
}
