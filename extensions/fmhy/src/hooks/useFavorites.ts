import { useState, useEffect, useCallback } from "react";
import { LocalStorage, Toast, showToast } from "@raycast/api";

const FAVORITES_KEY = "fmhy_favorites";

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFavorites() {
      try {
        const item = await LocalStorage.getItem<string>(FAVORITES_KEY);
        if (item) {
          setFavorites(JSON.parse(item));
        }
      } catch (error) {
        console.error("Failed to load favorites:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadFavorites();
  }, []);

  const toggleFavorite = useCallback(async (linkId: string, title?: string) => {
    try {
      setFavorites((prev) => {
        const isFav = prev.includes(linkId);
        const newFavorites = isFav ? prev.filter((id) => id !== linkId) : [...prev, linkId];

        LocalStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));

        if (!isFav && title) {
          showToast({ style: Toast.Style.Success, title: "Added to favorites", message: title });
        } else if (isFav && title) {
          showToast({ style: Toast.Style.Success, title: "Removed from favorites", message: title });
        }

        return newFavorites;
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to update favorites",
        message: String(error),
      });
    }
  }, []);

  const isFavorite = useCallback(
    (linkId: string) => {
      return favorites.includes(linkId);
    },
    [favorites],
  );

  return { favorites, toggleFavorite, isFavorite, isLoading };
}
