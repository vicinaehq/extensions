import { Icon } from "@vicinae/api";
import type { IdeId } from "../types";

export function getIdeIcon(ideId: IdeId): Icon {
	switch (ideId) {
		case "idea":
			return Icon.CodeBlock;
		case "pycharm":
			return Icon.Dna;
		case "webstorm":
			return Icon.Globe;
		case "goland":
			return Icon.Gauge;
		case "clion":
			return Icon.ComputerChip;
		case "datagrip":
			return Icon.BarChart;
		case "phpstorm":
			return Icon.Document;
		case "rubymine":
			return Icon.Star;
		case "rider":
			return Icon.Car;
		case "rustrover":
			return Icon.Hammer;
		case "aqua":
			return Icon.Raindrop;
		default:
			return Icon.AppWindow;
	}
}
