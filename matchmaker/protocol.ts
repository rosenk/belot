interface ReadyMessage { type: "ready"; room: string }

export function isReadyMessage(value: unknown): value is ReadyMessage {
  return !!value && typeof value === "object" && (value as ReadyMessage).type === "ready" && /^[2-9A-HJ-NP-Z]{6}$/.test((value as ReadyMessage).room);
}

export function isAllowedOrigin(origin: string | null, configured: string): boolean {
  if (!origin) return false;
  const url = new URL(origin);
  return configured.split(",").some((entry) => {
    const allowed = entry.trim();
    if (allowed === origin) return true;
    if (allowed === "http://localhost:*" && url.protocol === "http:" && url.hostname === "localhost") return true;
    if (!allowed.startsWith("https://*.")) return false;
    return url.protocol === "https:" && url.hostname.endsWith(allowed.slice("https://*".length));
  });
}
