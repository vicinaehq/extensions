import { TranslateList } from "./components/TranslateList";
import { useTranslate } from "./hooks/useTranslate";

export default function Translate() {
	const props = useTranslate();

	return <TranslateList {...props} />;
}
