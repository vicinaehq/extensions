
import { Action, ActionPanel, Form, Icon, showToast, useNavigation } from "@vicinae/api";
import { executeIwctlCommand } from "../utils/execute-iwctl";
import { useState } from "react";

interface ConnectFormProps {
  ssid: string;
  deviceName: string;
  security: string;
}

interface ConnectHiddenFormProps{
  deviceName: string;
}

export function ConnectForm({ ssid, security, deviceName }: ConnectFormProps) {
  const { pop } = useNavigation();

  const isEnterprise = security.toLowerCase().startsWith("8021x");

  const handleConnect = async (values: { password?: string; username?: string }) => {
    const { password, username } = values;

    // Validate fields
    if (isEnterprise) {
      if (!username || !password) {
        await showToast({
          title: "Missing Credentials",
          message: "Please enter both username and password.",
        });
        return;
      }
    } else {
      if (!password) {
        await showToast({
          title: "Password Required",
          message: "Please enter a password for the network.",
        });
        return;
      }
    }

    await showToast({
      title: "Connecting...",
      message: `Attempting to connect to ${ssid}`,
    });

    // Personal Wi-Fi (WPA/WPA2/WPA3)
    let result;
    if (!isEnterprise) {
      result = await executeIwctlCommand(
        `--passphrase=${password}`, ["station", deviceName, "connect",  `"${ssid}"`]
      );
    }
    // WPA2-Enterprise / 802.1X
    else {
      result = await executeIwctlCommand(
        `--user=${username}`, [
          `--password=${password}`,
          "station",
          deviceName,
          "connect",
          `"${ssid}"`,
          ]
      );
    }

    if (result.success) {
      await showToast({
        title: "Connection Successful",
        message: `Successfully connected to ${ssid}`,
      });
      pop();
    } else {
      await showToast({
        title: "Connection Failed",
        message: result.error || "Could not connect to the network.",
      });
    }
  };

  return (
    <Form
      navigationTitle={`Connect to ${ssid}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Connect" icon={Icon.Wifi} onSubmit={handleConnect} />
        </ActionPanel>
      }
    >
      <Form.Description
    title="Connect to Wi-Fi"
    text="Fill in the details below to connect to a network."
    />
    <Form.Separator/>
      {isEnterprise ? (
        <>
          <Form.TextField id="username" title="Username" placeholder="Enter your login username" />
          <Form.PasswordField id="password" title="Password" placeholder="Enter your login password" />
        </>
      ) : (
        <Form.PasswordField id="password" title="Password" placeholder="Enter network password" />
      )}
    </Form>
  );
}


export function ConnectHiddenForm({ deviceName }: ConnectHiddenFormProps) {
  const [values, setValues] = useState({ ssid: "", security: "open", username: "", password: "" });
  const { pop } = useNavigation();
  

  const handleConnect = async () => {
    
    const { ssid, security, username, password } = values;

    if (!ssid) {
      await showToast({ title: "SSID Required", message: "Please enter a network name." });
      return;
    }

    if (security === "psk" && !password) {
      await showToast({
        title: "Password Required",
        message: "Please enter the Wi‑Fi password.",
      });
      return;
    }

    if (security === "8021x" && (!username || !password)) {
      await showToast({
        title: "Missing Credentials",
        message: "Please enter both username and password.",
      });
      return;
    }

    await showToast({ title: "Connecting...", message: `Attempting to connect to ${ssid}` });

    let result;

    if (security === "open") {
      result = await executeIwctlCommand("station", [ deviceName, "connect-hidden", `"${ssid}"`]);
    }

    if (security === "psk") {
      result = await executeIwctlCommand(`--passphrase=${password}`, [
        "station",
        deviceName,
        "connect-hidden",
        `"${ssid}"`,
      ]);
    }

    if (security === "8021x") {
      result = await executeIwctlCommand(`--user=${username}`, [
        `--password=${password}`,
        "station",
        deviceName,
        "connect-hidden",
        `"${ssid}"`,
      ]);
    }

    if (result.success) {
      await showToast({ title: "Connection Successful", message: `Connected to ${ssid}` });
      pop();
    } else {
      await showToast({ title: "Connection Failed", message: result.error || "Could not connect." });
    }
  };

  return (
    <Form
      navigationTitle="Connect to a hidden Wi‑Fi"
      
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Connect" icon={Icon.Wifi} onSubmit={handleConnect} />
        </ActionPanel>
      }
    >
      <Form.Description
    title="Connect to Hidden Wi-Fi"
    text="Fill in the details below to connect to a hidden network."
    />
    <Form.Separator />
      <Form.TextField
        id="ssid"
        title="SSID"
        value={values.ssid}
        onChange={(v) => setValues({ ...values, ssid: v })}
        placeholder="Network name"
      />

      <Form.Dropdown
        id="security"
        title="Security Type"
        value={values.security}
        onChange={(v) => setValues({ ...values, security: v })}
      >
        <Form.Dropdown.Item title="Open" value="open" />
        <Form.Dropdown.Item title="WPA/WPA2/PSK" value="psk" />
        <Form.Dropdown.Item title="WPA2‑Enterprise (8021x)" value="8021x" />
      </Form.Dropdown>

      {values.security === "psk" && (
        <Form.PasswordField
          id="password"
          title="Passphrase"
          value={values.password}
          onChange={(v) => setValues({ ...values, password: v })}
          placeholder="Network password"
        />
      )}

      {values.security === "8021x" && (
        <>
          <Form.TextField
            id="username"
            title="Username"
            value={values.username}
            onChange={(v) => setValues({ ...values, username: v })}
            placeholder="Login username"
          />
          <Form.PasswordField
            id="password"
            title="Password"
            value={values.password}
            onChange={(v) => setValues({ ...values, password: v })}
            placeholder="Login password"
          />
        </>
      )}
    </Form>
  );
}
