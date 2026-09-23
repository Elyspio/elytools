import { NvidiaSmi } from "./types/nvidia";
import { inject, injectable } from "inversify";
import { XMLParser } from "fast-xml-parser";
import { ProcessService } from "@services/common/process.service";

@injectable()
export class SystemService {
	private readonly xmlParser = new XMLParser();

	constructor(@inject(ProcessService) private readonly processService: ProcessService) {}

	public async cpuLoad(): Promise<number> {
		const data = await window.preload.ipc.send.system.getInformation("currentLoad");
		return data.currentLoad;
	}

	public async memoryUsed(): Promise<{ total: number; current: number }> {
		const data = await window.preload.ipc.send.system.getInformation("mem");
		return {
			total: data.total / 1e9,
			current: data.used / 1e9,
		};
	}

	public async gpuLoad(): Promise<{
		encode: number;
		decode: number;
		overall: number;
		memory: number;
	}> {
		const xml = (await this.processService.exec("nvidia-smi -x -q")).stdout;
		const data: NvidiaSmi = this.xmlParser.parse(xml) as NvidiaSmi;
		const use = data.nvidia_smi_log.gpu.utilization;
		const parse = (number: string) => Number.parseFloat(number.slice(0, -1));
		return {
			decode: parse(use.decoder_util),
			encode: parse(use.encoder_util),
			overall: parse(use.gpu_util),
			memory: parse(use.memory_util),
		};
	}

	public shutdown = () => this.processService.exec("shutdown -s -t 0");

	public sleep = () => this.processService.exec("rundll32.exe powrprof.dll,SetSuspendState 0,1,0");

	public hibernate = () => this.processService.exec("rundll32.exe powrprof.dll,SetSuspendState Hibernate");

	public lock = () => this.processService.exec("rundll32.exe user32.dll,LockWorkStation");

	public async getDownloadFolder() {
		let folder;
		const platform = window.preload.config.platform;

		if (platform === "win32") {
			const { stdout } = await this.processService.exec(String.raw`REG QUERY "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"`);
			const nodes = stdout
				.split("\r\n")
				.map((x) =>
					x
						.trim()
						.split(" ")
						.filter((line) => line.length)
				)
				.filter((line) => line.length);

			const folder_array = nodes.find((n) => n[0] === "{7D83EE9B-2244-4E70-B1F5-5393042AF1E4}");
			if (folder_array) {
				folder = folder_array[2];
			}
		} else if (platform === "linux") {
			const { stdout } = await this.processService.exec("xdg-user-dir DOWNLOAD");
			folder = stdout;
		}

		if (folder === undefined) {
			throw new Error("Could not find user's download folder");
		}

		return folder;
	}

	public async open(thing: string) {
		try {
			switch (window.preload.config.platform) {
				case "linux":
					await this.processService.exec("xdg-open " + thing);
					break;

				case "win32":
					await this.processService.exec("explorer.exe " + thing);
					break;
			}
		} catch {
			//
		}
	}

	public async isAppStarted(name: string) {
		const apps = await window.preload.ipc.send.system.getInformation("processes");
		return apps.list.some((app) => app.name.includes(name));
	}
}
