import { createTheme as createMuiTheme } from "@mui/material/styles";
import type {} from "@mui/x-data-grid/themeAugmentation";

export const theme = createMuiTheme({
	components: {
		MuiPaper: {
			styleOverrides: {
				root: {
					"&.MuiPaper-root": {
						backgroundImage: "unset !important",
					},
				},
			},
		},
		MuiButton: {
			styleOverrides: {
				root: {
					textTransform: "none",
					borderRadius: 6,
					fontWeight: 500,
					letterSpacing: "0.01em",
				},
				outlined: {
					borderColor: "rgba(255,255,255,0.12)",
					"&:hover": {
						borderColor: "#4fd2ff",
						backgroundColor: "rgba(79, 210, 255, 0.04)",
					},
				},
			},
		},
		MuiIconButton: {
			styleOverrides: {
				root: {
					borderRadius: 6,
					"&:hover": {
						backgroundColor: "rgba(255,255,255,0.04)",
					},
				},
			},
		},
		MuiDialog: {
			styleOverrides: {
				paper: {
					borderRadius: 12,
					border: "1px solid rgba(255,255,255,0.08)",
					backgroundImage: "none",
				},
			},
		},
		MuiDialogTitle: {
			styleOverrides: {
				root: {
					fontSize: "0.875rem",
					fontWeight: 600,
					letterSpacing: "0.01em",
				},
			},
		},
		MuiTextField: {
			styleOverrides: {
				root: {
					"& .MuiOutlinedInput-root": {
						"& fieldset": {
							borderColor: "rgba(255,255,255,0.1)",
						},
						"&:hover fieldset": {
							borderColor: "rgba(255,255,255,0.2)",
						},
					},
				},
			},
		},
		MuiListSubheader: {
			styleOverrides: {
				root: {
					fontWeight: 600,
					fontSize: "0.65rem",
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					color: "rgba(79, 210, 255, 0.7)",
					lineHeight: 2.5,
					backgroundColor: "transparent",
				},
			},
		},
		MuiSwitch: {
			styleOverrides: {
				switchBase: {
					"&.Mui-checked": {
						color: "#4fd2ff",
						"& + .MuiSwitch-track": {
							backgroundColor: "rgba(79, 210, 255, 0.3)",
						},
					},
				},
			},
		},
		MuiTooltip: {
			styleOverrides: {
				tooltip: {
					backgroundColor: "#1e1e1e",
					border: "1px solid rgba(255,255,255,0.08)",
					fontSize: "0.7rem",
					fontWeight: 400,
				},
			},
		},
		MuiChip: {
			styleOverrides: {
				root: {
					borderRadius: 6,
				},
			},
		},
		MuiDivider: {
			styleOverrides: {
				root: {
					borderColor: "rgba(255,255,255,0.06)",
				},
			},
		},
		MuiDataGrid: {
			styleOverrides: {
				root: {
					border: "1px solid rgba(255,255,255,0.06)",
					borderRadius: 8,
					"& .MuiDataGrid-columnHeaders": {
						backgroundColor: "var(--surface-1)",
						borderBottom: "1px solid rgba(255,255,255,0.06)",
					},
					"& .MuiDataGrid-columnHeaderTitle": {
						fontWeight: 600,
						fontSize: "0.75rem",
						letterSpacing: "0.02em",
						textTransform: "uppercase" as const,
						color: "rgba(255,255,255,0.5)",
					},
					"& .MuiDataGrid-cell": {
						borderBottom: "1px solid rgba(255,255,255,0.04)",
						fontSize: "0.8125rem",
					},
					"& .MuiDataGrid-row:hover": {
						backgroundColor: "rgba(255,255,255,0.02)",
					},
					"& .MuiDataGrid-footerContainer": {
						borderTop: "1px solid rgba(255,255,255,0.06)",
					},
					"& .MuiDataGrid-overlay": {
						backgroundColor: "transparent",
					},
				},
			},
		},
	},
	palette: {
		mode: "dark",
		primary: {
			main: "#4fd2ff",
		},
		secondary: {
			main: "#00FF88",
		},
		background: {
			default: "#0a0a0a",
			paper: "#141414",
		},
		text: {
			secondary: "rgba(255,255,255,0.5)",
		},
		divider: "rgba(255,255,255,0.06)",
	},
	typography: {
		fontFamily: '"IBM Plex Sans", sans-serif',
		fontSize: 14,
		h1: {
			fontSize: "2.25rem",
			fontWeight: 600,
			lineHeight: 1.2,
			letterSpacing: "-0.01em",
		},
		h2: {
			fontSize: "1.75rem",
			fontWeight: 600,
			lineHeight: 1.3,
			letterSpacing: "-0.01em",
		},
		h3: {
			fontSize: "1.5rem",
			fontWeight: 600,
			lineHeight: 1.3,
			letterSpacing: "-0.01em",
		},
		h4: {
			fontSize: "1.25rem",
			fontWeight: 500,
			lineHeight: 1.4,
		},
		h5: {
			fontSize: "1.1rem",
			fontWeight: 500,
			lineHeight: 1.4,
		},
		h6: {
			fontSize: "0.875rem",
			fontWeight: 500,
			lineHeight: 1.4,
		},
	},
});
