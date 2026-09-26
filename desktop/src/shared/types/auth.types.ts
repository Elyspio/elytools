import type { OidcProfile } from "../config/app.config";

/**
 * Modules signing their requests with an OIDC profile.
 */
export type AuthModuleName = "torrent" | "llm-usage";

export type OidcProfileInput = Omit<OidcProfile, "id"> & {
	id?: string;
};

export type OidcAuthStatus = {
	profileId: string;
	configured: boolean;
	authenticated: boolean;
	hasRefreshToken: boolean;
};

/**
 * Tokens of a signed in profile, shown in Settings for inspection
 */
export type OidcSessionTokens = {
	accessToken: string;
	accessTokenExpiresAt: string;
	refreshToken: string | null;
};
