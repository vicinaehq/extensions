import { List, ActionPanel, Action, Icon, showToast, Toast, Form, useNavigation, Clipboard } from "@vicinae/api";
import { spawn } from "child_process";
import React from "react";

interface KeyValue {
  key: string;
  value: string;
}

async function getDatabases(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("skate", ["list-dbs"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        const databases = stdout.trim().split("\n").filter(Boolean);
        // Strip the @ prefix from database names for internal use
        const cleanDatabases = databases.map(db => db.startsWith('@') ? db.slice(1) : db);
        resolve(cleanDatabases);
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function getKeys(db: string): Promise<KeyValue[]> {
  return new Promise((resolve) => {
    const child = spawn("skate", ["list", `@${db}`], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        // Skate list command succeeded
        const lines = stdout.trim().split("\n").filter(Boolean);
        const keyValues = lines.map(line => {
          const parts = line.split("\t");
          return {
            key: parts[0] || "",
            value: parts.slice(1).join("\t")
          };
        });
        resolve(keyValues);
      } else {
        // Any error (including non-existent database) = empty database
        resolve([]);
      }
    });

    child.on("error", () => {
      // Command execution failed (e.g., skate not installed) = empty database
      resolve([]);
    });
  });
}

async function getValue(key: string, db: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("skate", ["get", `${key}@${db}`], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function setValue(key: string, value: string, db: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Setting value: key="${key}", value="${value}", db="${db}"`);
    const child = spawn("skate", ["set", `${key}@${db}`, value], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("stdout:", data.toString());
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
      console.log("stderr:", data.toString());
    });

    child.on("close", (code) => {
      console.log(`Command exited with code ${code}`);
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderr.trim() || stdout.trim() || `Command failed with code ${code}`;
        reject(new Error(`Skate set command failed: ${errorMsg}`));
      }
    });

    child.on("error", (error) => {
      console.error("Spawn error:", error);
      reject(new Error(`Failed to execute skate command: ${error.message}`));
    });
  });
}

async function deleteKey(key: string, db: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("skate", ["delete", `${key}@${db}`], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function deleteDatabase(db: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", `echo "y" | skate delete-db @${db}`], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

function SetValueForm({ db, initialKey = "", initialValue = "", onSuccess }: { db: string; initialKey?: string; initialValue?: string; onSuccess?: () => void }) {
  const { pop } = useNavigation();

  const handleSubmit = async (values: Form.Values) => {
    const key = (values.key as string)?.trim();
    const value = (values.value as string)?.trim();

    // Validate inputs
    if (!key) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid key",
        message: "Key cannot be empty",
      });
      return;
    }

    if (!value) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid value",
        message: "Value cannot be empty",
      });
      return;
    }

    try {
      await setValue(key, value, db);
      await showToast({
        style: Toast.Style.Success,
        title: "Value set successfully",
      });
      onSuccess?.();
      pop();
    } catch (error) {
      console.error("Set value error:", error);
      let errorMessage = "Unknown error occurred";
      
      if (error instanceof Error) {
        errorMessage = error.message || "Unknown error";
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object") {
        errorMessage = JSON.stringify(error);
      }

      // Truncate very long messages
      if (errorMessage.length > 100) {
        errorMessage = `${errorMessage.substring(0, 100)}...`;
      }

      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to set value",
        message: errorMessage,
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Set Value" onSubmit={handleSubmit} />
          <Action title="Cancel" onAction={pop} />
        </ActionPanel>
      }
    >
      <Form.TextField id="key" title="Key" defaultValue={initialKey} />
      <Form.TextArea id="value" title="Value" defaultValue={initialValue} />
    </Form>
  );
}

function CreateDatabaseForm({ onSuccess }: { onSuccess: (dbName: string) => void }) {
  const { pop } = useNavigation();

  const handleSubmit = async (values: Form.Values) => {
    const dbName = (values.name as string)?.trim();
    if (dbName) {
      await showToast({
        style: Toast.Style.Success,
        title: "Database ready",
        message: `You can now use "${dbName}" as a database name`,
      });
      onSuccess(dbName);
      pop();
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Database" onSubmit={handleSubmit} />
          <Action title="Cancel" onAction={pop} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Database Name" />
    </Form>
  );
}

export default function Skate() {
  const [databases, setDatabases] = React.useState<string[]>([]);
  const [selectedDb, setSelectedDb] = React.useState<string>("");
  const [keys, setKeys] = React.useState<KeyValue[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingKeys, setIsLoadingKeys] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const { push } = useNavigation();

  const loadDatabases = async () => {
    try {
      const dbs = await getDatabases();
      setDatabases(dbs);
      if (dbs.length > 0 && !selectedDb) {
        setSelectedDb(dbs[0]!);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load databases",
        message: errorMessage.includes("ENOENT") ? "Skate is not installed or not in PATH" : errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadKeys = async (db: string) => {
    if (!db) return;
    setIsLoadingKeys(true);
    try {
      const keyValues = await getKeys(db);
      setKeys(keyValues);
    } catch (error) {
      // This should never happen with the new getKeys implementation
      console.error("Unexpected error loading keys:", error);
      setKeys([]);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  React.useEffect(() => {
    loadDatabases();
  }, []);

  React.useEffect(() => {
    if (selectedDb) {
      loadKeys(selectedDb);
    }
  }, [selectedDb]);

  const handleDatabaseChange = (db: string) => {
    setSelectedDb(db);
  };

  const handleAddKey = () => {
    let keyName = searchText.trim();
    let targetDb = selectedDb;
    
    // Parse Skate expression: key@database
    if (keyName.includes('@')) {
      const parts = keyName.split('@');
      if (parts.length === 2) {
        keyName = parts[0].trim();
        const parsedDb = parts[1].trim();
        if (parsedDb) {
          targetDb = parsedDb;
        }
      }
    }
    
    push(<SetValueForm db={targetDb} initialKey={keyName} onSuccess={() => {
      // If creating in a new database, refresh the database list
      if (!databases.includes(targetDb)) {
        loadDatabases().then(() => {
          setSelectedDb(targetDb);
        });
      } else if (targetDb !== selectedDb) {
        setSelectedDb(targetDb);
      } else {
        loadKeys(selectedDb);
      }
    }} />);
  };

  const handleCreateDatabase = () => {
    push(<CreateDatabaseForm onSuccess={(dbName) => {
      loadDatabases().then(() => {
        // Switch to the newly created database
        setSelectedDb(dbName);
      });
    }} />);
  };

  const handleDeleteDatabase = async () => {
    if (!selectedDb) return;
    try {
      await deleteDatabase(selectedDb);
      await showToast({
        style: Toast.Style.Success,
        title: "Database deleted",
      });
      const newDbs = databases.filter(db => db !== selectedDb);
      setDatabases(newDbs);
      setSelectedDb(newDbs.length > 0 ? newDbs[0]! : "");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete database",
        message: errorMessage,
      });
    }
  };

  const handleSwitchDatabase = (db: string) => {
    setSelectedDb(db);
  };

  const databaseFilter = databases.length > 1 ? {
    value: selectedDb,
    placeholder: "Select database...",
    options: databases.map(db => ({ label: db, value: db })),
    onChange: handleSwitchDatabase,
  } : undefined;

  if (isLoading) {
    return <List isLoading={true} />;
  }

  if (databases.length === 0) {
    return (
      <List>
        <List.Section title="No Databases Found">
          <List.Item
            title="Create New Database"
            icon={Icon.Plus}
            actions={
              <ActionPanel>
                <Action title="Create Database" onAction={handleCreateDatabase} />
              </ActionPanel>
            }
          />
        </List.Section>
      </List>
    );
  }

  const filteredKeys = keys.filter(kv =>
    kv.key.toLowerCase().includes(searchText.toLowerCase()) ||
    kv.value.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <List
      isLoading={isLoadingKeys}
      searchBarPlaceholder="Search keys..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        databases.length > 1 ? (
          <List.Dropdown
            tooltip="Select Database"
            value={selectedDb}
            onChange={handleSwitchDatabase}
          >
            {databases.map((db) => (
              <List.Dropdown.Item key={db} title={db} value={db} />
            ))}
          </List.Dropdown>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action title="Add Key" icon={Icon.Plus} onAction={handleAddKey} />
          <Action title="Create Database" icon={Icon.Plus} onAction={handleCreateDatabase} />
          {selectedDb && (
            <Action title="Delete Database" icon={Icon.Trash} style={Action.Style.Destructive} onAction={handleDeleteDatabase} />
          )}
        </ActionPanel>
      }
    >
      <List.Section title={`${filteredKeys.length} keys`}>
        {filteredKeys.map((kv) => (
          <List.Item
            key={kv.key}
            title={kv.key}
            subtitle={kv.value.length > 50 ? `${kv.value.substring(0, 50)}...` : kv.value}
            icon={Icon.Key}
            actions={
              <ActionPanel>
                <Action title="Copy Value" onAction={async () => {
                  await Clipboard.copy(kv.value);
                  await showToast({
                    style: Toast.Style.Success,
                    title: "Value copied",
                  });
                }} />
                <Action title="Edit Value" onAction={() => {
                  push(<SetValueForm db={selectedDb} initialKey={kv.key} initialValue={kv.value} onSuccess={() => loadKeys(selectedDb)} />);
                }} />
                <Action title="Delete Key" style={Action.Style.Destructive} onAction={async () => {
                  try {
                    await deleteKey(kv.key, selectedDb);
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Key deleted",
                    });
                    loadKeys(selectedDb); // Refresh the list
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    await showToast({
                      style: Toast.Style.Failure,
                      title: "Failed to delete key",
                      message: errorMessage,
                    });
                  }
                }} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}