import type { OidcProfile } from "../config/app.config";

/**
 * Modules signing their requests with an OIDC profile.
 */
export type AuthModuleName = "torrent" | "llm-usage";

export type OidcProfileInput = Omit<OidcProfile, "id"> & {
	id?: string;
};

/**
 * Health of a profile session, checked at startup, periodically and on every refresh
 * - valid: the last refresh succeeded
 * - expired: the provider rejected the refresh token (session revoked or expired), a new sign in is required
 * - unreachable: the provider could not be reached, the refresh token is kept
 * - unchecked: signed in, not checked yet
 * - signed-out: no refresh token stored
 * - not-configured: issuer URL or client ID missing
 */
export type OidcSessionHealth = "valid" | "expired" | "unreachable" | "unchecked" | "signed-out" | "not-configured";

export type OidcAuthStatus = {
	profileId: string;
	configured: boolean;
	/** A usable session exists (valid, unchecked or unreachable) */
	authenticated: boolean;
	hasRefreshToken: boolean;
	health: OidcSessionHealth;
	/** Reason of the last failure, expired or unreachable */
	error: string | null;
	/** Date (ISO) of the last refresh attempt */
	checkedAt: string | null;
};

/**
 * Tokens of a signed in profile, shown in Settings for inspection
 */
export type OidcSessionTokens = {
	accessToken: string;
	accessTokenExpiresAt: string;
	refreshToken: string | null;
};
