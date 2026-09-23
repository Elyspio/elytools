import { useAppSelector } from "@store";
import { IconButton, Stack, Tooltip } from "@mui/material";
import { CopyAll, Download } from "@mui/icons-material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import type { NyaaTorrentItem } from "@shared/types/torrent.types";
import { getSendButtonColor, getSendButtonTooltip } from "@components/internal/torrent/torrent.utils";

type TorrentRowActionProps = {
	row: NyaaTorrentItem;
	sendToQbittorrent: (row: NyaaTorrentItem) => void;
};
export function TorrentRowAction({ row, sendToQbittorrent }: TorrentRowActionProps) {
	const sendStatuses = useAppSelector((s) => s.torrent.sendStatuses);

	const status = sendStatuses[row.id];
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
			{row.torrentUrl.startsWith("https") && (
				<Tooltip title="Download .torrent">
					<IconButton size="small" onClick={() => window.open(row.torrentUrl, "_blank")?.focus()}>
						<Download sx={{ fontSize: 16 }} />
					</IconButton>
				</Tooltip>
			)}
			{row.torrentUrl.startsWith("magnet") && (
				<Tooltip title="Copy magnet">
					<IconButton size="small" onClick={() => void navigator.clipboard.writeText(row.torrentUrl)}>
						<CopyAll sx={{ fontSize: 16 }} />
					</IconButton>
				</Tooltip>
			)}
			<Tooltip title={getSendButtonTooltip(status)}>
				<IconButton size="small" color={getSendButtonColor(status)} disabled={status === "sending"} onClick={() => sendToQbittorrent(row)}>
					<CloudDownloadIcon sx={{ fontSize: 16 }} />
				</IconButton>
			</Tooltip>
		</Stack>
	);
}
