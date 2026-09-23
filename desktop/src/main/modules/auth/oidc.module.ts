import { shell } from "electron";
import { inject, injectable } from "inversify";
import crypto from "node:crypto";
import { ConfigModule } from "@main/modules/config/config.module";
import { SecureStorageModule } from "@main/modules/security/secure-storage.module";
import { mainConfig } from "@shared/config/main.config";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import { LogModule } from "@main/modules/log.module";

type OidcDiscovery = {
	authorization_endpoint: string;
	token_endpoint: string;
};

type OidcPendingAuth = {
	state: string;
	codeVerifier: string;
	resolve: () => void;
	reject: (err: Error) => void;
	discovery: OidcDiscovery;
	timeoutHandle: ReturnType<typeof setTimeout>;
};

type OidcTokenResponse = {
	access_token: string;
	expires_in?: number;
	refresh_token?: string;
};

@injectable()
export class OidcModule extends LogModule {
	private pendingAuth?: OidcPendingAuth;
	private accessToken?: string;
	private accessTokenExpiresAt = 0;
	private discoveryCache?: OidcDiscovery;

	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(SecureStorageModule) private readonly secureStorageModule: SecureStorageModule
	) {
		super("OidcModule");
	}

	public async startLogin(): Promise<void> {
		if (this.pendingAuth) {
			throw new Error("OIDC login is already in progress");
		}

		const { auth, redirectUri } = await this.getOidcConfig();

		if (!auth.issuerUrl || !auth.clientId) {
			throw new Error("OIDC issuer URL and client ID must be configured");
		}

		const discovery = await this.getDiscovery();
		const state = this.randomBase64Url(32);
		const codeVerifier = this.randomBase64Url(64);
		const codeChallenge = this.sha256Base64Url(codeVerifier);

		const authUrl = new URL(discovery.authorization_endpoint);
		authUrl.searchParams.set("client_id", auth.clientId);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", auth.scopes || "openid profile offline_access");
		authUrl.searchParams.set("state", state);
		authUrl.searchParams.set("code_challenge", codeChallenge);
		authUrl.searchParams.set("code_challenge_method", "S256");

		await shell.openExternal(authUrl.toString());

		return await new Promise<void>((resolve, reject) => {
			const timeoutHandle = setTimeout(
				() => {
					if (!this.pendingAuth) return;
					this.pendingAuth = undefined;
					reject(new Error("OIDC login timed out (5 minutes)"));
				},
				5 * 60 * 1000
			);

			this.pendingAuth = {
				state,
				codeVerifier,
				resolve,
				reject,
				discovery,
				timeoutHandle,
			};
		});
	}

	public async tryHandleRedirect(url: string): Promise<boolean> {
		if (!url.startsWith(`${mainConfig.names.protocol}://`)) {
			return false;
		}

		const pending = this.pendingAuth;
		if (!pending) {
			return false;
		}

		const parsed = new URL(url);
		const { redirectUri } = await this.getOidcConfig();
		const configured = new URL(redirectUri);
		if (parsed.host !== configured.host || parsed.pathname !== configured.pathname) {
			return false;
		}

		try {
			const error = parsed.searchParams.get("error");
			if (error) {
				const description = parsed.searchParams.get("error_description") ?? error;
				throw new Error(`OIDC provider error: ${description}`);
			}

			const state = parsed.searchParams.get("state");
			if (!state || state !== pending.state) {
				throw new Error("OIDC state mismatch");
			}

			const code = parsed.searchParams.get("code");
			if (!code) {
				throw new Error("OIDC code was not provided");
			}

			await this.exchangeCodeForTokens(code, pending.codeVerifier, pending.discovery);
			clearTimeout(pending.timeoutHandle);
			this.pendingAuth = undefined;
			pending.resolve();
		} catch (error) {
			clearTimeout(pending.timeoutHandle);
			this.pendingAuth = undefined;
			pending.reject(error as Error);
		}

		return true;
	}

	public cancelLogin(): void {
		if (!this.pendingAuth) return;
		const pending = this.pendingAuth;
		clearTimeout(pending.timeoutHandle);
		this.pendingAuth = undefined;
		pending.reject(new Error("OIDC login was cancelled by the user"));
	}

	public async logout(): Promise<void> {
		this.accessToken = undefined;
		this.accessTokenExpiresAt = 0;
		await this.secureStorageModule.deleteSecret("oidc-refresh-token");
	}

	public async getStatus(): Promise<OidcAuthStatus> {
		const { auth } = await this.getOidcConfig();
		const hasRefreshToken = !!(await this.secureStorageModule.getSecret("oidc-refresh-token"));
		const authenticated = this.isAccessTokenValid() || hasRefreshToken;

		return {
			configured: !!auth.issuerUrl && !!auth.clientId,
			authenticated,
			hasRefreshToken,
		};
	}

	public async getAccessToken(): Promise<string> {
		if (this.isAccessTokenValid()) {
			return this.accessToken!;
		}

		const refreshToken = await this.secureStorageModule.getSecret("oidc-refresh-token");
		if (!refreshToken) {
			throw new Error("Not authenticated. Please sign in first.");
		}

		const { auth } = await this.getOidcConfig();
		const discovery = await this.getDiscovery();
		const payload = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: auth.clientId,
			...(auth.clientSecret ? { client_secret: auth.clientSecret } : {}),
			refresh_token: refreshToken,
		});

		const res = await fetch(discovery.token_endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: payload,
		});

		if (!res.ok) {
			throw new Error(`Failed to refresh OIDC access token (${res.status})`);
		}

		const tokens = (await res.json()) as OidcTokenResponse;
		await this.applyTokenResponse(tokens);
		return this.accessToken!;
	}

	private async exchangeCodeForTokens(code: string, codeVerifier: string, discovery: OidcDiscovery): Promise<void> {
		const { auth, redirectUri } = await this.getOidcConfig();
		const payload = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			client_id: auth.clientId,
			...(auth.clientSecret ? { client_secret: auth.clientSecret } : {}),
			redirect_uri: redirectUri,
			code_verifier: codeVerifier,
		});

		const res = await fetch(discovery.token_endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: payload,
		});

		if (!res.ok) {
			this.logger.error("Failed to exchange OIDC code", {
				status: res.status,
				headers: res.headers,
				body: await res.text(),
			});
			throw new Error(`Failed to exchange OIDC code (${res.status})`);
		}

		const tokens = (await res.json()) as OidcTokenResponse;
		await this.applyTokenResponse(tokens);
	}

	private async applyTokenResponse(tokens: OidcTokenResponse): Promise<void> {
		if (!tokens.access_token) {
			throw new Error("OIDC response did not contain access_token");
		}

		this.accessToken = tokens.access_token;
		this.accessTokenExpiresAt = Date.now() + Math.max((tokens.expires_in ?? 300) - 30, 30) * 1000;

		if (tokens.refresh_token) {
			await this.secureStorageModule.setSecret("oidc-refresh-token", tokens.refresh_token);
		}
	}

	private async getDiscovery(): Promise<OidcDiscovery> {
		if (this.discoveryCache) {
			return this.discoveryCache;
		}

		const { auth } = await this.getOidcConfig();
		const issuer = auth.issuerUrl.replace(/\/$/, "");
		const res = await fetch(`${issuer}/.well-known/openid-configuration`);
		if (res.status !== 200) {
			throw new Error(`Failed to fetch OIDC discovery document (${res.status})`);
		}

		const discovery = (await res.json()) as OidcDiscovery;
		if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
			throw new Error("OIDC discovery document is missing required endpoints");
		}

		this.discoveryCache = discovery;
		return discovery;
	}

	private async getOidcConfig() {
		const config = await this.configModule.getConfig();
		const auth = config.endpoints.oidc;
		const redirectPath = auth.redirectPath.replace(/^\//, "");
		return {
			auth,
			redirectUri: `${mainConfig.names.protocol}://${redirectPath}`,
		};
	}

	private isAccessTokenValid() {
		return !!this.accessToken && this.accessTokenExpiresAt > Date.now();
	}

	private randomBase64Url(size: number): string {
		return crypto.randomBytes(size).toString("base64url");
	}

	private sha256Base64Url(value: string): string {
		return crypto.createHash("sha256").update(value).digest("base64url");
	}
}
