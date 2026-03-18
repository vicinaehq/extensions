import { List, ActionPanel, Action, Icon, showToast, Toast } from "@vicinae/api";
import { useState, useEffect, useRef } from "react";
import { spawn } from "child_process";
import fs from "fs";
import { createWriteStream, createReadStream } from "fs";
import { promisify } from "util";
import { exec } from "child_process";
import readline from "readline";
import path from "path";

const execAsync = promisify(exec);

type Result = { 
  path: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const INDEX_FILE = "/tmp/fd_vicinae_index.txt";
const INDEX_INTERVAL = 10 * 60 * 1000;
const MAX_RESULTS = 100;



const SEARCH_DIRS = [
  "/home",
  "/usr/local",
  "/opt",
  "/tmp",
];

function getFileIcon(filePath: string, isDirectory: boolean): Icon {
  if (isDirectory) {
    return Icon.Folder;
  }

  const ext = path.extname(filePath).toLowerCase();

  if ([".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".rb", ".php"].includes(ext)) {
    return Icon.Code;
  }

  if ([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp", ".ico"].includes(ext)) {
    return Icon.Image;
  }

  if ([".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"].includes(ext)) {
    return Icon.Document;
  }

  if ([".xls", ".xlsx", ".csv"].includes(ext)) {
    return Icon.Spreadsheet;
  }

  if ([".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"].includes(ext)) {
    return Icon.Video;
  }

  if ([".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"].includes(ext)) {
    return Icon.Music;
  }

  if ([".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"].includes(ext)) {
    return Icon.Box;
  }

  if ([".exe", ".sh", ".bat", ".app", ".bin"].includes(ext) || !ext) {
    return Icon.Terminal;
  }

  return Icon.Document;
}

function fuzzyMatch(pattern: string, text: string): { matches: boolean; score: number } {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  if (textLower.includes(patternLower)) {
    return { matches: true, score: 100 };
  }
  
  let patternIdx = 0;
  let score = 0;
  let consecutiveMatches = 0;
  
  for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      score += 1 + consecutiveMatches;
      consecutiveMatches++;
      patternIdx++;
    } else {
      consecutiveMatches = 0;
    }
  }

  if (patternIdx === patternLower.length) {
    return { matches: true, score };
  }
  
  return { matches: false, score: 0 };
}

async function openTerminal(dirPath: string) {
  try {

    const userShell = process.env.SHELL || "bash";

    const terminals = [
      "kitty",
      "konsole",
      "gnome-terminal",
      "xfce4-terminal",
      "alacritty",
      "xterm",
    ];

    let opened = false;

    for (const term of terminals) {
      try {

        await execAsync(`command -v ${term}`);

        await execAsync(
          `${term} -e ${userShell} -c "cd '${dirPath}'; clear; exec ${userShell}"`
        );
        opened = true;
        break;
      } catch {

        continue;
      }
    }

    if (!opened) {
      throw new Error(
        "No compatible terminal found. Install kitty, konsole, gnome-terminal, alacritty, or xterm."
      );
    }

    showToast({
      style: Toast.Style.Success,
      title: "Terminal opened",
    });
  } catch (e) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to open terminal",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export default function Command() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const lastIndexTime = useRef<number>(0);
  const currentSearchAbort = useRef<AbortController | null>(null);
  const indexingProcess = useRef<any>(null);
  const hasInitialized = useRef(false);

  async function getFdCommand(): Promise<string | null> {

    try {
      await execAsync("which fd");
      return "fd";
    } catch {

      try {
        await execAsync("which fdfind");
        return "fdfind";
      } catch {
        showToast({
          style: Toast.Style.Failure,
          title: "fd not found",
          message: "Install fd-find: sudo apt install fd-find",
        });
        return null;
      }
    }
  }

  async function buildIndex(silent = false) {
    if (indexingProcess.current) {
      return;
    }

    const fdCmd = await getFdCommand();
    if (!fdCmd) return;

    try {
      const testResult = await execAsync(`${fdCmd} --version`);
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "fd command failed",
        message: "fd is installed but cannot execute",
      });
      return;
    }

    try {
      setIndexing(true);
      if (!silent) {
        showToast({
          style: Toast.Style.Animated,
          title: "Indexing filesystem...",
          message: "This may take a minute",
        });
      }
      const tempFile = INDEX_FILE + ".tmp";
      const writeStream = createWriteStream(tempFile);


      const args = ["--follow", "--type", "f", "--type", "d", ".", ...SEARCH_DIRS];
    
      indexingProcess.current = spawn(fdCmd, args);

      let entryCount = 0;
      let stderrOutput = "";

      indexingProcess.current.stdout.pipe(writeStream);

      indexingProcess.current.stdout.on("data", (chunk) => {
        entryCount += chunk.toString().split("\n").length - 1;
      });

      indexingProcess.current.stderr.on("data", (data) => {
        stderrOutput += data.toString();
      });

      indexingProcess.current.on("close", (code) => {
        indexingProcess.current = null;

        if (code !== 0 && code !== null) {
          if (!silent) {
            showToast({
              style: Toast.Style.Failure,
              title: "Indexing failed",
              message: `fd exited with code ${code}`,
            });
          }
          setIndexing(false);

          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e) {
          }
          return;
        }

        try {
          if (fs.existsSync(tempFile)) {
            fs.renameSync(tempFile, INDEX_FILE);
            lastIndexTime.current = Date.now();
            
            if (!silent) {
              showToast({
                style: Toast.Style.Success,
                title: "Indexing complete",
                message: `Indexed ${entryCount} files and directories`,
              });
            }

            if (query) {
              runSearch(query);
            }
          } else {
          }
        } catch (e) {
        }

        setIndexing(false);
      });

      indexingProcess.current.on("error", (err) => {
        indexingProcess.current = null;
        setIndexing(false);
        
        if (!silent) {
          showToast({
            style: Toast.Style.Failure,
            title: "Indexing error",
            message: err.message,
          });
        }
      });

      writeStream.on("error", (err) => {
        setIndexing(false);
        if (indexingProcess.current) {
          indexingProcess.current.kill();
          indexingProcess.current = null;
        }
      });

    } catch (e) {
      indexingProcess.current = null;
      setIndexing(false);
      if (!silent) {
        showToast({
          style: Toast.Style.Failure,
          title: "Indexing error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  async function runSearch(q: string) {

    if (currentSearchAbort.current) {
      currentSearchAbort.current.abort();
    }
    currentSearchAbort.current = new AbortController();
    const abortSignal = currentSearchAbort.current.signal;

    try {
      setLoading(true);

      if (!fs.existsSync(INDEX_FILE)) {
        setResults([]);
        setLoading(false);
        showToast({
          style: Toast.Style.Failure,
          title: "No index available",
          message: "Please wait for indexing to complete",
        });
        return;
      }

      let searchQuery = q.trim();
      const excludeTerms: string[] = [];
      let pathScope: string | null = null;
      let extensionFilter: string | null = null;

      const excludeMatches = searchQuery.match(/-(\w+)/g);
      if (excludeMatches) {
        excludeMatches.forEach(match => {
          excludeTerms.push(match.substring(1).toLowerCase());
          searchQuery = searchQuery.replace(match, "").trim();
        });
      }

      if (searchQuery.startsWith("/")) {
        const parts = searchQuery.split(" ");
        if (parts[0].startsWith("/")) {
          pathScope = parts[0];
          searchQuery = parts.slice(1).join(" ").trim();
        }
      }

      const queryLower = searchQuery.toLowerCase();
      const commonExtensions = ["png", "jpg", "jpeg", "gif", "svg", "pdf", "doc", "docx", "txt", "md", 
                                "js", "ts", "py", "java", "cpp", "c", "go", "rs", "mp4", "avi", "mov",
                                "mp3", "wav", "zip", "tar", "gz", "xlsx", "csv", "html", "css", "json"];
      
      if (commonExtensions.includes(queryLower) && !searchQuery.includes(" ")) {
        extensionFilter = queryLower;
      }

      let searchPattern: RegExp | null = null;
      let useFuzzy = true;

      if (searchQuery.includes("*") || searchQuery.includes("?")) {
        useFuzzy = false;
        try {
          const escapedQuery = searchQuery
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".");
          searchPattern = new RegExp(escapedQuery, "i");
        } catch {
          searchPattern = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        }
      }

      const filterExtensions: { [key: string]: string[] } = {
        images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"],
        documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"],
        code: [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".rb", ".php", ".html", ".css"],
        videos: [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"],
        audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
        archives: [".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"],
      };

      type ScoredResult = { path: string; score: number; isDirectory: boolean; size: number; extension: string };
      const matchedLines: ScoredResult[] = [];
      const fileStream = createReadStream(INDEX_FILE, { encoding: "utf-8" });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {

        if (abortSignal.aborted) {
          rl.close();
          fileStream.destroy();
          return;
        }

        if (!line.trim()) continue;

        if (pathScope && !line.startsWith(pathScope)) {
          continue;
        }

        const filename = path.basename(line);
        const ext = path.extname(line).toLowerCase();

        if (excludeTerms.some(term => line.toLowerCase().includes(term))) {
          continue;
        }

        if (filterType !== "all" && filterExtensions[filterType]) {
          if (!filterExtensions[filterType].includes(ext)) {
            continue;
          }
        }

        if (extensionFilter && ext !== `.${extensionFilter}`) {

          if (!filename.toLowerCase().includes(searchQuery.toLowerCase())) {
            continue;
          }
        }

        let matches = false;
        let score = 0;

        if (!searchQuery || extensionFilter) {
          matches = true;
          score = 50;
        } else if (useFuzzy) {

          const filenameResult = fuzzyMatch(searchQuery, filename);
          const pathResult = fuzzyMatch(searchQuery, line);
          
          if (filenameResult.matches || pathResult.matches) {
            matches = true;

            score = filenameResult.matches ? filenameResult.score + 50 : pathResult.score;
          }
        } else if (searchPattern) {

          if (searchPattern.test(line) || searchPattern.test(filename)) {
            matches = true;
            score = filename.match(searchPattern) ? 100 : 50;
          }
        }

        if (matches) {

          let isDirectory = false;
          let size = 0;
          
          try {
            const stats = fs.statSync(line);
            isDirectory = stats.isDirectory();
            size = stats.size;
          } catch {


            isDirectory = !ext;
          }

          matchedLines.push({ path: line, score, isDirectory, size, extension: ext });
        }
      }

      if (abortSignal.aborted) {
        return;
      }

      matchedLines.sort((a, b) => b.score - a.score);
      const topResults = matchedLines.slice(0, MAX_RESULTS);

      setResults(topResults.map((r) => ({ 
        path: r.path, 
        isDirectory: r.isDirectory,
        size: r.size,
        extension: r.extension
      })));
      setLoading(false);
    } catch (e) {
      if ((e as any).name === "AbortError" || currentSearchAbort.current?.signal.aborted) {

        return;
      }
      showToast({
        style: Toast.Style.Failure,
        title: "Search failed",
        message: e instanceof Error ? e.message : String(e),
      });
      setLoading(false);
    }
  }

  useEffect(() => {

    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    async function initialize() {

      if (fs.existsSync(INDEX_FILE)) {
        try {
          const stats = fs.statSync(INDEX_FILE);
          lastIndexTime.current = stats.mtimeMs;
        } catch (e) {
          lastIndexTime.current = 0;
        }
      } else {
        lastIndexTime.current = 0;
      }

      const needsRebuild = !fs.existsSync(INDEX_FILE) || 
                           Date.now() - lastIndexTime.current > INDEX_INTERVAL;

      if (needsRebuild) {

        const silent = fs.existsSync(INDEX_FILE);
        await buildIndex(silent);
      }
    }

    initialize();

    return () => {
      if (indexingProcess.current) {
        indexingProcess.current.kill();
        indexingProcess.current = null;
      }
      if (currentSearchAbort.current) {
        currentSearchAbort.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!query.trim() && filterType === "all") {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(query);
    }, 100);

    return () => clearTimeout(timer);
  }, [query, filterType]);

  return (
    <List
      isLoading={loading || indexing}
      searchBarPlaceholder="Search for files..."
      onSearchTextChange={setQuery}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by File Type"
          value={filterType}
          onChange={setFilterType}
        >
          <List.Dropdown.Item title="All Files" value="all" />
          <List.Dropdown.Item title="Images" value="images" />
          <List.Dropdown.Item title="Documents" value="documents" />
          <List.Dropdown.Item title="Code" value="code" />
          <List.Dropdown.Item title="Videos" value="videos" />
          <List.Dropdown.Item title="Audio" value="audio" />
          <List.Dropdown.Item title="Archives" value="archives" />
        </List.Dropdown>
      }
      throttle
    >
      {indexing && !results.length && !query && !fs.existsSync(INDEX_FILE) && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Indexing filesystem..."
          description="Building search index. This may take a minute on first launch."
        />
      )}
      
      {indexing && !results.length && !query && fs.existsSync(INDEX_FILE) && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Updating index in background..."
          description="You can search now. Results will refresh when update completes."
        />
      )}
      
      {!indexing && !loading && !results.length && query && (
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="No results found"
          description={`No files matching "${query}"`}
          actions={
            <ActionPanel>
              <Action
                title="Rebuild Index"
                icon={Icon.RotateClockwise}
                onAction={() => buildIndex(false)}
              />
            </ActionPanel>
          }
        />
      )}

      {!indexing && !loading && !results.length && !query && fs.existsSync(INDEX_FILE) && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search your filesystem"
          actions={
            <ActionPanel>
              <Action
                title="Rebuild Index Now"
                icon={Icon.RotateClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => buildIndex(false)}
              />
            </ActionPanel>
          }
        />
      )}

      {results.map((item) => {
        const filename = path.basename(item.path);
        const parentDir = path.dirname(item.path);
        const ext = item.extension || path.extname(item.path).toLowerCase();

        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"];
        const isImage = imageExts.includes(ext);
        const icon = isImage ? { source: item.path } : getFileIcon(item.path, item.isDirectory);

        const accessories = [];
        if (item.size !== undefined && !item.isDirectory) {
          accessories.push({ text: formatFileSize(item.size) });
        } else if (item.isDirectory) {
          accessories.push({ text: "Folder" });
        } else if (ext) {
          accessories.push({ text: ext.toUpperCase().replace(".", "") });
        }
        
        return (
          <List.Item
            key={item.path}
            title={filename}
            subtitle={parentDir}
            icon={icon}
            accessories={accessories}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="File Actions">
                  <Action.Open title="Open" target={item.path} />
                  <Action.Open 
                    title="Open Parent Folder" 
                    target={parentDir}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  />
                  {item.isDirectory && (
                    <Action
                      title="Open Terminal Here"
                      icon={Icon.Terminal}
                      shortcut={{ modifiers: ["cmd"], key: "t" }}
                      onAction={() => openTerminal(item.path)}
                    />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard 
                    title="Copy Full Path" 
                    content={item.path}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Name"
                    content={filename}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Parent Directory"
                    content={parentDir}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section title="Index Management">
                  <Action
                    title="Rebuild Index"
                    icon={Icon.RotateClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={() => buildIndex(false)}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}