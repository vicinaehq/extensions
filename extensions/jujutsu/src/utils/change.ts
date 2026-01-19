import { execJJ } from "./exec";

export function createNewChange(description?: string, path?: string): void {
  if (description) {
    execJJ(`new -m "${description.replace(/"/g, '\\"')}"`, path);
  } else {
    execJJ("new", path);
  }
}

export function describeChange(description: string, path?: string): void {
  execJJ(`describe -m "${description.replace(/"/g, '\\"')}"`, path);
}

export function getCurrentDescription(path?: string): string {
  const output = execJJ("log -r @ --template description", path);
  return output;
}
