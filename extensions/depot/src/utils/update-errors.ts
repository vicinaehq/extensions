export function updateSourceErrors(
  aptError?: string,
  flatpakError?: string,
): string[] {
  return [
    aptError ? `APT: ${aptError}` : undefined,
    flatpakError ? `Flatpak: ${flatpakError}` : undefined,
  ].filter((message): message is string => Boolean(message));
}
