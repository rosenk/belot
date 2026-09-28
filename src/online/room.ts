const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export function roomFromUrl(url = new URL(location.href)): string | null {
  const room = url.searchParams.get("room")?.toUpperCase() ?? "";
  return /^[2-9A-HJ-NP-Z]{6}$/.test(room) ? room : null;
}

export function inviteUrl(room: string): string {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", room);
  return url.toString();
}

export function markHostRoom(room: string): void {
  sessionStorage.setItem(`belot-host-${room}`, "1");
}

export function isHostRoom(room: string): boolean {
  return sessionStorage.getItem(`belot-host-${room}`) === "1";
}

export function playerToken(): string {
  const key = "belot-player-token";
  const saved = sessionStorage.getItem(key);
  if (saved) return saved;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(key, token);
  return token;
}
