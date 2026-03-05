#!/usr/bin/env node
"use strict";

/**
 * Dev output filter.
 *
 * Purpose: when running `npm run dev`, filter out a known upstream noisy warning:
 *   "ErrorBoundary: Error boundaries should implement getDerivedStateFromError()..."
 *
 * Background: this message comes from the Vicinae/React runtime ErrorBoundary implementation.
 * We can't fully fix it from the extension side, but it hurts the dev experience (looks like an error).
 *
 * Note: we only filter this exact substring; other real errors are not swallowed.
 *
 * To view the raw output, run:
 *   npm run dev:raw
 */

const { spawn } = require("node:child_process");

const FILTER_SUBSTRING = "Error boundaries should implement getDerivedStateFromError";

function pipeWithFilter(stream, write) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += String(chunk);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.includes(FILTER_SUBSTRING)) continue;
      write(`${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer && !buffer.includes(FILTER_SUBSTRING)) write(`${buffer}\n`);
  });
}

const args = ["develop", ...process.argv.slice(2)];
const child = spawn("vici", args, { stdio: ["inherit", "pipe", "pipe"] });

pipeWithFilter(child.stdout, (s) => process.stdout.write(s));
pipeWithFilter(child.stderr, (s) => process.stderr.write(s));

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

