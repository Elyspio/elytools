import type { GetTorrentGroupedResult, SendStatus } from "@modules/torrent/torrent.types";

export function getSendButtonColor(status?: SendStatus): "primary" | "success" | "error" | "warning" {
	switch (status) {
		case "success":
			return "success";
		case "error":
			return "error";
		case "duplicate":
			return "warning";
		default:
			return "primary";
	}
}

export function getSendButtonTooltip(status?: SendStatus): string {
	switch (status) {
		case "success":
			return "Sent to qBittorrent";
		case "error":
			return "Failed to send";
		case "duplicate":
			return "Already in qBittorrent";
		case "sending":
			return "Sending...";
		default:
			return "Send to qBittorrent";
	}
}

export function getGroupColor(group: GetTorrentGroupedResult, statuses: Record<string, SendStatus>): "primary" | "success" | "error" | "warning" {
	const itemStatuses = group.data.map((d) => statuses[d.id]).filter(Boolean);
	if (itemStatuses.length === 0) return "primary";
	if (itemStatuses.some((s) => s === "error")) return "error";
	if (itemStatuses.every((s) => s === "duplicate")) return "warning";
	if (itemStatuses.every((s) => s === "success" || s === "duplicate")) return "success";
	return "primary";
}
