export class BwError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BwNotFound extends BwError {}
export class AuthFailed extends BwError {}
export class Locked extends BwError {}
export class NetworkError extends BwError {}
export class ServerCertError extends BwError {}
export class NotLoggedIn extends BwError {}
export class CliInvocationError extends BwError {
  constructor(message: string, public readonly exitCode: number, stderr?: string) {
    super(message, stderr);
  }
}

export class ItemNotFound extends BwError {}

export function classifyStderr(stderr: string, exitCode: number): BwError {
  const s = stderr.toLowerCase();
  if (s.includes("vault is locked")) return new Locked(stderr.trim(), stderr);
  if (s.includes("you are not logged in")) return new NotLoggedIn(stderr.trim(), stderr);
  if (s.includes("invalid master password") || s.includes("invalid client_id") || s.includes("invalid client_secret"))
    return new AuthFailed(stderr.trim(), stderr);
  if (s.includes("self signed certificate") || s.includes("unable to verify the first certificate"))
    return new ServerCertError(stderr.trim(), stderr);
  if (s.includes("getaddrinfo") || s.includes("econnrefused") || s.includes("network"))
    return new NetworkError(stderr.trim(), stderr);
  return new CliInvocationError(stderr.trim() || `bw exited with ${exitCode}`, exitCode, stderr);
}

export function classifyRbwStderr(stderr: string, exitCode: number): BwError {
  const s = stderr.toLowerCase();
  if (s.includes("agent is not running") || s.includes("failed to communicate with rbw-agent"))
    return new Locked(stderr.trim(), stderr);
  if (s.includes("failed to authenticate") || s.includes("invalid email or password"))
    return new AuthFailed(stderr.trim(), stderr);
  if (s.includes("account is not configured") || s.includes("failed to load db"))
    return new NotLoggedIn(stderr.trim(), stderr);
  if (s.includes("failed to find entry"))
    return new ItemNotFound(stderr.trim(), stderr);
  return new CliInvocationError(stderr.trim() || `rbw exited with ${exitCode}`, exitCode, stderr);
}
