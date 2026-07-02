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
			{browsers.map((browser) => (
				<List.Dropdown.Item
					key={browser.id}
					title={browser.name}
					value={browser.id}
					icon={browser.icon}
				/>
			))}
		</List.Dropdown>
	);
};
