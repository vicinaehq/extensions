import {
    Action,
    ActionPanel,
    Application,
    Cache,
    Clipboard,
    closeMainWindow,
    Color,
    getFrontmostApplication,
    getPreferenceValues,
    getSelectedText,
    Icon,
    LaunchProps,
    List,
    popToRoot,
    showHUD,
    showToast,
    Toast,
  } from "@vicinae/api";
  import { useEffect, useState } from "react";
  import { CaseType, aliases, convert, functions, modifyCasesWrapper } from "./cases.js";
  
  class NoTextError extends Error {
    constructor() {
      super("No text");
      Object.setPrototypeOf(this, NoTextError.prototype);
    }
  }
  
  async function getSelection() {
    try {
      return await getSelectedText();
    } catch (error) {
      return "";
    }
  }
  
  async function readContent(preferredSource: string) {
    if (preferredSource === "clipboard") {
      const clipboard = await Clipboard.readText();
      if (clipboard) return clipboard;
      
      const selected = await getSelection();
      if (selected) return selected;
    } else {
      const selected = await getSelection();
      if (selected) return selected;
      
      const clipboard = await Clipboard.readText();
      if (clipboard) return clipboard;
    }
  
    throw new NoTextError();
  }
  
  const cache = new Cache();
  
  const getPinnedCases = (): CaseType[] => {
    const pinned = cache.get("pinned");
    return pinned ? JSON.parse(pinned) : [];
  };
  
  const getRecentCases = (): CaseType[] => {
    const recent = cache.get("recent");
    return recent ? JSON.parse(recent) : [];
  };
  
  const setPinnedCases = (pinned: CaseType[]) => {
    cache.set("pinned", JSON.stringify(pinned));
  };
  
  const setRecentCases = (recent: CaseType[]) => {
    cache.set("recent", JSON.stringify(recent));
  };
  
  export default function Command(props: LaunchProps) {
    const preferences = getPreferenceValues();
    const preferredSource = preferences.source;
    const preferredAction = preferences.action;
    const hideHUD = preferences.hideHUD;
  
    const immediatelyConvertToCase = props.launchContext?.case;
    if (immediatelyConvertToCase) {
      (async () => {
        const content = await readContent(preferredSource);
        const modified = convert(content, immediatelyConvertToCase);
  
        if (preferredAction === "paste") {
          Clipboard.paste(modified);
        } else {
          Clipboard.copy(modified);
        }
  
        if (!hideHUD) {
          showHUD(`Converted to ${immediatelyConvertToCase}`);
        }
        popToRoot();
      })();
      return;
    }
  
    const [content, setContent] = useState<string>("");
    const [frontmostApp, setFrontmostApp] = useState<Application>();
  
    const [pinned, setPinned] = useState<CaseType[]>([]);
    const [recent, setRecent] = useState<CaseType[]>([]);
  
    useEffect(() => {
      setPinned(getPinnedCases());
      setRecent(getRecentCases());
      getFrontmostApplication()
        .then(setFrontmostApp)
        .catch(() => {
          showToast({
            style: Toast.Style.Failure,
            title: "Window management unavailable",
            message: "You can still use all case conversions. Copy to clipboard works perfectly.",
          });
        });
    }, []);
  
    useEffect(() => {
      setPinnedCases(pinned);
    }, [pinned]);
  
    useEffect(() => {
      setRecentCases(recent);
    }, [recent]);
  
    const refreshContent = async () => {
      try {
        setContent(await readContent(preferredSource));
      } catch (error) {
        if (error instanceof NoTextError) {
          showToast({
            style: Toast.Style.Failure,
            title: "Nothing to convert",
            message: "Please ensure that text is either selected or copied",
          });
        }
      }
    };
  
    useEffect(() => {
      refreshContent();
    }, []);

    const handleCopyToClipboard = async (modified: string, caseType: CaseType) => {
      await Clipboard.copy(modified);
      setRecent([caseType, ...recent.filter((c) => c !== caseType)].slice(0, 4 + pinned.length));
      if (!hideHUD) {
        showHUD("Copied to Clipboard");
      }
      if (preferences.popToRoot) {
        popToRoot();
      } else {
        closeMainWindow();
      }
    };

    const handlePasteToActiveApp = async (modified: string, caseType: CaseType) => {
      if (!frontmostApp) return;

      await Clipboard.paste(modified);
      setRecent([caseType, ...recent.filter((c) => c !== caseType)].slice(0, 4 + pinned.length));
      if (!hideHUD) {
        showHUD(`Pasted in ${frontmostApp.name}`);
      }
      if (preferences.popToRoot) {
        popToRoot();
      } else {
        closeMainWindow();
      }
    };
  
    const CaseItem = (props: {
      case: CaseType;
      modified: string;
      detail: string;
      pinned?: boolean;
      recent?: boolean;
    }) => {
      return (
        <List.Item
          id={props.case}
          title={props.case}
          subtitle={props.modified}
          detail={<List.Item.Detail markdown={props.detail} />}
          keywords={aliases[props.case]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                {preferredAction === "paste" ? (
                  <>
                    {frontmostApp && (
                      <Action
                        title={`Paste in ${frontmostApp.name}`}
                        icon={Icon.TextInput}
                        onAction={async () => {
                          await handlePasteToActiveApp(props.modified, props.case);
                        }}
                      />
                    )}
                    <Action
                      title="Copy to Clipboard"
                      icon={Icon.Clipboard}
                      onAction={async () => {
                        await handleCopyToClipboard(props.modified, props.case);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Action
                      title="Copy to Clipboard"
                      icon={Icon.Clipboard}
                      onAction={async () => {
                        await handleCopyToClipboard(props.modified, props.case);
                      }}
                    />
                    {frontmostApp && (
                      <Action
                        title={`Paste in ${frontmostApp.name}`}
                        icon={Icon.TextInput}
                        onAction={async () => {
                          await handlePasteToActiveApp(props.modified, props.case);
                        }}
                      />
                    )}
                  </>
                )}
              </ActionPanel.Section>
              <ActionPanel.Section>
                {!props.pinned ? (
                  <Action
                    title="Pin Case"
                    icon={Icon.Pin}
                    onAction={() => {
                      setPinned([props.case, ...pinned]);
                      if (props.recent) {
                        setRecent(recent.filter((c) => c !== props.case));
                      }
                    }}
                  />
                ) : (
                  <>
                    <Action
                      title="Remove Pinned Case"
                      icon={Icon.PinDisabled}
                      onAction={() => {
                        setPinned(pinned.filter((c) => c !== props.case));
                      }}
                    />
                    <Action
                      title="Clear Pinned Cases"
                      style={Action.Style.Destructive}
                      icon={{ source: Icon.XMarkCircle }}
                      onAction={() => {
                        setPinned([]);
                      }}
                    />
                  </>
                )}
                {props.recent && (
                  <>
                    <Action
                      title="Remove Recent Case"
                      icon={Icon.XMarkCircle}
                      onAction={() => {
                        setRecent(recent.filter((c) => c !== props.case));
                      }}
                    />
                    <Action
                      title="Clear Recent Cases"
                      icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
                      onAction={() => {
                        setRecent([]);
                      }}
                    />
                  </>
                )}
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Refresh Content"
                  icon={Icon.RotateAntiClockwise}
                  onAction={refreshContent}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      );
    };
  
    return (
      <List isShowingDetail={true} isLoading={!pinned || !recent} >
        <List.Section title="Pinned">
          {pinned?.map((key) => {
            const modified = modifyCasesWrapper(content, key);
            return (
              <CaseItem
                key={key}
                case={key as CaseType}
                modified={modified.rawText}
                detail={modified.markdown}
                pinned={true}
              />
            );
          })}
        </List.Section>
        <List.Section title="Recent">
          {recent
            .filter((key) => !pinned.includes(key))
            .map((key) => {
              const modified = modifyCasesWrapper(content, key);
              return (
                <CaseItem
                  key={key}
                  case={key as CaseType}
                  modified={modified.rawText}
                  detail={modified.markdown}
                  recent={true}
                />
              );
            })}
        </List.Section>
        <List.Section title="All Cases">
        {Object.keys(functions)
          .filter(
            (key) =>
              // @ts-ignore
              preferences[key.replace(/ +/g, "") as keyof ExtensionPreferences] &&
              !recent.includes(key as CaseType) &&
              !pinned.includes(key as CaseType),
          )
          .map((key) => {
            const modified = modifyCasesWrapper(content, key);
            return <CaseItem key={key} case={key as CaseType} modified={modified.rawText} detail={modified.markdown} />;
          })}
        </List.Section>
      </List>
    );
  }
  