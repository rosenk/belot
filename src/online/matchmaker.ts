import type { Seat } from "../game/types.ts";

const deployedMatchmakerUrl = "wss://belot-matchmaker.rosen4obg.workers.dev/match";

export const configuredMatchmakerUrl = import.meta.env.VITE_MATCHMAKER_URL?.trim() || deployedMatchmakerUrl;

export interface MatchResult {
  room: string;
  role: "host" | "guest";
  seat: Seat;
}

export interface MatchSearch {
  result: Promise<MatchResult>;
  cancel: () => void;
}

function isMatchResult(value: unknown): value is MatchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<MatchResult> & { type?: string };
  return result.type === "matched"
    && typeof result.room === "string"
    && /^[2-9A-HJ-NP-Z]{6}$/.test(result.room)
    && (result.role === "host" || result.role === "guest")
    && typeof result.seat === "number"
    && result.seat >= 0
    && result.seat <= 3;
}

export function findMatch(url: string, room: string, onWaiting: (needed: number) => void): MatchSearch {
  let socket: WebSocket | null = new WebSocket(url);
  let rejectResult: (reason: Error) => void = () => {};
  let settled = false;

  const finish = (callback: () => void): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    callback();
    socket?.close();
    socket = null;
  };

  const result = new Promise<MatchResult>((resolve, reject) => {
    rejectResult = reject;
    socket!.addEventListener("open", () => socket?.send(JSON.stringify({ type: "ready", room })));
    socket!.addEventListener("message", (event) => {
      let message: unknown;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (isMatchResult(message)) finish(() => resolve(message));
      else if (message && typeof message === "object" && (message as { type?: string }).type === "waiting") {
        const needed = (message as { needed?: unknown }).needed;
        if (typeof needed === "number" && needed >= 0 && needed <= 3) onWaiting(needed);
      }
    });
    socket!.addEventListener("error", () => finish(() => reject(new Error("Matchmaker connection failed"))));
    socket!.addEventListener("close", (event) => {
      if (!settled && event.code !== 1000) finish(() => reject(new Error("Matchmaker connection closed")));
    });
  });

  const timeout = setTimeout(() => finish(() => rejectResult(new Error("Matchmaker timed out"))), 60_000);

  return {
    result,
    cancel: () => finish(() => rejectResult(new Error("Matchmaking cancelled"))),
  };
}
