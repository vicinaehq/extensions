import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
} from "@vicinae/api";
import {
  listImages,
  pullImage,
  removeImage,
  getImageInspect,
} from "./podman";
import { getImageIcon } from "./patterns";
import type { Image } from "./podman";
import { ConnectionSubmenu, connectionLabel, useConnection } from "./connection";

// Custom hook for managing images
function useImages(connection: string, ready: boolean) {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImages = useCallback(async (): Promise<Image[]> => {
    try {
      const images = await listImages(connection);

      // Add icons to images
      return images.map((image) => ({
        ...image,
        icon: getImageIcon(),
      }));
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch images",
      });
      console.error(error);
      return [];
    }
  }, [connection]);

  // Only the latest request may update state, so a slow response from a
  // previous connection can never be shown under (or acted on via) the new one.
  const requestId = useRef(0);

  const refreshImages = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const newImages = await fetchImages();
    if (id !== requestId.current) return;
    setImages(newImages);
    setLoading(false);
  }, [fetchImages]);

  useEffect(() => {
    if (!ready) return;
    setImages([]);
    refreshImages();
  }, [refreshImages, ready]);

  return { images, loading, refreshImages };
}

// Image detail component
function ImageDetail({ image }: { image: Image }) {
  const [inspect, setInspect] = useState<string>("");
  const [inspectLoading, setInspectLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchInspect = async () => {
      setInspectLoading(true);
      let result: string;
      try {
        result = await getImageInspect(image.connection, image.id);
      } catch {
        result = "Failed to load inspect data";
      }
      if (cancelled) return;
      setInspect(result);
      setInspectLoading(false);
    };

    fetchInspect();
    return () => {
      cancelled = true;
    };
  }, [image.connection, image.id]);

  const content = inspectLoading
    ? "Loading inspect data..."
    : inspect
    ? `\`\`\`json\n${inspect}\n\`\`\``
    : "";

  return (
    <List.Item.Detail
      markdown={content}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Image ID"
            text={image.id}
          />
          <List.Item.Detail.Metadata.Label
            title="Repository"
            text={image.repository}
          />
          <List.Item.Detail.Metadata.Label
            title="Tag"
            text={image.tag}
          />
          <List.Item.Detail.Metadata.Label
            title="Created"
            text={image.created}
          />
          <List.Item.Detail.Metadata.Label
            title="Size"
            text={image.size}
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

// Action handler factory functions
function createImageActionHandler(
  action: string,
  image: Image,
  refreshImages: () => Promise<void>
) {
  return async () => {
    try {
      switch (action) {
        case "remove":
          await removeImage(image.connection, image.id, true); // Always force remove
          break;
        default:
          console.error(`Unknown action: ${action}`);
          await showToast({
            style: Toast.Style.Failure,
            title: "Unknown Action",
            message: `Unknown action: ${action}`,
          });
          return;
      }
    } catch (error) {
      console.error(
        `Failed to perform ${action} on ${image.repository}:${image.tag}:`,
        error
      );
    } finally {
      // Always refresh to get the latest state
      await refreshImages();
    }
  };
}
function ImageListItem({
  image,
  showingDetail,
  refreshImages,
  toggleDetails,
  connectionMenu,
}: {
  image: Image;
  showingDetail: boolean;
  refreshImages: () => Promise<void>;
  toggleDetails: () => void;
  connectionMenu: ReactNode;
}) {
  return (
    <List.Item
      key={image.id}
      title={`${image.repository}:${image.tag}`}
      subtitle={image.id}
      icon={{ source: image.icon }}
      accessories={
        !showingDetail
          ? [
              {
                text: image.size,
              },
            ]
          : undefined
      }
      detail={
        showingDetail ? <ImageDetail image={image} /> : undefined
      }
      actions={
        <ActionPanel>
          <Action
            title={showingDetail ? "Hide Details" : "Show Details"}
            icon={showingDetail ? Icon.EyeDisabled : Icon.Eye}
            onAction={toggleDetails}
          />
          <Action
            title="Remove"
            icon={Icon.Trash}
            style="destructive"
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={createImageActionHandler(
              "remove",
              image,
              refreshImages
            )}
          />
          <ActionPanel.Section>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["ctrl"], key: "f" }}
              onAction={refreshImages}
            />
            {connectionMenu}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

// Main component
export default function Images() {
  const [showingDetail, setShowingDetail] = useState(false);
  const [searchText, setSearchText] = useState("");

  const { connections, connection, setConnection, ready } = useConnection();
  const { images, loading, refreshImages } = useImages(connection, ready);

  const connectionMenu = (
    <ConnectionSubmenu
      connections={connections}
      connection={connection}
      onSelect={setConnection}
    />
  );
  const navigationTitle = `Images — ${connectionLabel(connection)}`;

  const toggleDetails = useCallback(() => {
    setShowingDetail(!showingDetail);
  }, [showingDetail]);

  // Filter images based on search text
  const filteredImages = useMemo(() => {
    if (!searchText) return images;
    return images.filter((image) =>
      `${image.repository}:${image.tag}`.toLowerCase().includes(searchText.toLowerCase()) ||
      image.id.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [images, searchText]);

  if (images.length === 0 && !loading) {
    return (
      <List navigationTitle={navigationTitle}>
        <List.EmptyView
          icon={Icon.Image}
          title="No Images Found"
          description={`No Podman images available on ${connectionLabel(connection)}.`}
          actions={
            <ActionPanel>
              <Action
                title="Refresh Images"
                icon={Icon.ArrowClockwise}
                onAction={refreshImages}
              />
              {connectionMenu}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      navigationTitle={navigationTitle}
      searchBarPlaceholder="Search images..."
      isShowingDetail={showingDetail}
      onSearchTextChange={setSearchText}
    >
      {filteredImages.map((image) => (
        <ImageListItem
          key={image.id}
          image={image}
          showingDetail={showingDetail}
          refreshImages={refreshImages}
          toggleDetails={toggleDetails}
          connectionMenu={connectionMenu}
        />
      ))}
    </List>
  );
}