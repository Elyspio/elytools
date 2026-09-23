import type { FileInfo } from "@shared/types/dialog.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";

export interface Media {
	file: FileInfo;
	property: FfprobeResult;
}
