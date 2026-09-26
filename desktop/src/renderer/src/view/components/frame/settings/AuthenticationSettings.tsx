import { Box, Button, IconButton, Link, Menu, MenuItem, Stack, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import KeyIcon from "@mui/icons-material/Key";
import React, { useCallback, useState } from "react";
import { toast } from "react-toastify";
import type { OidcProfile } from "@shared/config/app.config";
import type { AuthModuleName, OidcAuthStatus, OidcProfileInput } from "@shared/types/auth.types";
import "./AuthenticationSettings.scss";
import { SettingsField, SettingsGrid, SettingsInput, SettingsSection } from "./SettingsControls";
import { OidcSessionDialog } from "./OidcSessionDialog";

const DEFAULT_SCOPES = "openid profile offline_access";
const AVATAR_TONES = ["blue", "purple", "green", "orange", "pink"] as const;

type SessionState = "signed-in" | "signed-out" | "not-configured";

function sessionState(status: OidcAuthStatus | undefined): SessionState {
	if (status?.authenticated) return "signed-in";
	if (status && !status.configured) return "not-configured";
	return "signed-out";
}

const sessionLabels: Record<SessionState, string> = {
	"signed-in": "Signed in",
	"signed-out": "Signed out",
	"not-configured": "Not configured",
};

function avatarTone(profileId: string) {
	let hash = 0;
	for (let index = 0; index < profileId.length; index++) hash += profileId.charCodeAt(index);
	return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/**
 * Issuer without its scheme, the last segment (the Keycloak realm) emphasized
 */
const IssuerLabel: React.FC<{ issuerUrl: string }> = ({ issuerUrl }) => {
	const issuer = issuerUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
	if (!issuer) return <span className="AuthSettings__faint">No issuer</span>;
	const cut = issuer.lastIndexOf("/");
	if (cut < 0) return <b>{issuer}</b>;
	return (
		<>
			{issuer.slice(0, cut + 1)}
			<b>{issuer.slice(cut + 1)}</b>
		</>
	);
};

const SessionChip: React.FC<{ state: SessionState; pending?: boolean }> = ({ state, pending }) => (
	<span className={`AuthSettings__chip AuthSettings__chip--${pending ? "pending" : state}`}>
		<span className="AuthSettings__dot" />
		{pending ? "Waiting for browser…" : sessionLabels[state]}
	</span>
);

type ProfileRowProps = {
	profile?: OidcProfile;
	status?: OidcAuthStatus;
	usedBy: AuthModuleName[];
	isExpanded: boolean;
	isLoggingIn: boolean;
	isLoginBusy: boolean;
	onToggle: () => void;
	onSaved: () => Promise<void>;
	onLogin: (profileId: string) => Promise<void>;
	onCancelLogin: () => void;
	onLogout: (profileId: string) => Promise<void>;
};

const ProfileRow: React.FC<ProfileRowProps> = ({ profile, status, usedBy, isExpanded, isLoggingIn, isLoginBusy, onToggle, onSaved, onLogin, onCancelLogin, onLogout }) => {
	const [name, setName] = useState(profile?.name ?? "");
	const [issuerUrl, setIssuerUrl] = useState(profile?.issuerUrl ?? "");
	const [clientId, setClientId] = useState(profile?.clientId ?? "");
	const [scopes, setScopes] = useState(profile?.scopes ?? DEFAULT_SCOPES);
	const [isSaving, setIsSaving] = useState(false);
	const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
	const [isSessionOpen, setIsSessionOpen] = useState(false);

	const state = sessionState(status);
	const isDirty = !profile || name !== profile.name || issuerUrl !== profile.issuerUrl || clientId !== profile.clientId || scopes !== profile.scopes;

	const reset = useCallback(() => {
		setName(profile?.name ?? "");
		setIssuerUrl(profile?.issuerUrl ?? "");
		setClientId(profile?.clientId ?? "");
		setScopes(profile?.scopes ?? DEFAULT_SCOPES);
	}, [profile]);

	const cancel = useCallback(() => {
		reset();
		onToggle();
	}, [onToggle, reset]);

	const save = useCallback(async () => {
		setIsSaving(true);
		try {
			const input: OidcProfileInput = {
				id: profile?.id,
				name,
				issuerUrl,
				clientId,
				scopes,
			};
			await window.preload.ipc.send.auth.profiles.save(input);
			await onSaved();
			toast.success(`Profile ${name.trim()} saved`);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setIsSaving(false);
		}
	}, [clientId, issuerUrl, name, onSaved, profile, scopes]);

	const remove = useCallback(async () => {
		setMenuAnchor(null);
		if (!profile) return;
		const impact = usedBy.length ? `\nModules using it will be left without profile: ${usedBy.join(", ")}` : "";
		if (!window.confirm(`Delete profile ${profile.name}?${impact}`)) return;
		try {
			await window.preload.ipc.send.auth.profiles.delete(profile.id);
			await onSaved();
		} catch (error) {
			toast.error((error as Error).message);
		}
	}, [onSaved, profile, usedBy]);

	const sessionAction = () => {
		if (!profile) return null;
		if (isLoggingIn) {
			return (
				<Button size="small" variant="outlined" color="error" onClick={onCancelLogin}>
					Cancel
				</Button>
			);
		}
		if (state === "signed-in") {
			return (
				<Button size="small" variant="outlined" className="AuthSettings__neutral-btn" onClick={() => void onLogout(profile.id)}>
					Sign out
				</Button>
			);
		}
		const blocker = state === "not-configured" ? "Set the issuer URL and client ID first" : isDirty ? "Save the profile first" : null;
		return (
			<Tooltip title={blocker ?? ""}>
				<span>
					<Button size="small" variant="outlined" disabled={!!blocker || isLoginBusy} onClick={() => void onLogin(profile.id)}>
						Sign in
					</Button>
				</span>
			</Tooltip>
		);
	};

	return (
		<Box className={`AuthSettings__item ${isExpanded ? "AuthSettings__item--expanded" : ""}`}>
			<Box className="AuthSettings__row">
				<Box className={`AuthSettings__avatar AuthSettings__avatar--${profile ? avatarTone(profile.id) : "new"}`}>
					{profile ? (profile.name.trim()[0]?.toUpperCase() ?? "?") : <AddIcon sx={{ fontSize: 16 }} />}
				</Box>
				<Box className="AuthSettings__identity" onClick={onToggle}>
					<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
						<span className="AuthSettings__name">{profile ? profile.name : "New profile"}</span>
						{profile && <SessionChip state={state} pending={isLoggingIn} />}
					</Stack>
					<span className="AuthSettings__issuer">
						{profile ? (
							<>
								<IssuerLabel issuerUrl={profile.issuerUrl} />
								{profile.clientId && <span className="AuthSettings__faint"> · {profile.clientId}</span>}
							</>
						) : (
							"One profile per provider or Keycloak realm"
						)}
					</span>
				</Box>
				{usedBy.map((module) => (
					<span key={module} className="AuthSettings__module">
						{module}
					</span>
				))}
				{sessionAction()}
				{profile && (
					<>
						<Tooltip title={isExpanded ? "Close" : "Edit"}>
							<IconButton size="small" className={`AuthSettings__icon-btn ${isExpanded ? "AuthSettings__icon-btn--active" : ""}`} onClick={onToggle}>
								<EditOutlinedIcon sx={{ fontSize: 16 }} />
							</IconButton>
						</Tooltip>
						<IconButton size="small" className="AuthSettings__icon-btn" onClick={(e) => setMenuAnchor(e.currentTarget)}>
							<MoreHorizIcon sx={{ fontSize: 16 }} />
						</IconButton>
						<Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
							<MenuItem
								disabled={state !== "signed-in"}
								onClick={() => {
									setMenuAnchor(null);
									setIsSessionOpen(true);
								}}
								sx={{ fontSize: "0.8rem", gap: 1 }}
							>
								<KeyIcon sx={{ fontSize: 16 }} />
								View tokens
							</MenuItem>
							<MenuItem onClick={() => void remove()} sx={{ color: "error.main", fontSize: "0.8rem", gap: 1 }}>
								<DeleteOutlinedIcon sx={{ fontSize: 16 }} />
								Delete profile
							</MenuItem>
						</Menu>
						{isSessionOpen && <OidcSessionDialog profile={profile} onClose={() => setIsSessionOpen(false)} />}
					</>
				)}
			</Box>

			{isExpanded && (
				<Box className="AuthSettings__editor">
					<SettingsGrid>
						<SettingsField label="Name">
							<SettingsInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Apps" autoFocus={!profile} />
						</SettingsField>
						<SettingsField label="Client ID">
							<SettingsInput mono value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="elytools" />
						</SettingsField>
						<SettingsField label="Issuer URL" wide>
							<SettingsInput mono value={issuerUrl} onChange={(e) => setIssuerUrl(e.target.value)} placeholder="https://auth.example.com/realms/apps" />
						</SettingsField>
						<SettingsField label="Scopes" wide hint="Public client with PKCE, no client secret: disable « Client authentication » on the Keycloak client.">
							<SettingsInput mono value={scopes} onChange={(e) => setScopes(e.target.value)} />
						</SettingsField>
					</SettingsGrid>
					<Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
						<span className="Settings__hint">{profile ? "Changing issuer, client or scopes signs the profile out." : ""}</span>
						<Box sx={{ flex: 1 }} />
						<Button size="small" className="AuthSettings__neutral-btn" onClick={cancel}>
							Cancel
						</Button>
						<Button size="small" variant="contained" disabled={!isDirty || isSaving || !name.trim()} onClick={() => void save()}>
							{profile ? "Save profile" : "Create profile"}
						</Button>
					</Stack>
				</Box>
			)}
		</Box>
	);
};

type AuthenticationSettingsProps = {
	redirectPath: string;
	onRedirectPathChange: (value: string) => void;
	profiles: OidcProfile[];
	statuses: OidcAuthStatus[];
	bindings: Record<AuthModuleName, string | null>;
	/** Saves the Settings draft, so the login uses the redirect path on screen */
	beforeLogin: () => Promise<void>;
	onProfilesChange: () => Promise<void>;
	refreshStatuses: () => Promise<void>;
};

const NEW_PROFILE = "new";

export const AuthenticationSettings: React.FC<AuthenticationSettingsProps> = ({
	redirectPath,
	onRedirectPathChange,
	profiles,
	statuses,
	bindings,
	beforeLogin,
	onProfilesChange,
	refreshStatuses,
}) => {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [loggingInProfileId, setLoggingInProfileId] = useState<string | null>(null);
	const [isEditingRedirect, setIsEditingRedirect] = useState(false);

	const redirectUri = `elytools://${redirectPath.replace(/^\//, "")}`;

	const login = useCallback(
		async (profileId: string) => {
			setLoggingInProfileId(profileId);
			try {
				await beforeLogin();
				await window.preload.ipc.send.auth.oidc.startLogin(profileId);
				await refreshStatuses();
				toast.success("Signed in");
			} catch (error) {
				toast.error((error as Error).message);
			} finally {
				setLoggingInProfileId(null);
			}
		},
		[beforeLogin, refreshStatuses]
	);

	const logout = useCallback(
		async (profileId: string) => {
			await window.preload.ipc.send.auth.oidc.logout(profileId);
			await refreshStatuses();
		},
		[refreshStatuses]
	);

	const cancelLogin = useCallback(() => {
		window.preload.ipc.send.auth.oidc.cancelLogin();
	}, []);

	const onCreated = useCallback(async () => {
		setExpandedId(null);
		await onProfilesChange();
	}, [onProfilesChange]);

	const copyRedirectUri = useCallback(async () => {
		await navigator.clipboard.writeText(redirectUri);
		toast.success("Redirect URI copied");
	}, [redirectUri]);

	const toggle = (id: string) => setExpandedId((current) => (current === id ? null : id));
	const usedBy = (profileId: string) => (Object.keys(bindings) as AuthModuleName[]).filter((module) => bindings[module] === profileId);

	return (
		<Box className="AuthSettings">
			<SettingsSection
				title="OIDC profiles"
				description="One profile per provider or Keycloak realm, then pick it in each module."
				action={
					<Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={expandedId === NEW_PROFILE} onClick={() => setExpandedId(NEW_PROFILE)}>
						Add profile
					</Button>
				}
			>
				<Box className="AuthSettings__list">
					{profiles.length === 0 && expandedId !== NEW_PROFILE && (
						<Box className="AuthSettings__empty">
							<span>No profile yet.</span>
							<Link component="button" type="button" underline="hover" className="AuthSettings__link" onClick={() => setExpandedId(NEW_PROFILE)}>
								Create the first one
							</Link>
						</Box>
					)}

					{profiles.map((profile) => (
						<ProfileRow
							// Remount on external change so the form starts from the saved values
							key={`${profile.id}:${profile.name}:${profile.issuerUrl}:${profile.clientId}:${profile.scopes}`}
							profile={profile}
							status={statuses.find((status) => status.profileId === profile.id)}
							usedBy={usedBy(profile.id)}
							isExpanded={expandedId === profile.id}
							isLoggingIn={loggingInProfileId === profile.id}
							isLoginBusy={loggingInProfileId !== null}
							onToggle={() => toggle(profile.id)}
							onSaved={onProfilesChange}
							onLogin={login}
							onCancelLogin={cancelLogin}
							onLogout={logout}
						/>
					))}

					{expandedId === NEW_PROFILE && (
						<ProfileRow
							usedBy={[]}
							isExpanded
							isLoggingIn={false}
							isLoginBusy={false}
							onToggle={() => setExpandedId(null)}
							onSaved={onCreated}
							onLogin={login}
							onCancelLogin={cancelLogin}
							onLogout={logout}
						/>
					)}
				</Box>

				<Box className="AuthSettings__banner">
					<span className="AuthSettings__banner-label">Redirect URI to declare on every client</span>
					{isEditingRedirect ? (
						<Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flex: 1 }}>
							<span className="AuthSettings__mono AuthSettings__faint">elytools://</span>
							<SettingsInput mono className="AuthSettings__inline-input" value={redirectPath} onChange={(e) => onRedirectPathChange(e.target.value)} autoFocus />
						</Stack>
					) : (
						<>
							<span className="AuthSettings__mono">{redirectUri}</span>
							<Tooltip title="Copy">
								<IconButton size="small" className="AuthSettings__icon-btn" onClick={() => void copyRedirectUri()}>
									<ContentCopyIcon sx={{ fontSize: 14 }} />
								</IconButton>
							</Tooltip>
							<Box sx={{ flex: 1 }} />
						</>
					)}
					<Button size="small" className="AuthSettings__neutral-btn" onClick={() => setIsEditingRedirect((prev) => !prev)}>
						{isEditingRedirect ? "Done" : "Edit"}
					</Button>
				</Box>
			</SettingsSection>
		</Box>
	);
};

type AuthProfilePickerProps = {
	profiles: OidcProfile[];
	statuses: OidcAuthStatus[];
	value: string | null;
	onChange: (profileId: string | null) => void;
	onManageProfiles: () => void;
};

/**
 * Profile used by a module to sign its requests, with the state of each session
 */
export const AuthProfilePicker: React.FC<AuthProfilePickerProps> = ({ profiles, statuses, value, onChange, onManageProfiles }) => (
	<Stack spacing={1} className="AuthSettings">
		<span className="Settings__label">Authentication profile</span>
		<Box className="AuthSettings__picker">
			{profiles.map((profile) => {
				const state = sessionState(statuses.find((status) => status.profileId === profile.id));
				return (
					<Box key={profile.id} className={`AuthSettings__pick ${value === profile.id ? "AuthSettings__pick--selected" : ""}`} onClick={() => onChange(profile.id)}>
						<Tooltip title={sessionLabels[state]}>
							<span className={`AuthSettings__dot AuthSettings__dot--${state}`} />
						</Tooltip>
						<Box sx={{ minWidth: 0 }}>
							<div className="AuthSettings__name">{profile.name}</div>
							<div className="AuthSettings__issuer">
								<IssuerLabel issuerUrl={profile.issuerUrl} />
							</div>
						</Box>
					</Box>
				);
			})}
			<Box className={`AuthSettings__pick AuthSettings__pick--none ${value === null ? "AuthSettings__pick--selected" : ""}`} onClick={() => onChange(null)}>
				None
			</Box>
			<Link component="button" type="button" underline="hover" className="AuthSettings__link AuthSettings__manage" onClick={onManageProfiles}>
				Manage profiles <ArrowForwardIcon sx={{ fontSize: 13 }} />
			</Link>
		</Box>
		{value !== null && sessionState(statuses.find((status) => status.profileId === value)) !== "signed-in" && (
			<span className="Settings__hint Settings__hint--warn">This profile is not signed in: sign in from « Authentication ».</span>
		)}
	</Stack>
);
