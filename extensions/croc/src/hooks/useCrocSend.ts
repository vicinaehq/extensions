import { spawn } from "node:child_process";
import { useState, useRef, useEffect } from "react";
import { parseTransferProgressByFile } from "../utils/transfer-progress";

export const useCrocSend = () => {
  const [status, setStatus] = useState<SendStatus>("idle");
  const [transferCode, setTransferCode] = useState<string | undefined>();
  const [transferProgress, setTransferProgress] = useState<
    string | undefined
  >();

  const [files, setFiles] = useState<string[]>([]);

  const processRef = useRef<ReturnType<typeof spawn> | null>(null);
  const outputRef = useRef<string>("");

  const sendFiles = () => {
    if (files.length === 0) {
      throw new Error("Select at least one file or folder to send");
    }

    if (processRef.current) {
      throw new Error("A croc transfer is already running");
    }

    const child = spawn("croc", ["send", ...files], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    processRef.current = child;
    outputRef.current = "";
    setStatus("waiting-for-receiver");
    setTransferProgress(undefined);

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      outputRef.current += text;

      const codeMatch = outputRef.current.match(/Code is:\s*([^\s]+)/i);
      const transferProgress = parseTransferProgressByFile(outputRef.current);

      setStatus(codeMatch?.[1] ? "waiting-for-receiver" : "sending");
      if (codeMatch?.[1]) setTransferCode(codeMatch[1]);
      if (transferProgress) setTransferProgress(transferProgress);
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    const completion = new Promise<void>((resolve, reject) => {
      child.on("error", (error) => {
        processRef.current = null;
        setStatus("idle");
        reject(error);
      });

      child.on("close", (code, signal) => {
        processRef.current = null;

        if (signal === "SIGTERM") {
          return reject(new Error("Transfer interrupted"));
        }

        if (code === 0) {
          setStatus("transfer-complete");
          return resolve();
        }

        setStatus("idle");

        reject(
          new Error(
            outputRef.current.trim() ||
              `croc exited with code ${code ?? "unknown"}`,
          ),
        );
      });
    });

    return {
      completion,
    };
  };

  useEffect(() => {
    return () => {
      processRef.current?.kill("SIGTERM");
    };
  }, []);

  return {
    status,
    transferCode,
    transferProgress,
    files,
    setFiles,
    sendFiles,
  };
};

type SendStatus =
  | "idle"
  | "waiting-for-receiver"
  | "sending"
  | "transfer-complete";
