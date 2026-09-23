import { useAppSelector } from "@store";
import "./HomeAssistant.scss";

export function HomeAssistant() {
	const url = useAppSelector((s) => s.config.current.endpoints.homeAssistant);

	return <iframe src={url} style={{ border: 0 }} className={"HomeAssistant"} />;
}
