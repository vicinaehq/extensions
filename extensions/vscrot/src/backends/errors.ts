/**
 * Raised when a capture ended because the user backed out — Esc in slurp or
 * slop, a dismissed Spectacle selector — rather than because anything went
 * wrong. Commands stay silent for this and report every other failure, so a
 * missing helper program can never be mistaken for a deliberate cancellation.
 */
export class CaptureCancelled extends Error {
	constructor(message = "Capture cancelled") {
		super(message);
		this.name = "CaptureCancelled";
	}
}

export const isCancellation = (e: unknown): boolean =>
	e instanceof CaptureCancelled;
