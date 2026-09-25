import { cloneElement, isValidElement, useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { routes } from "@/config/routes.config";
import { useNavigate } from "react-router";
import "./Dashboard.scss";

export function Dashboard() {
	const navigate = useNavigate();

	const cards = useMemo(
		() =>
			Object.values(routes)
				.filter((r) => r.show.appboard)
				.map((r) => {
					const isInternal = r.path.startsWith("/internal");
					const accentColor = isInternal ? "#4fd2ff" : "#00FF88";

					return (
						<Box
							key={r.path}
							className={"Dashboard__card"}
							onClick={() => {
								void navigate(r.path);
							}}
							sx={{
								"&:hover": {
									borderColor: accentColor,
									backgroundColor: "var(--surface-2)",
								},
							}}
						>
							{r.icon && isValidElement(r.icon) && (
								<Box className={"Dashboard__card-icon"} sx={{ color: accentColor }}>
									{cloneElement(r.icon as React.ReactElement<{ sx?: object }>, {
										sx: { fontSize: 24 },
									})}
								</Box>
							)}
							<Typography className={"Dashboard__card-title"}>{r.name}</Typography>
							{r.description && <Typography className={"Dashboard__card-desc"}>{r.description}</Typography>}
							<Typography className={"Dashboard__card-tag"} sx={{ color: accentColor }}>
								{isInternal ? "Internal" : "External"}
							</Typography>
						</Box>
					);
				}),
		[navigate]
	);

	return (
		<Stack
			className={"Dashboard"}
			sx={{
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Box className={"Dashboard__header"}>
				<Typography className={"Dashboard__title"}>Elytools</Typography>
				<Box className={"Dashboard__divider"} />
				<Typography className={"Dashboard__label"}>Modules</Typography>
			</Box>
			<Box className={"Dashboard__grid"}>{cards}</Box>
		</Stack>
	);
}
