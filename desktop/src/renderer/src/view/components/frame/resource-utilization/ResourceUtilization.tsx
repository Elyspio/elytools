import "./ResourceUtilization.scss";
import { useAppSelector } from "@store";

function getBarColor(value: number): string {
	if (value >= 80) return "#ef5350";
	if (value >= 50) return "#ffa726";
	return "#4fd2ff";
}

export function ResourceUtilization() {
	const info = useAppSelector((s) => s.config.system);

	const format = (number?: number) => {
		if (!number || number <= 0) return "0%";
		return number.toFixed(1) + "%";
	};

	const metrics = [
		{ label: "CPU", value: info?.cpuLoad ?? 0 },
		{ label: "GPU", value: info?.gpuLoad?.encode ?? 0 },
		{ label: "MEM", value: info?.mem?.current ?? 0 },
	];

	return (
		<div className={"ResourceUtilization"}>
			{metrics.map((m) => (
				<div key={m.label} className={"ResourceUtilization__metric"}>
					<span className={"ResourceUtilization__label"}>{m.label}</span>
					<div className={"ResourceUtilization__bar"}>
						<div
							className={"ResourceUtilization__bar-fill"}
							style={{
								width: `${Math.min(100, Math.max(0, m.value))}%`,
								backgroundColor: getBarColor(m.value),
							}}
						/>
					</div>
					<span className={"ResourceUtilization__value"}>{format(m.value)}</span>
				</div>
			))}
		</div>
	);
}
