import { useAppSelector } from "@store";
import { getGroupColor } from "@components/internal/torrent/torrent.utils";
import { IconButton, Stack, Tooltip } from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { Download, SearchOutlined } from "@mui/icons-material";
import React from "react";
import type { GetTorrentGroupedResult } from "@modules/torrent/torrent.types";

type TorrentGroupActionProps = {
	row: GetTorrentGroupedResult;
	onClick: (row: GetTorrentGroupedResult, e: React.MouseEvent) => void;
	onIconButtonClick: (row: GetTorrentGroupedResult) => void;
	onDownloadFiles: (row: GetTorrentGroupedResult, e: React.MouseEvent) => void;
	isDownloadingFiles: boolean;
};

export function TorrentGroupAction({ row, onClick, onIconButtonClick, onDownloadFiles, isDownloadingFiles }: TorrentGroupActionProps) {
	const sendStatuses = useAppSelector((s) => s.torrent.sendStatuses);
	const groupColor = getGroupColor(row, sendStatuses);
	const isSending = row.data.some((d) => sendStatuses[d.id] === "sending");
	const duplicateCount = row.data.filter((d) => sendStatuses[d.id] === "duplicate").length;
	const groupTooltip = isSending
		? "Sending..."
		: duplicateCount === row.data.length
			? `All ${duplicateCount} already in qBittorrent`
			: duplicateCount > 0
				? `Send all to qBittorrent (${duplicateCount}/${row.data.length} already exist)`
				: "Send all to qBittorrent";
	return (
		<Stack
			direction="row"
			spacing={0.25}
			sx={{
				alignItems: "center",
				justifyContent: "center",
				height: "100%",
			}}
		>
			<Tooltip title={isDownloadingFiles ? "Downloading..." : `Download the ${row.data.length} .torrent files`}>
				<span>
					<IconButton size="small" disabled={isDownloadingFiles} onClick={(e) => onDownloadFiles(row, e)}>
						<Download sx={{ fontSize: 16 }} />
					</IconButton>
				</span>
			</Tooltip>
			<Tooltip title={groupTooltip}>
				<IconButton size="small" color={groupColor} disabled={isSending} onClick={(e) => onClick(row, e)}>
					<CloudDownloadIcon sx={{ fontSize: 16 }} />
				</IconButton>
			</Tooltip>
			{row.min !== undefined && row.max !== undefined && (
				<Tooltip title="View episodes">
					<IconButton size="small" onClick={() => onIconButtonClick(row)}>
						<SearchOutlined sx={{ fontSize: 16 }} />
					</IconButton>
				</Tooltip>
			)}
		</Stack>
	);
}
