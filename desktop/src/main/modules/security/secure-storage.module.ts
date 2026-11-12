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
		// Encrypting inside the queued change keeps writes and deletions in the order they were requested
		await this.mutate(async (secrets) => {
			await this.ensureEncryptionAvailable();
			secrets[key] = await this.encrypt(value);
			return true;
		});
	}

	public async getSecret(key: SecretKey): Promise<string | undefined> {
		await this.ensureEncryptionAvailable();
		const secrets = await this.readSecrets();
		const encrypted = secrets[key];
		if (!encrypted) return undefined;
		const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(encrypted, "base64"));
		if (shouldReEncrypt) {
			await this.reEncrypt(key, encrypted, result);
		}
		return result;
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

	private async ensureEncryptionAvailable(): Promise<void> {
		if (!(await safeStorage.isAsyncEncryptionAvailable())) {
			throw new Error("Secure storage encryption is not available on this system");
		}
	}

	private async encrypt(value: string): Promise<string> {
		return (await safeStorage.encryptStringAsync(value)).toString("base64");
	}

	/**
	 * Stores a secret again after its encryption key was rotated; a failure only delays it to the next read
	 * @param previous encrypted value that was read: a secret changed in the meantime is left untouched
	 */
	private async reEncrypt(key: SecretKey, previous: string, value: string): Promise<void> {
		try {
			await this.mutate(async (secrets) => {
				if (secrets[key] !== previous) return false;
				secrets[key] = await this.encrypt(value);
				return true;
			});
		} catch {
			// The secret stays readable with its current encryption
		}
	}

	private get secretsFilePath() {
		return path.resolve(this.mainContextModule.appFolder, "config", "secrets.json");
	}

	/**
	 * Applies a change to the secrets file after the previous ones, so concurrent changes do not overwrite each other
	 * @param change returns false when the file is left unchanged
	 */
	private async mutate(change: (secrets: SecretsFilePayload) => boolean | Promise<boolean>): Promise<void> {
		const mutation = this.mutations.then(async () => {
			const secrets = await this.readSecrets();
			if (await change(secrets)) {
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
