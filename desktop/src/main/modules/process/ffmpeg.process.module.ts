import { LogModule } from "@main/modules/log.module";
import { log } from "@main/utils/logs.utils";
import { inject, injectable } from "inversify";
import { ProcessModule } from "@main/modules/process/process.module";
import { resultGuards } from "@shared/types/process.types";
import type { Encoder, EncoderType, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import os from "node:os";

@injectable()
export class FfmpegProcessModule extends LogModule {
	@inject(ProcessModule)
	private readonly processModule!: ProcessModule;

	public constructor() {
		super("FfmpegProcessModule");
	}

	@log.debug()
	public async getEncoders(): Promise<Encoder[]> {
		const { stdout } = await this.processModule.execute("ffmpeg -encoders");

		const lines = stdout.split(os.EOL);

		const startIndex = lines.findIndex((line) => line.includes("------")) + 1;

		// Regex breakdown:
		// ^\s+       : Starts with whitespace
		// ([A-Z\.]{6}): Capture the 6-character flag string (Group 1)
		// \s+        : Whitespace separator
		// (\S+)      : Capture the encoder name (Group 2)
		// \s+        : Whitespace separator
		// (.*)       : Capture the rest as description (Group 3)
		const pattern = /^\s+([A-Z.]{6})\s+(\S+)\s+(.*)$/;

		return lines
			.slice(startIndex)
			.map((line): Encoder | null => {
				const match = pattern.exec(line);

				if (match) {
					const flags = match[1]; // e.g. "V....."
					const name = match[2]; // e.g. "libx264"
					const desc = match[3].trim();

					// Parse the Type (1st character)
					let type: EncoderType;

					switch (flags[0]) {
						case "V":
							type = "video";
							break;
						case "A":
							type = "audio";
							break;
						case "S":
							type = "subtitle";
							break;
						default:
							type = "unknown";
							break;
					}

					return {
						id: name,
						description: desc,
						type: type,
						capabilities: {
							experimental: flags.includes("X"),
							frameMt: flags.includes("F"), // Frame-level multithreading
							sliceMt: flags.includes("S"), // Slice-level multithreading
							bandwidthLimited: flags.includes("B"),
							directRendering: flags.includes("D"),
						},
						rawFlags: flags,
					};
				} else {
					return null;
				}
			})
			.filter(Boolean) as Encoder[];
	}

	/**
	 * Check if ffmpeg is available on the system
	 */
	@log.debug()
	public async isAvailable(): Promise<boolean> {
		try {
			const result = await this.processModule.execute("ffmpeg -version");
			return result.stdout.includes("ffmpeg version");
		} catch {
			return false;
		}
	}

	@log.debug()
	public async convert(opts: FfmpegConvertOptions): Promise<string> {
		const args = [
			"-y", // Overwrite output files without asking
			"-i",
			`${opts.files.input}`, // Source file
			"-preset",
			"p6", // 1 (faster) - 7 (better)
			"-tune",
			"hq", // film, animation, grain, stillimage, fastdecode, zerolatency
			"-cq",
			"24",
			"-b:v",
			"0",
			"-spatial-aq",
			"1",
			"-temporal-aq",
			"1",
			"-pix_fmt",
			"yuv420p10le",
			"-rc",
			"vbr",
			"-c:a",
			"copy", // Copy audio stream without re-encoding
			"-c:v",
			opts.format.id, // Use specified video encoder
			"-r",
			opts.fps.toString(), // Set output frame rate (used to be a multiple of 24 like 120 or 240)
			`${opts.files.output}`,
		];

		this.logger.error("Starting ffmpeg process " + args.join(" "));

		const result = await this.processModule.spawn("ffmpeg", args, {});

		if (resultGuards.is.error(result)) {
			this.logger.error("Failed to start ffmpeg process", { error: result.error });
			throw new Error("Failed to start ffmpeg process " + result.error);
		}

		return result.pid;
	}

	public async probe(path: string): Promise<FfprobeResult> {
		const result = await this.processModule.execute(`ffprobe -v quiet -print_format json -show_format -show_streams "${path}"`);

		if (result.stderr) {
			this.logger.error("ffprobe error", { error: result.stderr });
			throw new Error("ffprobe error: " + result.stderr);
		}

		return JSON.parse(result.stdout) as FfprobeResult;
	}
}
