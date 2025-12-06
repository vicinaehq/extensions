import { Icon, List } from "@vicinae/api";
import type { ChromiumBrowser } from "./bookmarks";

export const BrowserSelector = ({
	browsers,
	onChange,
	filter,
}: {
	browsers: ChromiumBrowser[];
	filter: string;
	onChange?: (s: string) => void;
}) => {
	return (
		<List.Dropdown value={filter} onChange={onChange}>
			<List.Dropdown.Item
				title="All Browsers"
				value="all"
				icon={Icon.Bookmark}
			/>
			{browsers.map((b) => (
				<List.Dropdown.Item
					key={b.name}
					title={b.name}
					value={b.name}
					icon={b.icon}
				/>
			))}
		</List.Dropdown>
	);
};
