import { LocalStorage } from "@vicinae/api";

const key = "openvpn-profile-path";

export function getProfile() {
  return LocalStorage.getItem<string>(key);
}

export function saveProfile(path: string) {
  return LocalStorage.setItem(key, path);
}
