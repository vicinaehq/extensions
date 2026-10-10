export class OperationLock {
  private activeKey?: string;

  tryAcquire(key: string): boolean {
    if (this.activeKey !== undefined) return false;
    this.activeKey = key;
    return true;
  }

  release(key: string): void {
    if (this.activeKey === key) this.activeKey = undefined;
  }
}
