import { spawn } from "node:child_process";
import { useState, useRef, useEffect } from "react";
import { parseTransferProgressByFile } from "../utils/transfer-progress";

export const useCrocReceive = () => {
  const [status, setStatus] = useState<ReceiveStatus>("idle");
  const [transferProgress, setTransferProgress] = useState<
    string | undefined
  >();
  const [pendingFileCount, setPendingFileCount] = useState<
    number | undefined
  >();
  const [transferCode, setTransferCode] = useState("");

  const processRef = useRef<ReturnType<typeof spawn> | null>(null);
  const outputRef = useRef("");

  const runCroc = (args: string[], secret: string, downloadDir: string) => {
    if (processRef.current) {
      throw new Error("A croc transfer is already running");
    }

    const child = spawn("croc", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: downloadDir,
      env: {
        ...process.env,
        CROC_SECRET: secret,
      },
    });

    processRef.current = child;
    outputRef.current = "";

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      outputRef.current += text;

      const sawAcceptPrompt = /Accept .*\(Y\/n\)\?/i.test(outputRef.current);
      const sawReceiving = /Receiving\s*\(/i.test(outputRef.current);
      const acceptCountMatch = outputRef.current.match(
        /Accept\s+(\d+)\s+files?/i,
      );

      const transferProgress = parseTransferProgressByFile(outputRef.current);

      if (sawAcceptPrompt) setStatus("awaiting-accept");
      else if (sawReceiving) setStatus("receiving");

      if (transferProgress) setTransferProgress(transferProgress);
      if (acceptCountMatch) setPendingFileCount(Number(acceptCountMatch[1]));
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    const completion = new Promise<{
      output: string;
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.on("error", (error) => {
        processRef.current = null;
        reject(error);
      });

      child.on("close", (code, signal) => {
        processRef.current = null;
        resolve({
          output: outputRef.current.trim(),
          code,
          signal,
        });
      });
    });

    return completion;
  };

  const answerPrompt = (answer: "y" | "n") => {
    const child = processRef.current;
    if (!child) throw new Error("No active transfer");
    if (!child.stdin) throw new Error("Transfer input is not available");

    child.stdin.write(`${answer}\n`);
    child.stdin.end();

    if (answer === "y") setStatus("receiving");
  };

  const receiveTransfer = async (code: string, downloadDir: string) => {
    setStatus("awaiting-accept");
    setTransferProgress(undefined);
    setPendingFileCount(undefined);

    try {
      // On Linux/macOS, use CROC_SECRET to avoid exposing the phrase in argv.
      const result = await runCroc([], code, downloadDir);
      if (result.signal === "SIGTERM") throw new Error("Receive interrupted");

      if (result.code !== 0) {
        throw new Error(
          result.output || `croc exited with code ${result.code ?? "unknown"}`,
        );
      }

      setStatus("idle");
      setPendingFileCount(undefined);

      setTransferCode("");
      return result.output;
    } catch (error) {
      setStatus("idle");
      setPendingFileCount(undefined);
      throw error;
    }
  };

  useEffect(() => {
    return () => {
      processRef.current?.kill("SIGTERM");
    };
  }, []);

  return {
    status,
    transferProgress,
    pendingFileCount,
    transferCode,
    setTransferCode,
    receiveTransfer,
    answerPrompt,
  };
};

type ReceiveStatus = "idle" | "awaiting-accept" | "receiving";
