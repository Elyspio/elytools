import { useEffect, useState } from "react";
import { useAppSelector } from "@store";
import { Tooltip } from "@mui/material";
import { convertSizeToHumanFormat, formatSizeChange } from "@view/utils/data.utils";
import type { EncodePhase } from "@shared/types/ffmpeg.types";
import { encodersSelectors, type QueueRow } from "@modules/encoder/encoders.selectors";
import { analyzeProgressFraction, DEFAULT_ENCODER_SETTINGS, ENCODER_PROFILES } from "@shared/encoder/encoder.profiles";

/** Label and tone of each phase; the tone drives the dot, the label and the progress line */
const phases: Record<EncodePhase, { label: string; tone: "idle" | "active" | "done" | "muted" | "error" }> = {
	pending: { label: "Waiting", tone: "idle" },
	analyzing: { label: "Analyzing", tone: "active" },
	encoding: { label: "Encoding", tone: "active" },
	remuxing: { label: "Remuxing", tone: "active" },
	done: { label: "Converted", tone: "done" },
	skipped: { label: "Skipped", tone: "muted" },
	failed: { label: "Failed", tone: "error" },
	aborted: { label: "Cancelled", tone: "error" },
};

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
	if (m > 0) return `${m}m${String(s).padStart(2, "0")}`;
	return `${s}s`;
}

/** Current time, refreshed every second while `active` (drives the remaining-time estimate) */
function useNow(active: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [active]);
	return now;
}

/**
 * Encoding queue: one row per file. The rule under each row is its progress bar.
 */
export const EncoderDashboard = () => {
	const rows = useAppSelector(encodersSelectors.queue.rows);
	const profileId = useAppSelector((s) => s.config.current.encoder?.profile ?? DEFAULT_ENCODER_SETTINGS.profile);
	const qualityLabel = ENCODER_PROFILES[profileId].qualityLabel;

	return (
		<ul className="EncoderQueue" aria-label="Encoding queue">
			{rows.map((row) => (
				<QueueRowItem key={row.path} row={row} qualityLabel={qualityLabel} />
			))}
		</ul>
	);
};

function QueueRowItem({ row: { path, name, size, state }, qualityLabel }: { row: QueueRow; qualityLabel: string }) {
	const file = { path, name, size };
	const progress = state.progress ?? 0;
	const startedAt = state.startedAt ?? 0;
	const { label, tone } = phases[state.phase];
	const running = state.phase === "encoding" || state.phase === "remuxing";
	const now = useNow(running);

	let timing = "";
	if (running && progress > 0.01 && startedAt > 0) {
		const elapsed = Math.max(0, now - startedAt) / 1000;
		timing = `${formatDuration((elapsed / progress) * (1 - progress))} left`;
	}

	const analysis = state.phase === "analyzing" ? state.analysis : undefined;
	const analyzed = analysis ? analyzeProgressFraction(analysis) : 0;

	if (state.phase === "analyzing") {
		timing = analysis
			? `Round ${analysis.round} · testing ${qualityLabel} ${analysis.quality} · ${analysis.samplesMeasured}/${analysis.samplesTotal} samples measured`
			: "Preparing samples…";
	}

	const fill = state.phase === "done" ? 1 : running ? progress : analysis ? analyzed : 0;

	return (
		<li className={`EncoderQueue__row EncoderQueue__row--${tone}`}>
			<div className="EncoderQueue__line">
				<span className="EncoderQueue__name" title={file.path}>
					{file.name}
				</span>
				<span className="EncoderQueue__status">
					<span className="EncoderQueue__dot" aria-hidden />
					{label}
					{(running || analysis) && <span className="EncoderQueue__percent">{Math.round((running ? progress : analyzed) * 100)} %</span>}
				</span>
			</div>

			<div className="EncoderQueue__line EncoderQueue__line--meta">
				<span className="EncoderQueue__size">
					{file.size > 0 && convertSizeToHumanFormat(file.size)}
					{state.phase === "done" && state.outputSize !== undefined && (
						<>
							{" → "}
							{convertSizeToHumanFormat(state.outputSize)}
							<span className={`EncoderQueue__gain${state.outputSize > file.size ? " EncoderQueue__gain--larger" : ""}`}>
								{formatSizeChange(file.size, state.outputSize)}
							</span>
						</>
					)}
				</span>

				{state.note ? (
					<span className="EncoderQueue__note" title={state.note}>
						{state.note}
					</span>
				) : (
					<span className="EncoderQueue__note" title={timing}>
						{timing}
					</span>
				)}

				{analysis && analysis.trials.length > 0 && (
					<span className="EncoderQueue__trials">
						{analysis.trials.map((trial) => (
							<Tooltip key={trial.quality} title={`${qualityLabel} ${trial.quality}: ${trial.xpsnr.toFixed(2)} dB, target ${trial.reached ? "reached" : "missed"}`}>
								<span className={`EncoderQueue__trial EncoderQueue__trial--${trial.reached ? "reached" : "missed"}`}>
									{trial.quality} · {trial.xpsnr.toFixed(1)}
								</span>
							</Tooltip>
						))}
					</span>
				)}

				{state.quality !== undefined && state.xpsnr !== undefined && (
					<Tooltip
						title={
							state.targetReached
								? `${qualityLabel} ${state.quality} is the most compact value reaching the target on ${state.samples ?? 12} samples`
								: `Target not reached: best quality of the range used`
						}
					>
						<span className={`EncoderQueue__quality${state.targetReached ? "" : " EncoderQueue__quality--missed"}`}>
							{qualityLabel} {state.quality} · {state.xpsnr.toFixed(1)} dB
						</span>
					</Tooltip>
				)}
			</div>

			<div className={`EncoderQueue__track${state.phase === "analyzing" && !analysis ? " EncoderQueue__track--scanning" : ""}`} aria-hidden>
				<div className="EncoderQueue__fill" style={{ transform: `scaleX(${fill})` }} />
			</div>
		</li>
	);
}
