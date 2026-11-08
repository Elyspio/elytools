import { injectable } from "inversify";
import type { FfmpegAnalyzeOptions, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import { getMainVideoStream } from "@shared/encoder/encoder.profiles";

@injectable()
export class FfmpegService {
	isAvailable() {
		return window.preload.ipc.send.process.ffmpeg.isAvailable();
	}

	convert(options: FfmpegConvertOptions) {
		return window.preload.ipc.send.process.ffmpeg.convert(options);
	}

	analyze(options: FfmpegAnalyzeOptions) {
		return window.preload.ipc.send.process.ffmpeg.analyze(options);
	}

	cancelAnalyses() {
		return window.preload.ipc.send.process.ffmpeg.cancelAnalyses();
	}

	getEncoders() {
		return window.preload.ipc.send.process.ffmpeg.getEncoders();
	}

	probe(path: string) {
		return window.preload.ipc.send.process.ffmpeg.probe(path);
	}

	public extractNbFrameProcessed(chunk: string) {
		const last = [...chunk.matchAll(/frame=\s*(\d+)/g)].at(-1);

		return last ? Number.parseInt(last[1]) : null;
	}

	public extractFps(probe: FfprobeResult) {
		const videoStream = getMainVideoStream(probe);

		if (!videoStream || !videoStream.avg_frame_rate) {
			return 0;
		}

		const [numerator, denominator] = videoStream.avg_frame_rate.split("/").map(Number);

		return denominator ? numerator / denominator : 0;
	}

	/**
	 * Expected number of frames, 0 when unknown (no progress is shown then).
	 */
	public extractNbFrames(probe: FfprobeResult) {
		const duration = Number(probe.format.duration); // in seconds
		const fps = this.extractFps(probe);
		const frames = Math.floor(duration * fps);

		return Number.isFinite(frames) && frames > 0 ? frames : 0;
	}
}
