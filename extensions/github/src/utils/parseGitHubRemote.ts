export function parseGitHubRemote(remoteUrl: string): string | null {
  const normalizedRemoteUrl = remoteUrl.trim();

  const sshMatch = normalizedRemoteUrl.match(
    /^(?:ssh:\/\/)?git@github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
  );

  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = normalizedRemoteUrl.match(
    /^(?:https|git):\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
  );

  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return null;
}