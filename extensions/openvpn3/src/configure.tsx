import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { validateProfile } from "./openvpn";
import { getProfile, saveProfile } from "./settings";

export default function Configure() {
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then((saved) => setPath(saved ?? ""))
      .catch(() => showToast({
        style: Toast.Style.Failure,
        title: "Could not load the VPN profile path",
      }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setLoading(true);
    try {
      const validated = await validateProfile(path);
      await saveProfile(validated);
      setPath(validated);
      await showToast({ style: Toast.Style.Success, title: "VPN profile path saved" });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save profile",
        message: (error as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form
      isLoading={loading}
      actions={loading ? undefined : (
        <ActionPanel>
          <Action.SubmitForm title="Save Profile" onSubmit={save} />
        </ActionPanel>
      )}
    >
      <Form.TextField
        id="profile"
        title="OpenVPN config path"
        placeholder="~/vpn/profile.ovpn"
        value={path}
        onChange={setPath}
      />
    </Form>
  );
}
