import { useCallback, useEffect, useState } from "react";
import { checkHealth } from "../lib/api";

export type ServerState = "idle" | "up" | "waking" | "down";

export interface ServerStatus {
  state: ServerState;
  label: string;
  markUp(): void;
  markDown(): void;
}

const LABELS: Record<ServerState, string> = {
  idle: "Checking server…",
  up: "Ready",
  waking: "Waking server…",
  down: "Server offline",
};

/** Pings the API on load. On a free plan this also wakes a sleeping server early. */
export function useServerStatus(): ServerStatus {
  const [state, setState] = useState<ServerState>("idle");

  useEffect(() => {
    let cancelled = false;
    const slow = window.setTimeout(() => !cancelled && setState("waking"), 2500);
    checkHealth().then((ok) => {
      window.clearTimeout(slow);
      if (!cancelled) setState(ok ? "up" : "down");
    });
    return () => {
      cancelled = true;
      window.clearTimeout(slow);
    };
  }, []);

  const markUp = useCallback(() => setState("up"), []);
  const markDown = useCallback(() => setState("down"), []);

  return { state, label: LABELS[state], markUp, markDown };
}
