import { useCallback, useEffect, useRef, useState } from "react";
import WebSocket from "ws";
import { buildWebSocketUrl } from "./clash-api";
import { errorMessage } from "./format";

type WebSocketState<T> = {
  data: T | undefined;
  isConnecting: boolean;
  error: string | undefined;
};

export function useWebSocketJson<T>(endpoint: string, params: Record<string, string> = {}): WebSocketState<T> {
  const [data, setData] = useState<T>();
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string>();
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptsRef = useRef(0);
  const paramsKey = JSON.stringify(params);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const url = await buildWebSocketUrl(endpoint, JSON.parse(paramsKey) as Record<string, string>);
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.on("open", () => {
        attemptsRef.current = 0;
        setError(undefined);
        setIsConnecting(false);
      });
      socket.on("message", (message) => {
        try {
          setData(JSON.parse(message.toString()) as T);
          setError(undefined);
        } catch (parseError) {
          setError(`Invalid response: ${errorMessage(parseError)}`);
        }
      });
      socket.on("error", (socketError) => setError(errorMessage(socketError)));
      socket.on("close", () => {
        if (socketRef.current !== socket) return;
        setIsConnecting(true);
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 15_000);
        attemptsRef.current += 1;
        retryRef.current = setTimeout(() => void connect(), delay);
      });
    } catch (connectError) {
      setError(errorMessage(connectError));
      setIsConnecting(false);
    }
  }, [endpoint, paramsKey]);

  useEffect(() => {
    void connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      const socket = socketRef.current;
      socketRef.current = undefined;
      socket?.close();
    };
  }, [connect]);

  return { data, isConnecting, error };
}
