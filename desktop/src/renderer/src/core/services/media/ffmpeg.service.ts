import { injectable } from "inversify";
import { FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";

@injectable()
export class FfmpegService {
	isAvailable() {
		return window.preload.ipc.send.process.ffmpeg.isAvailable();
	}

	convert(options: FfmpegConvertOptions) {
		return window.preload.ipc.send.process.ffmpeg.convert(options);
	}

	getEncoders() {
		return window.preload.ipc.send.process.ffmpeg.getEncoders();
	}

	probe(path: string) {
		return window.preload.ipc.send.process.ffmpeg.probe(path);
	}

	public extractNbFrameProcessed(chunk: string) {
		const data = chunk
			.toString()
			.split("\n")
			.map((line) =>
				line
					.trim()
					.split("=")
					.map((l) => l.trim().split(" "))
			);

		if (data[0][0][0] !== "frame") {
			return null;
		}

		const frame = data[0][1][0];

		return Number.parseInt(frame);
	}

	public extractFps(probe: FfprobeResult) {
		const videoStream = probe.streams.find((s) => s.codec_type === "video");

		if (!videoStream || !videoStream.avg_frame_rate) {
			return 0;
		}

		const [numerator, denominator] = videoStream.avg_frame_rate.split("/").map(Number);

		return numerator / denominator;
	}

	public extractNbFrames(probe: FfprobeResult) {
		const duration = Number(probe.format.duration); // in seconds
		const fps = this.extractFps(probe);

		if (fps === 0) {
			throw new Error("No video stream found");
		}

		return Math.floor(duration * fps);
	}
}
