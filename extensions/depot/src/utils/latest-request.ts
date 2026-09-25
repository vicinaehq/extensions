export interface ActiveRequest {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}

export class LatestRequest {
  private controller: AbortController | undefined;
  private generation = 0;

  start(): ActiveRequest {
    this.cancel();

    const controller = new AbortController();
    const generation = this.generation;
    this.controller = controller;

    return {
      signal: controller.signal,
      isCurrent: () =>
        !controller.signal.aborted && generation === this.generation,
    };
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.generation += 1;
  }
}
