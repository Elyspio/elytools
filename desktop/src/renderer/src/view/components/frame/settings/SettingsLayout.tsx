import { type ReactNode, useState } from "react";
import { alpha, Box, TextField, Typography } from "@mui/material";

/**
 * Bordered block of settings rows
 */
export function Group({ children }: Readonly<{ children: ReactNode }>) {
	return <Box sx={{ borderRadius: 2.5, border: "1px solid var(--border-subtle)", bgcolor: "var(--surface-1)" }}>{children}</Box>;
}

/**
 * Settings row: label and description on the left, its control on the right
 */
export function Setting({ label, description, children }: Readonly<{ label: ReactNode; description?: ReactNode; children?: ReactNode }>) {
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.5, "&:not(:last-child)": { borderBottom: "1px solid var(--border-subtle)" } }}>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography sx={{ fontSize: "0.88rem", fontWeight: 500 }}>{label}</Typography>
				{description && <Typography sx={{ fontSize: "0.75rem", color: "var(--text-muted)", overflowWrap: "anywhere" }}>{description}</Typography>}
			</Box>
			{children}
		</Box>
	);
}

/**
 * Row with a free content (no label column), separated like a {@link Setting}
 */
export function Row({ children }: Readonly<{ children: ReactNode }>) {
	return <Box sx={{ px: 2, py: 1.5, "&:not(:last-child)": { borderBottom: "1px solid var(--border-subtle)" } }}>{children}</Box>;
}

type TextSettingInputProps = {
	value: string;
	onSave: (value: string) => void;
	placeholder?: string;
	mono?: boolean;
	width?: number;
};

/**
 * Text field saved when leaving it (or on Enter), only when it changed
 */
export function TextSettingInput({ value, onSave, placeholder, mono, width = 280 }: Readonly<TextSettingInputProps>) {
	const [draft, setDraft] = useState(value);
	// The saved value changed elsewhere (state adjusted during render): the field follows it
	const [saved, setSaved] = useState(value);
	if (saved !== value) {
		setSaved(value);
		setDraft(value);
	}

	const commit = () => {
		if (draft !== value) onSave(draft);
	};

	return (
		<TextField
			size="small"
			value={draft}
			placeholder={placeholder}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") commit();
			}}
			slotProps={{ htmlInput: { spellCheck: false, style: mono ? { fontFamily: "var(--font-mono)", fontSize: "0.8rem" } : { fontSize: "0.85rem" } } }}
			sx={{ width, flexShrink: 0 }}
		/>
	);
}

type SidebarItemProps = {
	label: string;
	icon: ReactNode;
	active: boolean;
	badge: boolean;
	onClick: () => void;
};

export function SidebarItem({ label, icon, active, badge, onClick }: Readonly<SidebarItemProps>) {
	return (
		<Box
			component="button"
			onClick={onClick}
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 1,
				px: 1.25,
				py: 0.75,
				border: 0,
				borderRadius: 1.5,
				bgcolor: active ? "var(--surface-2)" : "transparent",
				color: active ? "text.primary" : "var(--text-muted)",
				font: "inherit",
				fontSize: "0.8rem",
				textAlign: "left",
				cursor: "pointer",
				transition: "background-color 120ms ease, color 120ms ease",
				"&:hover": { bgcolor: active ? "var(--surface-2)" : "rgba(255, 255, 255, 0.03)", color: "text.primary" },
				"& .MuiSvgIcon-root": { fontSize: 16, color: active ? "primary.main" : "inherit" },
			}}
		>
			{icon}
			<Box component="span" sx={{ flex: 1 }}>
				{label}
			</Box>
			{badge && (
				<Box
					component="span"
					sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "primary.main", boxShadow: (theme) => `0 0 6px ${alpha(theme.palette.primary.main, 0.6)}` }}
				/>
			)}
		</Box>
	);
}
