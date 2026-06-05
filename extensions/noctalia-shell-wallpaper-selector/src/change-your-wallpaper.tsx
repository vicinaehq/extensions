import {
    Action,
    ActionPanel,
    Color,
    getPreferenceValues,
    Icon,
    Image,
    List,
    showToast,
    Toast,
} from "@vicinae/api";
import fs from 'fs';
import {exec} from 'child_process'

type Wallpaper = {
    image: Image;
    filename: string;
    path: string;
    type: string;
};

interface Preference {
    wallpaper_directory: string,
    display_name: string
}

// Preferences (Set in extension config)
export const preferences = getPreferenceValues<Preference>();
export const path: string = preferences.wallpaper_directory;
export const display: string = preferences.display_name;

export const wallpapers_info: Wallpaper[] = [];

function traverseDirectory(directoryPath: string) {
    try {
        const files = fs.readdirSync(directoryPath);

        files.forEach((file) => {
            let filePath: string;

            if (directoryPath.endsWith("/")) {
                filePath = directoryPath + file;
            } else {
                filePath = directoryPath + '/' + file;
            }
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                traverseDirectory(filePath); // recursively call the function for subdirectories
            } else {
                const preview: Image = {source: filePath, fallback: "https://placehold.co/600x400?text=Wallpaper"}
                const type: string = getImageType(file);
                const wallpaper: Wallpaper = {
                    image: preview,
                    filename: file,
                    path: filePath,
                    type: type,
                };
                wallpapers_info.push(wallpaper)
            }
        });
    } catch (error) {
        console.error(`Error reading directory ${directoryPath}:`, error);
    }
}

function getImageType(filename: string) {
    for (let i: number = filename.length; i > 0; i--) {
        if (filename.charAt(i) == ".") {
            const result = filename.slice((i + 1), filename.length)
            return result.toUpperCase()
        }
    }
    return filename
}

traverseDirectory(path);

export default function ListDetail() {
    if (wallpapers_info.length == 0) {
        return (
            <List>
                <List.EmptyView
                    title="No wallpapers were found"
                    description="No wallpapers found in the specified directory. Make sure you have set the correct directory in the extension preferences. Tip: It has to be an absolute path."
                    icon={Icon.MagnifyingGlass}
                />
            </List>
        );
    }
    return (
        <List isShowingDetail searchBarPlaceholder={"Select Your Wallpaper..."}>
            <List.Section title={"Wallpapers"}>
                {wallpapers_info.map((wallpaper) => (
                    <List.Item
                        key={wallpaper.path}
                        title={wallpaper.filename}
                        icon={wallpaper.image}
                        detail={
                            <List.Item.Detail
                                markdown={`![${wallpaper.filename}](${wallpaper.path})`}
                                metadata={
                                    <List.Item.Detail.Metadata>
                                        <List.Item.Detail.Metadata.Label
                                            title="Path"
                                            text={wallpaper.path}
                                            icon={Icon.Folder}
                                        />
                                        <List.Item.Detail.Metadata.TagList title="Type">
                                            <List.Item.Detail.Metadata.TagList.Item
                                                color={Color.PrimaryText}
                                                text={wallpaper.type}
                                                icon={Icon.Image}
                                            />
                                        </List.Item.Detail.Metadata.TagList>
                                    </List.Item.Detail.Metadata>
                                }
                            />
                        }
                        actions={
                            <ActionPanel>
                                <Action
                                    title="Set wallpaper"
                                    onAction={async () => {
                                        await showToast({
                                            style: Toast.Style.Animated,
                                            title: "Setting wallpaper...",
                                        });
                                        exec(`noctalia-shell ipc call wallpaper set "${wallpaper.path}" "${display}"`, async (error) => {
                                            if (error) {
                                                await showToast({
                                                    style: Toast.Style.Failure,
                                                    title: "Failed to set wallpaper",
                                                    message: error.message,
                                                });
                                            } else {
                                                await showToast({
                                                    style: Toast.Style.Success,
                                                    title: "Wallpaper set",
                                                    message: "If nothing happens, double check your display name in the extension preferences.",
                                                });
                                            }
                                        });
                                    }}
                                    icon={Icon.Image}
                                />
                                <Action.Open
                                    title="View wallpaper"
                                    target={wallpaper.path}
                                    icon={Icon.Eye}
                                />
                                <Action.ShowInFinder
                                    title="Open in file explorer"
                                    path={wallpaper.path}
                                    icon={Icon.Folder}
                                />
                                <Action.CopyToClipboard
                                    title="Copy wallpaper path"
                                    content={wallpaper.path}
                                    icon={Icon.Folder}
                                />
                            </ActionPanel>
                        }
                    />
                ))}
            </List.Section>
        </List>
    );
}