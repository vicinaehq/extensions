import { Icon, List } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { Database } from "sql.js";

import {
  createCommonActions,
  getFirefoxProfiles,
  initDatabase,
  Profile,
  showErrorToast,
} from "./utils";

const folderNames = {
  menu: "Bookmark Menu",
  mobile: "Mobile Bookmarks",
  tags: "Tags",
  toolbar: "Toolbar",
  unfiled: "Other Bookmarks",
};

function getFirefoxFolders(db: Database) {
  const folders = [];
  const statement = db.prepare(
    `SELECT moz_bookmarks.id AS id, moz_bookmarks.parent AS parentId, moz_bookmarks.title AS title, moz_bookmarks.guid AS guid FROM moz_bookmarks WHERE moz_bookmarks.type = 2 AND moz_bookmarks.title IS NOT NULL AND moz_bookmarks.title <> '' AND moz_bookmarks.fk IS NULL;`,
  );
  while (statement.step()) {
    const row = statement.getAsObject();
    folders.push(row);
  }
  statement.free();
  return folders;
}

function getFirefoxBookmarks(db: Database) {
  const bookmarks = [];
  const statement = db.prepare(
    `SELECT substr(moz_places.url, 1, CASE WHEN instr(moz_places.url, '?') > 0 AND instr(moz_places.url, '#') > 0 THEN min(instr(moz_places.url, '?'), instr(moz_places.url, '#')) - 1 WHEN instr(moz_places.url, '?') > 0 THEN instr(moz_places.url, '?') - 1 WHEN instr(moz_places.url, '#') > 0 THEN instr(moz_places.url, '#') - 1 ELSE length(moz_places.url) END) AS normalizedUrl, moz_places.url AS urlString, moz_bookmarks.title AS title, MAX(moz_bookmarks.dateAdded) AS dateAdded, GROUP_CONCAT(moz_bookmarks.parent) AS parentIds FROM moz_bookmarks LEFT JOIN moz_places ON moz_bookmarks.fk = moz_places.id WHERE moz_bookmarks.type = 1 AND moz_bookmarks.title IS NOT NULL AND moz_places.url IS NOT NULL GROUP BY normalizedUrl;`,
  );
  while (statement.step()) {
    const row = statement.getAsObject();
    bookmarks.push(row);
  }
  statement.free();
  return bookmarks;
}

type Bookmark = {
  id: string;
  title: string;
  url: string;
  folder: string;
  domain: string;
  dateAdded: number;
};
type Folder = { id: string; icon: string; title: string };

export default function Command() {
  const [, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState("");

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const { profiles, defaultProfile } = await getFirefoxProfiles();
        if (profiles.length === 0) {
          await showErrorToast(
            "No Firefox profiles found",
            "No Firefox profiles detected on this system.",
          );
        }
        setProfiles(profiles);
        setCurrentProfile(defaultProfile);
      } catch (error) {
        await showErrorToast("Error loading profiles", String(error));
        setProfiles([]);
        setCurrentProfile("");
      }
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!currentProfile) return;
    (async () => {
      setIsLoading(true);
      try {
        console.log("[DEBUG] Loading profile:", currentProfile);

        const db = await initDatabase(currentProfile);

        const rawFolders = getFirefoxFolders(db);

        const rawBookmarks = getFirefoxBookmarks(db);

        const folders = rawFolders.map((folder) => {
          const hierarchy = [
            folder.parentId === 1 &&
            typeof folder.title === "string" &&
            Object.hasOwn(folderNames, folder.title)
              ? folderNames[folder.title as keyof typeof folderNames]
              : typeof folder.title === "string"
              ? folder.title
              : "",
          ];
          let parentId = folder.parentId;
          while (parentId !== 1) {
            const parent = rawFolders.find((f) => f.id === parentId);
            if (parent) {
              hierarchy.push(
                parent.parentId === 1 &&
                  typeof parent.title === "string" &&
                  Object.hasOwn(folderNames, parent.title)
                  ? folderNames[parent.title as keyof typeof folderNames]
                  : typeof parent.title === "string"
                    ? parent.title
                    : "",
              );
              parentId = parent.parentId;
            } else {
              break;
            }
          }
          return {
            ...folder,
            id: `${folder.id}`,
            title: hierarchy.reverse().join("/"),
            icon: "firefox.png",
          };
        });
        setFolders(folders);

        const bookmarks = rawBookmarks.map((bookmark) => {
          let domain = "";
          const url = typeof bookmark.urlString === "string" ? bookmark.urlString : "";
          try {
            if (url) {
              domain = new URL(url).hostname;
            }
          } catch {
            // Ignore invalid URLs
          }

          // Handle multiple parent IDs (comma-separated)
          const parentIds = typeof bookmark.parentIds === "string" 
            ? bookmark.parentIds.split(",") 
            : [];
          
          // Find folders for this bookmark (may be in multiple folders)
          const bookmarkFolders = parentIds
            .map(parentId => folders.find(folder => folder.id === parentId))
            .filter(Boolean);
          
          const folderNames = bookmarkFolders
            .map(folder => folder.title)
            .join(", ");

          return {
            id: url, // Use URL as unique ID since we're grouping by URL
            title: typeof bookmark.title === "string" ? bookmark.title : "",
            url,
            folder: folderNames,
            domain,
            dateAdded: typeof bookmark.dateAdded === "number" ? bookmark.dateAdded : 0,
          };
        });
        // Sort by dateAdded descending (most recent first)
        bookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
        setBookmarks(bookmarks);
      } catch (error) {
        await showErrorToast("Error loading bookmarks", String(error));
        setFolders([]);
        setBookmarks([]);
      }
      setIsLoading(false);
    })();
  }, [currentProfile]);

  const folderBookmarks = useMemo(() => {
    return bookmarks.filter((item) => {
      if (selectedFolderId === "") return true;
      const folder = folders.find((folder) => folder.id === selectedFolderId);
      if (!folder) return true;
      return item.folder.includes(folder.title);
    });
  }, [bookmarks, selectedFolderId, folders]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Firefox bookmarks"
      searchBarAccessory={
        <List.Dropdown tooltip="Folder" onChange={setSelectedFolderId}>
          <List.Dropdown.Item icon={Icon.Globe} title="All" value="" />
          {folders.map((folder) => (
            <List.Dropdown.Item
              key={folder.id}
              icon={folder.icon}
              title={folder.title}
              value={folder.id}
            />
          ))}
        </List.Dropdown>
      }
    >
      {folderBookmarks.map((item) => (
        <List.Item
          key={item.id}
          icon={Icon.Bookmark}
          title={item.title}
          subtitle={item.url}
          accessories={
            item.folder ? [{ icon: Icon.Folder, tag: item.folder }] : []
          }
          actions={createCommonActions(item.url)}
        />
      ))}
      <List.EmptyView
        title="No Firefox bookmarks found"
        description="No bookmarks available in Firefox."
        icon={Icon.Bookmark}
      />
    </List>
  );
}