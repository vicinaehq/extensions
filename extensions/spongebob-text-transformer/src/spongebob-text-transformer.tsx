import { Action, ActionPanel, List } from "@vicinae/api";
import { useState } from "react";
import { toSpongebobCase } from "./utils";

export default function Command() {
	const [searchText, setSearchText] = useState("");

	const transformedText = toSpongebobCase(searchText || "Spongebob Text Transformer");

	return (
		<List
			onSearchTextChange={setSearchText}
			searchBarPlaceholder="Type text to transform..."
			throttle={true}
		>
			<List.Item
				title={transformedText}
				icon="spongebob.jpg"
				actions={
					<ActionPanel>
						<Action.CopyToClipboard content={transformedText} />
						<Action.Paste content={transformedText} />
					</ActionPanel>
				}
			/>
		</List>
	);
}
