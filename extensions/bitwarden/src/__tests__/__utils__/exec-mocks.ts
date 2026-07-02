import { vi, expect } from 'vitest';

export function mockExec(mf: ReturnType<typeof vi.fn>, stdout: string, stderr = ''): void {
  mf.mockResolvedValueOnce({ stdout, stderr });
}

export function mockExecError(mf: ReturnType<typeof vi.fn>, message: string): void {
  const err = new Error(message) as Error & { stderr: string; code: number };
  err.stderr = message;
  err.code = 1;
  mf.mockRejectedValueOnce(err);
}

function createBaseChild(ms: ReturnType<typeof vi.fn>) {
  const child = {
    stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
    on: vi.fn(),
  };
  child.stdin.on.mockImplementation((event: string, cb: () => void) => {
    if (event === 'finish') cb();
    return child;
  });
  ms.mockReturnValueOnce(child);
  return child;
}

function makeSpawnChild(ms: ReturnType<typeof vi.fn>, exitCode: number) {
  const child = createBaseChild(ms);
  child.on.mockImplementation((event: string, cb: (code?: number) => void) => {
    if (event === 'close') cb(exitCode);
    return child;
  });
  return child;
}

export function mockSpawnSuccess(ms: ReturnType<typeof vi.fn>) {
  return makeSpawnChild(ms, 0);
}

export function mockSpawnError(ms: ReturnType<typeof vi.fn>, code: number): void {
  makeSpawnChild(ms, code);
}

export function createSpawnChild(ms: ReturnType<typeof vi.fn>) {
  const child = createBaseChild(ms);
  child.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'error') cb(new Error('spawn failed'));
    return child;
  });
  return child;
}

export function expectEncodeAndExec(
  ms: ReturnType<typeof vi.fn>,
  session: string,
  cmd: string,
  args: string[],
): void {
  expect(ms).toHaveBeenCalledTimes(2);
  expect(ms).toHaveBeenNthCalledWith(
    1,
    'bw',
    ['encode'],
    expect.objectContaining({
      stdio: ['pipe', 'pipe', 'pipe'],
      env: expect.objectContaining({ BW_SESSION: session }),
    }),
  );
  expect(ms).toHaveBeenNthCalledWith(
    2,
    'bw',
    [cmd, ...args],
    expect.objectContaining({
      stdio: ['pipe', 'pipe', 'pipe'],
      env: expect.objectContaining({ BW_SESSION: session }),
    }),
  );
}
