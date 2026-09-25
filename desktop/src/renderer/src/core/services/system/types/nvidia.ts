// To parse this data:
//
//   import { Convert, NvidiaSmi } from "./file";
//
//   const nvidiaSmi = Convert.toNvidiaSmi(json);

export interface NvidiaSmi {
	_declaration: Declaration;
	_doctype: string;
	nvidia_smi_log: NvidiaSmiLog;
}

export interface Declaration {
	_attributes: DeclarationAttributes;
}

export interface DeclarationAttributes {
	version: string;
}

export interface NvidiaSmiLog {
	timestamp: Text;
	driver_version: Text;
	cuda_version: Text;
	attached_gpus: Text;
	gpu: GPU;
}

export type Text = string;

export interface GPU {
	_attributes: GPUAttributes;
	product_name: Text;
	product_brand: Text;
	display_mode: Text;
	display_active: Text;
	persistence_mode: Text;
	accounting_mode: Text;
	accounting_mode_buffer_size: Text;
	driver_model: DriverModel;
	serial: Text;
	uuid: Text;
	minor_number: Text;
	vbios_version: Text;
	multigpu_board: Text;
	board_id: Text;
	gpu_part_number: Text;
	inforom_version: InforomVersion;
	gpu_operation_mode: GPUOperationMode;
	gpu_virtualization_mode: GPUVirtualizationMode;
	ibmnpu: Ibmnpu;
	pci: PCI;
	fan_speed: Text;
	performance_state: Text;
	clocks_throttle_reasons: ClocksThrottleReasons;
	fb_memory_usage: MemoryUsage;
	bar1_memory_usage: MemoryUsage;
	compute_mode: Text;
	utilization: Utilization;
	encoder_stats: Stats;
	fbc_stats: Stats;
	ecc_mode: ECCMode;
	ecc_errors: ECCErrors;
	retired_pages: RetiredPages;
	temperature: Temperature;
	power_readings: PowerReadings;
	clocks: Clocks;
	applications_clocks: ApplicationsClocks;
	default_applications_clocks: ApplicationsClocks;
	max_clocks: Clocks;
	max_customer_boost_clocks: MaxCustomerBoostClocks;
	clock_policy: ClockPolicy;
	supported_clocks: Text;
	processes: Processes;
}

export interface GPUAttributes {
	id: string;
}

export interface ApplicationsClocks {
	graphics_clock: Text;
	mem_clock: Text;
}

export interface MemoryUsage {
	total: Text;
	used: Text;
	free: Text;
}

export interface ClockPolicy {
	auto_boost: Text;
	auto_boost_default: Text;
}

export interface Clocks {
	graphics_clock: Text;
	sm_clock: Text;
	mem_clock: Text;
	video_clock: Text;
}

export interface ClocksThrottleReasons {
	clocks_throttle_reason_gpu_idle: Text;
	clocks_throttle_reason_applications_clocks_setting: Text;
	clocks_throttle_reason_sw_power_cap: Text;
	clocks_throttle_reason_hw_slowdown: Text;
	clocks_throttle_reason_hw_thermal_slowdown: Text;
	clocks_throttle_reason_hw_power_brake_slowdown: Text;
	clocks_throttle_reason_sync_boost: Text;
	clocks_throttle_reason_sw_thermal_slowdown: Text;
	clocks_throttle_reason_display_clocks_setting: Text;
}

export interface DriverModel {
	current_dm: Text;
	pending_dm: Text;
}

export interface ECCErrors {
	volatile: Aggregate;
	aggregate: Aggregate;
}

export interface Aggregate {
	sram_correctable: Text;
	sram_uncorrectable: Text;
	dram_correctable: Text;
	dram_uncorrectable: Text;
}

export interface ECCMode {
	current_ecc: Text;
	pending_ecc: Text;
}

export interface Stats {
	session_count: Text;
	average_fps: Text;
	average_latency: Text;
}

export interface GPUOperationMode {
	current_gom: Text;
	pending_gom: Text;
}

export interface GPUVirtualizationMode {
	virtualization_mode: Text;
	host_vgpu_mode: Text;
}

export interface Ibmnpu {
	relaxed_ordering_mode: Text;
}

export interface InforomVersion {
	img_version: Text;
	oem_object: Text;
	ecc_object: Text;
	pwr_object: Text;
}

export interface MaxCustomerBoostClocks {
	graphics_clock: Text;
}

export interface PCI {
	pci_bus: Text;
	pci_device: Text;
	pci_domain: Text;
	pci_device_id: Text;
	pci_bus_id: Text;
	pci_sub_system_id: Text;
	pci_gpu_link_info: PCIGPULinkInfo;
	pci_bridge_chip: PCIBridgeChip;
	replay_counter: Text;
	replay_rollover_counter: Text;
	tx_util: Text;
	rx_util: Text;
}

export interface PCIBridgeChip {
	bridge_chip_type: Text;
	bridge_chip_fw: Text;
}

export interface PCIGPULinkInfo {
	pcie_gen: PcieGen;
	link_widths: LinkWidths;
}

export interface LinkWidths {
	max_link_width: Text;
	current_link_width: Text;
}

export interface PcieGen {
	max_link_gen: Text;
	current_link_gen: Text;
}

export interface PowerReadings {
	power_state: Text;
	power_management: Text;
	power_draw: Text;
	power_limit: Text;
	default_power_limit: Text;
	enforced_power_limit: Text;
	min_power_limit: Text;
	max_power_limit: Text;
}

export interface Processes {
	process_info: ProcessInfo[];
}

export interface ProcessInfo {
	pid: Text;
	type: Text;
	process_name: Text;
	used_memory: Text;
}

export interface RetiredPages {
	multiple_single_bit_retirement: LEBitRetirement;
	double_bit_retirement: LEBitRetirement;
	pending_blacklist: Text;
	pending_retirement: Text;
}

export interface LEBitRetirement {
	retired_count: Text;
	retired_pagelist: Text;
}

export interface Temperature {
	gpu_temp: Text;
	gpu_temp_max_threshold: Text;
	gpu_temp_slow_threshold: Text;
	gpu_temp_max_gpu_threshold: Text;
	memory_temp: Text;
	gpu_temp_max_mem_threshold: Text;
}

export interface Utilization {
	gpu_util: Text;
	memory_util: Text;
	encoder_util: Text;
	decoder_util: Text;
}
