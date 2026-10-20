import { Action, ActionPanel, Icon, List, LocalStorage, showHUD } from "@vicinae/api";
import { useEffect, useState } from "react";

export const STORAGE_KEY_LANG = "selected_ocr_language";

interface Language {
	code: string;
	name: string;
	flag: string;
}


const TESSERACT_LANGUAGES: Language[] = [
	{ code: "eng", name: "English", flag: "🇺🇸" },
	{ code: "fra", name: "French ", flag: "🇫🇷" },
	{ code: "ita", name: "Italian", flag: "🇮🇹" },
	{ code: "deu", name: "German", flag: "🇩🇪" },
	{ code: "spa", name: "Spanish", flag: "🇪🇸" },
	{ code: "por", name: "Portuguese", flag: "🇧🇷" },
	{ code: "chi_sim", name: "Chinese (Simplified)", flag: "🇨🇳" },
	{ code: "chi_tra", name: "Chinese (Traditional)", flag: "🇹🇼" },
	{ code: "jpn", name: "Japanese", flag: "🇯🇵" },
	{ code: "kor", name: "Korean", flag: "🇰🇷" },
	{ code: "rus", name: "Russian", flag: "🇷🇺" },
	{ code: "ara", name: "Arabic", flag: "🇸🇦" },
	{ code: "hin", name: "Hindi", flag: "🇮🇳" },
	{ code: "nld", name: "Dutch", flag: "🇳🇱" },
	{ code: "pol", name: "Polish", flag: "🇵🇱" },
	{ code: "tur", name: "Turkish", flag: "🇹🇷" },
	{ code: "ukr", name: "Ukrainian", flag: "🇺🇦" },
	{ code: "vie", name: "Vietnamese", flag: "🇻🇳" },
	{ code: "swe", name: "Swedish", flag: "🇸🇪" },
	{ code: "dan", name: "Danish", flag: "🇩🇰" },
	{ code: "fin", name: "Finnish", flag: "🇫🇮" },
	{ code: "nor", name: "Norwegian", flag: "🇳🇴" },
	{ code: "hun", name: "Hungarian", flag: "🇭🇺" },
	{ code: "ces", name: "Czech", flag: "🇨🇿" },
	{ code: "ron", name: "Romanian", flag: "🇷🇴" },
	{ code: "ell", name: "Greek", flag: "🇬🇷" },
	{ code: "heb", name: "Hebrew", flag: "🇵🇸" },
	{ code: "ind", name: "Indonesian", flag: "🇮🇩" },
	{ code: "msa", name: "Malay", flag: "🇲🇾" },
	{ code: "tha", name: "Thai", flag: "🇹🇭" },
];

export default function SelectLanguageCommand() {
	const [selectedLang, setSelectedLang] = useState<string>("eng");
	const [isLoading, setIsLoading] = useState<boolean>(true);

	useEffect(() => {
		async function loadSavedLanguage() {
			try {
				const saved = await LocalStorage.getItem<string>(STORAGE_KEY_LANG);
				if (saved) {
					setSelectedLang(saved);
				}
			} catch (error) {
				let errorMessage = String(error);
				if (error instanceof Error) {
					errorMessage = error.message;
				}
				await showHUD(`Failed to load language: ${errorMessage}`);
			} finally {
				setIsLoading(false);
			}
		}
		loadSavedLanguage();
	}, []);

	async function handleSelectLanguage(code: string, name: string) {
		try {
			await LocalStorage.setItem(STORAGE_KEY_LANG, code);
			setSelectedLang(code);
			await showHUD(`OCR language set to ${name}`);
		} catch (error) {
			let errorMessage = String(error);
			if (error instanceof Error) {
				errorMessage = error.message;
			}
			await showHUD(`Failed to save language: ${errorMessage}`);
		}
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search...">
			<List.Section title="Supported Languages">
				{TESSERACT_LANGUAGES.map((lang) => {
					const isSelected = lang.code === selectedLang;
					let accessories: { icon: Icon }[] = [];
					if (isSelected) {
						accessories = [{ icon: Icon.Checkmark }];
					}

					return (
						<List.Item
							key={lang.code}
							icon={lang.flag}
							title={lang.name}
							accessories={accessories}
							actions={
								<ActionPanel>
									<Action
										title="Select Language"
										onAction={() => handleSelectLanguage(lang.code, lang.name)}
									/>
								</ActionPanel>
							}
						/>
					);
				})}
			</List.Section>
		</List>
	);
}