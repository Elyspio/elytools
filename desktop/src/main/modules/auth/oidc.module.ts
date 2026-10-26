import { powerMonitor, shell } from "electron";
import { inject, injectable, LazyServiceIdentifier } from "inversify";
import crypto, { randomUUID } from "node:crypto";
import { ConfigModule } from "@main/modules/config/config.module";
import { SecureStorageModule } from "@main/modules/security/secure-storage.module";
import { mainConfig } from "@shared/config/main.config";
import type { OidcProfile } from "@shared/config/app.config";
import type { AuthModuleName, OidcAuthStatus, OidcProfileInput, OidcSessionHealth, OidcSessionTokens } from "@shared/types/auth.types";
import { LogModule } from "@main/modules/log.module";
import { IpcModule } from "@main/modules/ipc.module";
import { log } from "@main/utils/logs.utils";

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

type OidcErrorResponse = {
	error?: string;
	error_description?: string;
};

/**
 * Outcome of the last refresh of a profile
 */
type OidcHealthEntry = {
	health: Extract<OidcSessionHealth, "valid" | "expired" | "unreachable">;
	error: string | null;
	checkedAt: string;
};

const DEFAULT_SCOPES = "openid profile offline_access";
/** Delay between two checks of the sessions, a real refresh that also keeps the offline sessions alive */
const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** The network is often not back yet when the computer wakes up */
const HEALTH_CHECK_RESUME_DELAY_MS = 10 * 1000;

/**
 * Sessions of the OIDC profiles (one per provider / realm), every profile sharing the elytools:// redirect.
 */
@injectable()
export class OidcModule extends LogModule {
	private pendingAuth?: OidcPendingAuth;
	private readonly sessions = new Map<string, OidcSession>();
	private readonly discoveryCache = new Map<string, OidcDiscovery>();
	/** Refresh in progress per profile: concurrent callers share it instead of sending the same refresh token N times */
	private readonly refreshes = new Map<string, Promise<OidcSession>>();
	private readonly health = new Map<string, OidcHealthEntry>();
	private healthCheckTimer?: ReturnType<typeof setInterval>;

	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(SecureStorageModule) private readonly secureStorageModule: SecureStorageModule,
		@inject(new LazyServiceIdentifier(() => IpcModule)) private readonly ipcModule: IpcModule
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
			this.setHealth(profile.id, "valid", null);
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
		this.health.delete(profileId);
		await this.secureStorageModule.deleteSecret(this.refreshTokenKey(profileId));
		this.notifyStatuses();
	}

	public async listStatus(): Promise<OidcAuthStatus[]> {
		const config = await this.configModule.getConfig();
		return await Promise.all(
			config.auth.profiles.map(async (profile): Promise<OidcAuthStatus> => {
				const hasRefreshToken = !!(await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id)));
				const configured = !!profile.issuerUrl && !!profile.clientId;
				const entry = this.health.get(profile.id);
				const health = this.toHealth(configured, hasRefreshToken, entry);
				return {
					profileId: profile.id,
					configured,
					authenticated: health === "valid" || health === "unchecked" || health === "unreachable",
					hasRefreshToken,
					health,
					error: health === "expired" || health === "unreachable" ? (entry?.error ?? null) : null,
					checkedAt: entry?.checkedAt ?? null,
				};
			})
		);
	}

	/**
	 * Checks the sessions now, then every {@link HEALTH_CHECK_INTERVAL_MS} and when the computer wakes up
	 */
	public startHealthChecks() {
		if (this.healthCheckTimer) return;
		void this.checkProfiles();
		this.healthCheckTimer = setInterval(() => void this.checkProfiles(), HEALTH_CHECK_INTERVAL_MS);

		const checkLater = () => setTimeout(() => void this.checkProfiles(), HEALTH_CHECK_RESUME_DELAY_MS);
		powerMonitor.on("resume", checkLater);
		powerMonitor.on("unlock-screen", checkLater);
	}

	/**
	 * Refreshes the session of every signed in profile, so a session revoked or expired on the provider side shows up before a module needs it
	 */
	@log()
	public async checkProfiles(): Promise<OidcAuthStatus[]> {
		const config = await this.configModule.getConfig();
		await Promise.all(
			config.auth.profiles
				.filter((profile) => profile.issuerUrl && profile.clientId)
				.map(async (profile) => {
					if (!(await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id)))) return;
					try {
						await this.refreshSession(profile, "health check");
					} catch (error) {
						this.logger.warn(`Health check failed for profile ${profile.name}`, (error as Error).message);
					}
				})
		);

		const statuses = await this.listStatus();
		this.ipcModule.sendIpcToMainContent("auth:oidc:status", statuses);
		return statuses;
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

		return await this.refreshSession(profile, requester);
	}

	/**
	 * Refreshes the session of the profile, a single request at a time per profile
	 * @param requester named in the errors
	 */
	private async refreshSession(profile: OidcProfile, requester: string): Promise<OidcSession> {
		const inFlight = this.refreshes.get(profile.id);
		if (inFlight) {
			return await inFlight;
		}

		const refresh = this.refreshWithStoredToken(profile, requester).finally(() => this.refreshes.delete(profile.id));
		this.refreshes.set(profile.id, refresh);
		return await refresh;
	}

	private async refreshWithStoredToken(profile: OidcProfile, requester: string): Promise<OidcSession> {
		const refreshToken = await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id));
		if (!refreshToken) {
			throw new Error(`Not authenticated on profile ${profile.name} (${requester}). Please sign in first.`);
		}

		let res: Response;
		try {
			const discovery = await this.getDiscovery(profile.issuerUrl);
			res = await fetch(discovery.token_endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: profile.clientId,
					refresh_token: refreshToken,
				}),
			});
		} catch (error) {
			const reason = (error as Error).message;
			this.setHealth(profile.id, "unreachable", reason);
			throw new Error(`OIDC provider of profile ${profile.name} is unreachable (${requester}): ${reason}`);
		}

		if (!res.ok) {
			const body = await res.text();
			this.logger.error("Failed to refresh OIDC access token", { profile: profile.name, requester, status: res.status, body });
			const oidcError = this.parseErrorResponse(body);

			// The provider no longer knows the session (revoked, expired, idle too long): the refresh token is dead.
			if (res.status === 400 && oidcError.error === "invalid_grant") {
				const reason = oidcError.error_description ?? oidcError.error;
				this.sessions.delete(profile.id);
				// A sign in may have stored a new token during the request
				if ((await this.secureStorageModule.getSecret(this.refreshTokenKey(profile.id))) === refreshToken) {
					await this.secureStorageModule.deleteSecret(this.refreshTokenKey(profile.id));
				}
				this.setHealth(profile.id, "expired", reason);
				throw new Error(`Session of profile ${profile.name} has expired (${reason}), sign in again in Settings > Authentication`);
			}

			const reason = `${oidcError.error_description ?? oidcError.error ?? "unexpected response"} (${res.status})`;
			this.setHealth(profile.id, "unreachable", reason);
			throw new Error(`Failed to refresh OIDC access token of profile ${profile.name}: ${reason}`);
		}

		const tokens = (await res.json()) as OidcTokenResponse;
		const session = await this.applyTokenResponse(profile.id, tokens);
		this.setHealth(profile.id, "valid", null);
		return session;
	}

	private parseErrorResponse(body: string): OidcErrorResponse {
		try {
			return JSON.parse(body) as OidcErrorResponse;
		} catch {
			return {};
		}
	}

	private toHealth(configured: boolean, hasRefreshToken: boolean, entry: OidcHealthEntry | undefined): OidcSessionHealth {
		if (!configured) return "not-configured";
		if (!hasRefreshToken) return entry?.health === "expired" ? "expired" : "signed-out";
		if (!entry || entry.health === "expired") return "unchecked";
		return entry.health;
	}

	/**
	 * Records the outcome of a refresh, the renderer is notified when the health or its reason changes
	 */
	private setHealth(profileId: string, health: OidcHealthEntry["health"], error: string | null) {
		const previous = this.health.get(profileId);
		this.health.set(profileId, { health, error, checkedAt: new Date().toISOString() });
		if (previous?.health !== health || previous.error !== error) {
			this.notifyStatuses();
		}
	}

	private notifyStatuses() {
		void this.listStatus()
			.then((statuses) => this.ipcModule.sendIpcToMainContent("auth:oidc:status", statuses))
			.catch((error: unknown) => this.logger.error("Failed to send the OIDC statuses", error));
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
