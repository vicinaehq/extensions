import {
	Action,
	ActionPanel,
	Icon,
	List,
	LocalStorage,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { kaomojis } from "./kaomojis";

const FAVORITES_KEY = "kaomoji-favorites";

async function loadFavorites(): Promise<Set<string>> {
	const raw = await LocalStorage.getItem<string>(FAVORITES_KEY);
	if (!raw) return new Set();
	try {
		return new Set(JSON.parse(raw));
	} catch {
		return new Set();
	}
}

async function saveFavorites(favs: Set<string>) {
	await LocalStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

export default function KaomojiList() {
	const [searchText, setSearchText] = useState("");
	const [favorites, setFavorites] = useState<Set<string>>(new Set());
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		loadFavorites().then((favs) => {
			setFavorites(favs);
			setLoaded(true);
		});
	}, []);

	const toggleFavorite = async (kaomoji: string) => {
		setFavorites((prev) => {
			const next = new Set(prev);
			if (next.has(kaomoji)) {
				next.delete(kaomoji);
			} else {
				next.add(kaomoji);
			}
			saveFavorites(next);
			return next;
		});
	};

	const filtered = searchText
		? kaomojis.filter((k) =>
				k.toLowerCase().includes(searchText.toLowerCase()),
			)
		: kaomojis;

	// Sort: favorites first
	const sorted = [...filtered].sort((a, b) => {
		const af = favorites.has(a) ? 0 : 1;
		const bf = favorites.has(b) ? 0 : 1;
		return af - bf;
	});

	const favCount = sorted.filter((k) => favorites.has(k)).length;

	return (
		<List
			searchBarPlaceholder="Search kaomojis..."
			onSearchTextChange={setSearchText}
			searchText={searchText}
			isLoading={!loaded}
		>
			{favCount > 0 && (
				<List.Section title={`★ Favorites (${favCount})`}>
					{sorted
						.filter((k) => favorites.has(k))
						.map((kaomoji) => (
							<List.Item
								key={kaomoji}
								title={kaomoji}
								icon={Icon.Star}
								actions={
									<ActionPanel>
										<Action.Paste
											title="Paste Kaomoji"
											content={kaomoji}
										/>
										<Action.CopyToClipboard
											title="Copy Kaomoji"
											content={kaomoji}
											shortcut={{ modifiers: ["ctrl"], key: "c" }}
										/>
										<Action
											title="Remove from Favorites"
											icon={Icon.StarDisabled}
											shortcut={{ modifiers: ["ctrl"], key: "f" }}
											onAction={() => toggleFavorite(kaomoji)}
										/>
									</ActionPanel>
								}
							/>
						))}
				</List.Section>
			)}
			<List.Section title="All Kaomojis">
				{sorted
					.filter((k) => !favorites.has(k))
					.map((kaomoji) => (
						<List.Item
							key={kaomoji}
							title={kaomoji}
							icon={Icon.Emoji}
							actions={
								<ActionPanel>
									<Action.Paste
										title="Paste Kaomoji"
										content={kaomoji}
									/>
									<Action.CopyToClipboard
										title="Copy Kaomoji"
										content={kaomoji}
										shortcut={{ modifiers: ["ctrl"], key: "c" }}
									/>
									<Action
										title="Add to Favorites"
										icon={Icon.Star}
										shortcut={{ modifiers: ["ctrl"], key: "f" }}
										onAction={() => toggleFavorite(kaomoji)}
									/>
								</ActionPanel>
							}
						/>
					))}
			</List.Section>
		</List>
	);
}
