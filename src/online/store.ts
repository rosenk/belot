import type { GameState, Seat } from "../game/types.ts";

export interface HostedMatch { state: GameState; reservations: [string, Seat][] }
interface SavedMatch extends HostedMatch { version: 2; updatedAt: number }
const prefix = "belot-host-";
const lifetime = 24 * 60 * 60 * 1000;

export function saveMatch(room: string, state: GameState, reservations: [string, Seat][] = []): void {
  const record: SavedMatch = { version: 2, updatedAt: Date.now(), state, reservations };
  localStorage.setItem(prefix + room, JSON.stringify(record));
}

export function loadMatch(room: string): HostedMatch | null {
  try {
    const raw = localStorage.getItem(prefix + room);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<SavedMatch>;
    if (record.version !== 2 || typeof record.updatedAt !== "number" || Date.now() - record.updatedAt > lifetime || !record.state || !Array.isArray(record.state.hands) || record.state.hands.length !== 4) {
      localStorage.removeItem(prefix + room);
      return null;
    }
    const reservations = Array.isArray(record.reservations)
      ? record.reservations.filter((item): item is [string, Seat] => Array.isArray(item) && typeof item[0] === "string" && [1, 2, 3].includes(item[1]))
      : [];
    return { state: record.state, reservations };
  } catch {
    localStorage.removeItem(prefix + room);
    return null;
  }
}
