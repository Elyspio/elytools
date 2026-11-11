import { injectable } from "inversify";

@injectable()
export class FfmpegService {
	isAvailable() {
		return window.preload.ipc.send.process.ffmpeg.isAvailable();
	}

	getEncoders() {
		return window.preload.ipc.send.process.ffmpeg.getEncoders();
	}

	probe(path: string) {
		return window.preload.ipc.send.process.ffmpeg.probe(path);
	}
}
