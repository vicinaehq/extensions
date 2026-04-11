import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { VisionView } from "./views/vision";
import { ClipboardHistoryImage, loadClipboardHistoryImages } from "./utils/load";
import { toUnit } from "./utils";
import { DEFAULT_MODEL, useModel } from "./hooks/useModel";
import { isVisionModel } from "./utils/modelInfo";
import { useCachedModelSelection } from "./hooks/useCachedModelSelection";
import { ModelDropdown } from "./views/model-dropdown";

export default function Command() {
  const { push } = useNavigation();
  const models = useModel();
  const [searchText, setSearchText] = useState("");
  const [images, setImages] = useState<ClipboardHistoryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const visionModels = models.option.filter(isVisionModel);

  const [selectedModel, setSelectedModel] = useCachedModelSelection(
    "selected_vision_model",
    DEFAULT_MODEL.option,
    models.isLoading,
  );

  useEffect(() => {
    (async () => {
      try {
        const historyImages = await loadClipboardHistoryImages();
        setImages(historyImages);
      } catch {
        // Failed to load clipboard history
      }
      setIsLoading(false);
    })();
  }, []);

  return (
    <List
      isShowingDetail={images.length > 0}
      searchBarPlaceholder="What is it?"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading || models.isLoading}
      throttle={false}
      searchBarAccessory={<ModelDropdown options={visionModels} value={selectedModel} onChange={setSelectedModel} />}
    >
      {images.length > 0
        ? images.map((image, index) => (
            <List.Item
              key={image.id}
              id={image.id}
              title={`Image #${index + 1}`}
              icon={Icon.Image}
              accessories={[{ tag: image.type.type.toUpperCase() }]}
              detail={
                <List.Item.Detail
                  markdown={`![Clipboard Image](${image.previewPath})`}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="MIME" text={image.mime} />
                      <List.Item.Detail.Metadata.Label title="File Size" text={toUnit(image.data.length)} />
                      <List.Item.Detail.Metadata.Label
                        title="Pixel Size"
                        text={
                          image.type.width && image.type.height
                            ? `${image.type.width} x ${image.type.height}`
                            : "Unknown"
                        }
                      />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Ask"
                    icon={Icon.ArrowRight}
                    onAction={() => {
                      const query = searchText.trim() || "Describe this image:";
                      push(
                        <VisionView
                          user_prompt={query}
                          toast_title="thinking..."
                          load="clipboard"
                          imageData={{ data: image.data, type: image.type }}
                          model_override={selectedModel}
                        />,
                      );
                    }}
                  />
                </ActionPanel>
              }
            />
          ))
        : !isLoading && (
            <List.EmptyView
              title="No Images Found"
              description="Copy an image to your clipboard and try again"
              icon={Icon.EyeDisabled}
            />
          )}
    </List>
  );
}
