import { shell } from "electron";
import { inject, injectable } from "inversify";
import crypto, { randomUUID } from "node:crypto";
import { ConfigModule } from "@main/modules/config/config.module";
import { SecureStorageModule } from "@main/modules/security/secure-storage.module";
import { mainConfig } from "@shared/config/main.config";
import type { OidcProfile } from "@shared/config/app.config";
import type { AuthModuleName, OidcAuthStatus, OidcProfileInput, OidcSessionTokens } from "@shared/types/auth.types";
import { LogModule } from "@main/modules/log.module";

type OidcDiscovery = {
	authorization_endpoint: string;
	token_endpoint: string;
};

type OidcPendingAuth = {
	profileId: string;
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

type OidcSession = {
	accessToken: string;
	expiresAt: number;
};

const DEFAULT_SCOPES = "openid profile offline_access";

/**
 * Sessions of the OIDC profiles (one per provider / realm), every profile sharing the elytools:// redirect.
 */
@injectable()
export class OidcModule extends LogModule {
	private pendingAuth?: OidcPendingAuth;
	private readonly sessions = new Map<string, OidcSession>();
	private readonly discoveryCache = new Map<string, OidcDiscovery>();

	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(SecureStorageModule) private readonly secureStorageModule: SecureStorageModule
	) {
		super("OidcModule");
	}

	public async saveProfile(input: OidcProfileInput): Promise<OidcProfile> {
		const config = await this.configModule.getConfig();
		const profileId = input.id ?? randomUUID();
		const current = config.auth.profiles.find((profile) => profile.id === profileId);

		const next: OidcProfile = {
			id: profileId,
			name: input.name.trim(),
			issuerUrl: input.issuerUrl.trim(),
			clientId: input.clientId.trim(),
			scopes: input.scopes.trim() || DEFAULT_SCOPES,
		};

		if (!next.name) {
			throw new Error("Profile name is required");
		}

		// A token of another provider, client or scope set must not survive the change.
		if (current && (current.issuerUrl !== next.issuerUrl || current.clientId !== next.clientId || current.scopes !== next.scopes)) {
			await this.logout(profileId);
		}

		await this.configModule.writeConfig({
			...config,
			auth: {
				...config.auth,
				profiles: current ? config.auth.profiles.map((profile) => (profile.id === profileId ? next : profile)) : [...config.auth.profiles, next],
			},
		});

		return next;
	}

	public async deleteProfile(profileId: string): Promise<void> {
		if (this.pendingAuth?.profileId === profileId) {
			this.cancelLogin();
		}

		await this.logout(profileId);

		// ConfigModule unbinds the modules that were using the profile.
		const config = await this.configModule.getConfig();
		await this.configModule.writeConfig({
			...config,
			auth: {
				...config.auth,
				profiles: config.auth.profiles.filter((profile) => profile.id !== profileId),
			},
		});
	}

	public async startLogin(profileId: string): Promise<void> {
		if (this.pendingAuth) {
			throw new Error("OIDC login is already in progress");
		}

		const profile = await this.getProfile(profileId);
		const redirectUri = await this.getRedirectUri();

		if (!profile.issuerUrl || !profile.clientId) {
			throw new Error(`OIDC issuer URL and client ID must be configured for profile ${profile.name}`);
		}

		const discovery = await this.getDiscovery(profile.issuerUrl);
		const state = this.randomBase64Url(32);
		const codeVerifier = this.randomBase64Url(64);
		const codeChallenge = this.sha256Base64Url(codeVerifier);

		const authUrl = new URL(discovery.authorization_endpoint);
		authUrl.searchParams.set("client_id", profile.clientId);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", profile.scopes || DEFAULT_SCOPES);
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
				profileId,
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
		const redirectUri = await this.getRedirectUri();
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

			// The state identifies the login in progress, hence its profile.
			const state = parsed.searchParams.get("state");
			if (!state || state !== pending.state) {
				throw new Error("OIDC state mismatch");
			}

			const code = parsed.searchParams.get("code");
			if (!code) {
				throw new Error("OIDC code was not provided");
			}

			const profile = await this.getProfile(pending.profileId);
			await this.exchangeCodeForTokens(profile, code, pending.codeVerifier, pending.discovery, redirectUri);
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

	public async logout(profileId: string): Promise<void> {
		this.sessions.delete(profileId);
		await this.secureStorageModule.deleteSecret(this.refreshTokenKey(profileId));
	}

	public async listStatus(): Promise<OidcAuthStatus[]> {
		const config = await this.configModule.getConfig();
		return await Promise.all(
			config.auth.profiles.map(async (profile) => {
				const hasRefreshToken = !!(await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id)));
				return {
					profileId: profile.id,
					configured: !!profile.issuerUrl && !!profile.clientId,
					authenticated: this.isSessionValid(profile.id) || hasRefreshToken,
					hasRefreshToken,
				};
			})
		);
	}

	/**
	 * Access token of the profile bound to a module
	 * @param profileId profile selected in the configuration of the module
	 * @param module module requesting the token, named in the errors
	 */
	public async getAccessToken(profileId: string | null, module: AuthModuleName): Promise<string> {
		const config = await this.configModule.getConfig();
		const profile = config.auth.profiles.find((p) => p.id === profileId);
		if (!profile) {
			throw new Error(`No authentication profile selected for module ${module}`);
		}

		const session = await this.getSession(profile, `module ${module}`);
		return session.accessToken;
	}

	/**
	 * Current tokens of a signed in profile, for inspection in Settings (refreshes the access token if expired)
	 */
	public async getSessionTokens(profileId: string): Promise<OidcSessionTokens> {
		const profile = await this.getProfile(profileId);
		const session = await this.getSession(profile, "Settings");
		const refreshToken = await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id));
		return {
			accessToken: session.accessToken,
			accessTokenExpiresAt: new Date(session.expiresAt).toISOString(),
			refreshToken: refreshToken ?? null,
		};
	}

	/**
	 * Valid session of the profile, refreshed with the stored refresh token when needed
	 * @param requester named in the errors
	 */
	private async getSession(profile: OidcProfile, requester: string): Promise<OidcSession> {
		const session = this.sessions.get(profile.id);
		if (session && this.isSessionValid(profile.id)) {
			return session;
		}

		const refreshToken = await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id));
		if (!refreshToken) {
			throw new Error(`Not authenticated on profile ${profile.name} (${requester}). Please sign in first.`);
		}

		const discovery = await this.getDiscovery(profile.issuerUrl);
		const payload = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: profile.clientId,
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
			throw new Error(`Failed to refresh OIDC access token of profile ${profile.name} (${res.status})`);
		}

		const tokens = (await res.json()) as OidcTokenResponse;
		return await this.applyTokenResponse(profile.id, tokens);
	}

	private async exchangeCodeForTokens(profile: OidcProfile, code: string, codeVerifier: string, discovery: OidcDiscovery, redirectUri: string): Promise<void> {
		const payload = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			client_id: profile.clientId,
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
				profile: profile.name,
				status: res.status,
				headers: res.headers,
				body: await res.text(),
			});
			throw new Error(`Failed to exchange OIDC code (${res.status})`);
		}

		const tokens = (await res.json()) as OidcTokenResponse;
		await this.applyTokenResponse(profile.id, tokens);
	}

	private async applyTokenResponse(profileId: string, tokens: OidcTokenResponse): Promise<OidcSession> {
		if (!tokens.access_token) {
			throw new Error("OIDC response did not contain access_token");
		}

		const session: OidcSession = {
			accessToken: tokens.access_token,
			expiresAt: Date.now() + Math.max((tokens.expires_in ?? 300) - 30, 30) * 1000,
		};
		this.sessions.set(profileId, session);

		if (tokens.refresh_token) {
			await this.secureStorageModule.setSecret(this.refreshTokenKey(profileId), tokens.refresh_token);
		}

		return session;
	}

	private async getDiscovery(issuerUrl: string): Promise<OidcDiscovery> {
		const issuer = issuerUrl.replace(/\/$/, "");
		const cached = this.discoveryCache.get(issuer);
		if (cached) {
			return cached;
		}

		const res = await fetch(`${issuer}/.well-known/openid-configuration`);
		if (res.status !== 200) {
			throw new Error(`Failed to fetch OIDC discovery document (${res.status})`);
		}

		const discovery = (await res.json()) as OidcDiscovery;
		if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
			throw new Error("OIDC discovery document is missing required endpoints");
		}

		this.discoveryCache.set(issuer, discovery);
		return discovery;
	}

	private async getProfile(profileId: string): Promise<OidcProfile> {
		const config = await this.configModule.getConfig();
		const profile = config.auth.profiles.find((p) => p.id === profileId);
		if (!profile) {
			throw new Error(`Unknown authentication profile ${profileId}`);
		}
		return profile;
	}

	private async getRedirectUri(): Promise<string> {
		const config = await this.configModule.getConfig();
		const redirectPath = config.auth.redirectPath.replace(/^\//, "");
		return `${mainConfig.names.protocol}://${redirectPath}`;
	}

	private isSessionValid(profileId: string) {
		const session = this.sessions.get(profileId);
		return !!session && session.expiresAt > Date.now();
	}

	private refreshTokenKey(profileId: string): `oidc-profile:${string}:refresh-token` {
		return `oidc-profile:${profileId}:refresh-token`;
	}

	private randomBase64Url(size: number): string {
		return crypto.randomBytes(size).toString("base64url");
	}

	private sha256Base64Url(value: string): string {
		return crypto.createHash("sha256").update(value).digest("base64url");
	}
}
