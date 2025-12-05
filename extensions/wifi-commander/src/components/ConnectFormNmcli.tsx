import { Action, ActionPanel, Form, Icon, showToast, useNavigation } from "@vicinae/api";
import { executeNmcliCommand } from "../utils/execute-nmcli";

interface ConnectFormProps {
  ssid: string;
}

export default function ConnectForm({ ssid }: ConnectFormProps) {
  const { pop } = useNavigation();

  const handleConnect = async (values: { password?: string }) => {
    const { password } = values;

    if (!password) {
      await showToast({
        title: "Password Required",
        message: "Please enter a password for the network.",
      });
      return;
    }

    await showToast({
      title: "Connecting...",
      message: `Attempting to connect to ${ssid}`,
    });

    const result = await executeNmcliCommand("device wifi connect", [`"${ssid}"`, "password", password]);

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
      <Form.PasswordField id="password" title="Password" placeholder="Enter network password" />
    </Form>
  );
}
