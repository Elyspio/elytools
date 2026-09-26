import { Box, Button, CircularProgress, Dialog, DialogContent, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import type { OidcProfile } from "@shared/config/app.config";
import type { OidcSessionTokens } from "@shared/types/auth.types";
import { SettingsInput, SettingsStat } from "./SettingsControls";
import "./OidcSessionDialog.scss";

type JwtClaims = Record<string, unknown>;

/**
 * Payload of a JWT, null for an opaque token
 */
function decodeJwt(token: string): JwtClaims | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const base64 = parts[1]
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
		const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes)) as JwtClaims;
	} catch {
		return null;
	}
}

function formatDuration(ms: number) {
	const seconds = Math.round(Math.abs(ms) / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days) return `${days} d ${hours} h`;
	if (hours) return `${hours} h ${minutes} min`;
	if (minutes) return `${minutes} min ${seconds % 60} s`;
	return `${seconds} s`;
}

function expiryLabel(exp: unknown, now: number) {
	if (typeof exp !== "number" || exp === 0) return "No expiry";
	const remaining = exp * 1000 - now;
	return remaining > 0 ? `in ${formatDuration(remaining)}` : `expired ${formatDuration(remaining)} ago`;
}

function formatDate(epochSeconds: unknown) {
	return typeof epochSeconds === "number" ? new Date(epochSeconds * 1000).toLocaleString() : undefined;
}

function asText(value: unknown): string | undefined {
	if (typeof value === "string") return value || undefined;
	if (typeof value === "number" || typeof value === "boolean") return value.toString();
	if (Array.isArray(value)) return value.map((entry) => asText(entry)).join(", ");
	return value === undefined || value === null ? undefined : JSON.stringify(value);
}

type RoleGroup = {
	/** Client id, or null for the realm roles */
	client: string | null;
	/** Keycloak own clients and realm defaults, folded by default */
	isBuiltin: boolean;
	roles: string[];
};

const BUILTIN_CLIENTS = new Set(["realm-management", "account", "broker"]);
const BUILTIN_REALM_ROLE = /^(offline_access|uma_authorization|default-roles-.+)$/;

/**
 * Roles of the Keycloak claims, grouped by client: application clients, then Keycloak ones, then the realm
 */
function keycloakRoleGroups(claims: JwtClaims): RoleGroup[] {
	const resourceAccess = (claims.resource_access as Record<string, { roles?: string[] }> | undefined) ?? {};
	const clientGroups = Object.entries(resourceAccess)
		.map(([client, access]) => ({ client, isBuiltin: BUILTIN_CLIENTS.has(client), roles: [...(access.roles ?? [])].sort() }))
		.filter((group) => group.roles.length > 0)
		.sort((a, b) => Number(a.isBuiltin) - Number(b.isBuiltin) || a.client.localeCompare(b.client));

	const realmRoles = (claims.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
	const appRealmRoles = realmRoles.filter((role) => !BUILTIN_REALM_ROLE.test(role)).sort();
	const builtinRealmRoles = realmRoles.filter((role) => BUILTIN_REALM_ROLE.test(role)).sort();

	return [
		...clientGroups,
		...(appRealmRoles.length ? [{ client: null, isBuiltin: false, roles: appRealmRoles }] : []),
		...(builtinRealmRoles.length ? [{ client: null, isBuiltin: true, roles: builtinRealmRoles }] : []),
	];
}

/**
 * Role split on its ":" separators, the last segment being the permission itself
 */
const RoleChip: React.FC<{ role: string }> = ({ role }) => {
	const segments = role.split(":");
	return (
		<span className="OidcSession__role" title={role}>
			{segments.map((segment, index) => (
				<React.Fragment key={index}>
					{index > 0 && <span className="OidcSession__role-sep">›</span>}
					<span className={index === segments.length - 1 ? "OidcSession__role-leaf" : "OidcSession__role-scope"}>{segment}</span>
				</React.Fragment>
			))}
		</span>
	);
};

const RolesPanel: React.FC<{ groups: RoleGroup[] }> = ({ groups }) => {
	const [filter, setFilter] = useState("");
	const [toggled, setToggled] = useState<Set<string>>(new Set());

	const needle = filter.trim().toLowerCase();
	const total = groups.reduce((acc, group) => acc + group.roles.length, 0);
	const visibleGroups = groups
		.map((group) => ({ ...group, roles: needle ? group.roles.filter((role) => `${group.client ?? "realm"}:${role}`.toLowerCase().includes(needle)) : group.roles }))
		.filter((group) => group.roles.length > 0);

	const groupKey = (group: RoleGroup) => `${group.client ?? "realm"}:${group.isBuiltin}`;
	// Built-in groups start folded, a click flips the default; a filter opens every match
	const isOpen = (group: RoleGroup) => !!needle || group.isBuiltin === toggled.has(groupKey(group));
	const flip = (group: RoleGroup) =>
		setToggled((current) => {
			const next = new Set(current);
			if (!next.delete(groupKey(group))) next.add(groupKey(group));
			return next;
		});

	return (
		<Stack spacing={1}>
			<Stack direction="row" sx={{ alignItems: "center" }} spacing={1}>
				<span className="Settings__label" style={{ flex: 1 }}>
					Roles · {total}
				</span>
				{total > 8 && <SettingsInput mono value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter roles" className="OidcSession__role-filter" />}
			</Stack>
			<Box className="OidcSession__role-groups">
				{visibleGroups.length === 0 && <span className="Settings__hint">No role matches « {filter} ».</span>}
				{visibleGroups.map((group) => (
					<Box key={groupKey(group)} className={`OidcSession__role-group ${isOpen(group) ? "OidcSession__role-group--open" : ""}`}>
						<button type="button" className="OidcSession__role-group-header" onClick={() => flip(group)}>
							<span className="OidcSession__role-group-arrow">›</span>
							<span className="OidcSession__role-group-name">{group.client ?? "Realm"}</span>
							<span className="OidcSession__role-group-kind">
								{group.client ? (group.isBuiltin ? "Keycloak client" : "client") : group.isBuiltin ? "Keycloak defaults" : "realm roles"}
							</span>
							<Box sx={{ flex: 1 }} />
							<span className="OidcSession__role-count">{group.roles.length}</span>
						</button>
						{isOpen(group) && (
							<Box className="OidcSession__roles">
								{group.roles.map((role) => (
									<RoleChip key={role} role={role} />
								))}
							</Box>
						)}
					</Box>
				))}
			</Box>
		</Stack>
	);
};

function useNow() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

const ClaimRow: React.FC<{ name: string; value?: React.ReactNode }> = ({ name, value }) =>
	value === undefined ? null : (
		<>
			<span className="OidcSession__claim-name">{name}</span>
			<span className="OidcSession__claim-value">{value}</span>
		</>
	);

const TokenPanel: React.FC<{ token: string; kind: "access" | "refresh" }> = ({ token, kind }) => {
	const now = useNow();
	const [isRevealed, setIsRevealed] = useState(false);
	const claims = decodeJwt(token);

	const copy = useCallback(async () => {
		await navigator.clipboard.writeText(token);
		toast.success(`${kind === "access" ? "Access" : "Refresh"} token copied`);
	}, [kind, token]);

	const roleGroups = claims ? keycloakRoleGroups(claims) : [];
	const exp = claims?.exp;
	const isExpired = typeof exp === "number" && exp !== 0 && exp * 1000 < now;

	return (
		<Stack spacing={2}>
			{claims ? (
				<>
					<Box className="Settings__stats">
						<SettingsStat label="Expires" value={<span className={isExpired ? "OidcSession__expired" : undefined}>{expiryLabel(exp, now)}</span>} />
						<SettingsStat label="Type" value={asText(claims.typ) ?? (kind === "access" ? "Bearer" : "Refresh")} />
						<SettingsStat label="User" value={asText(claims.preferred_username) ?? asText(claims.sub) ?? "—"} />
					</Box>

					{roleGroups.length > 0 && <RolesPanel groups={roleGroups} />}

					<Box className="OidcSession__claims">
						<ClaimRow name="Subject" value={asText(claims.sub)} />
						<ClaimRow name="Email" value={asText(claims.email)} />
						<ClaimRow name="Issuer" value={asText(claims.iss)} />
						<ClaimRow name="Audience" value={asText(claims.aud)} />
						<ClaimRow name="Authorized party" value={asText(claims.azp)} />
						<ClaimRow name="Scope" value={asText(claims.scope)} />
						<ClaimRow name="Issued at" value={formatDate(claims.iat)} />
						<ClaimRow name="Expires at" value={formatDate(claims.exp)} />
						<ClaimRow name="Session" value={asText(claims.sid)} />
					</Box>

					<details className="OidcSession__all-claims">
						<summary>All claims</summary>
						<pre>{JSON.stringify(claims, null, 2)}</pre>
					</details>
				</>
			) : (
				<span className="Settings__hint">Opaque token: the provider does not expose its content.</span>
			)}

			<Stack spacing={0.75}>
				<Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
					<span className="Settings__label" style={{ flex: 1 }}>
						Raw token
					</span>
					<Tooltip title={isRevealed ? "Hide" : "Reveal"}>
						<IconButton size="small" className="AuthSettings__icon-btn" onClick={() => setIsRevealed((prev) => !prev)}>
							{isRevealed ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
						</IconButton>
					</Tooltip>
					<Tooltip title="Copy">
						<IconButton size="small" className="AuthSettings__icon-btn" onClick={() => void copy()}>
							<ContentCopyIcon sx={{ fontSize: 15 }} />
						</IconButton>
					</Tooltip>
				</Stack>
				<Box className={`OidcSession__raw ${isRevealed ? "OidcSession__raw--revealed" : ""}`}>{isRevealed ? token : `${token.slice(0, 16)}${"•".repeat(32)}`}</Box>
			</Stack>
		</Stack>
	);
};

type OidcSessionDialogProps = {
	profile: OidcProfile;
	onClose: () => void;
};

/**
 * Access and refresh tokens of a signed in profile, loaded only while the dialog is open
 */
export const OidcSessionDialog: React.FC<OidcSessionDialogProps> = ({ profile, onClose }) => {
	const [tokens, setTokens] = useState<OidcSessionTokens | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState<"access" | "refresh">("access");

	const load = useCallback(() => {
		window.preload.ipc.send.auth.oidc
			.tokens(profile.id)
			.then((loaded) => {
				setTokens(loaded);
				setError(null);
			})
			.catch((e: Error) => setError(e.message));
	}, [profile.id]);

	useEffect(load, [load]);

	return (
		<Dialog open onClose={onClose} maxWidth="sm" fullWidth>
			<DialogContent className="OidcSession" sx={{ p: 0 }}>
				<Stack direction="row" spacing={1} className="OidcSession__header">
					<Box sx={{ flex: 1 }}>
						<Typography className="Settings__section-title">Session</Typography>
						<div className="OidcSession__title">{profile.name}</div>
					</Box>
					<Tooltip title="Reload (refreshes an expired access token)">
						<IconButton size="small" className="AuthSettings__icon-btn" onClick={load}>
							<RefreshIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
					<IconButton size="small" className="AuthSettings__icon-btn" onClick={onClose}>
						<CloseIcon sx={{ fontSize: 18 }} />
					</IconButton>
				</Stack>

				<Tabs value={tab} onChange={(_, value: "access" | "refresh") => setTab(value)} className="OidcSession__tabs">
					<Tab value="access" label="Access token" />
					<Tab value="refresh" label="Refresh token" />
				</Tabs>

				<Box className="OidcSession__body">
					{error && <Box className="Settings__alert">{error}</Box>}
					{!error && !tokens && (
						<Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
							<CircularProgress size={22} />
						</Box>
					)}
					{tokens && tab === "access" && <TokenPanel key={tokens.accessToken} token={tokens.accessToken} kind="access" />}
					{tokens &&
						tab === "refresh" &&
						(tokens.refreshToken ? (
							<TokenPanel key={tokens.refreshToken} token={tokens.refreshToken} kind="refresh" />
						) : (
							<span className="Settings__hint">No refresh token stored.</span>
						))}
				</Box>

				<Box className="OidcSession__footer">
					<span className="Settings__hint Settings__hint--warn">These tokens grant access to your account: do not share them.</span>
					<Box sx={{ flex: 1 }} />
					<Button size="small" className="AuthSettings__neutral-btn" onClick={onClose}>
						Close
					</Button>
				</Box>
			</DialogContent>
		</Dialog>
	);
};
