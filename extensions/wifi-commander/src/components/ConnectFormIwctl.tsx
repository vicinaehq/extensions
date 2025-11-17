
import { Action, ActionPanel, Form, Icon, showToast, useNavigation } from "@vicinae/api";
import { executeNmcliCommand } from "../utils/execute-nmcli";

interface ConnectFormProps {
  ssid: string;
  deviceName: string;
  security: string;
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
      result = await executeNmcliCommand(
        `--passphrase=${password}`, ["station", deviceName, "connect",  `"${ssid}"`]
      );
    }
    // WPA2-Enterprise / 802.1X
    else {
      result = await executeNmcliCommand(
        `--user=${username}`, [
          `--password=${password}`,
          "station",
          deviceName,
          "connect",
          ssid,
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


export function ConnectHiddenForm() {
  console.log("hidden form")
  return
}