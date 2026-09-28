import { DurableObject } from "cloudflare:workers";
import { isAllowedOrigin, isReadyMessage } from "./protocol.ts";

export interface Env {
  MATCHMAKER: DurableObjectNamespace<MatchmakingQueue>;
  ALLOWED_ORIGINS: string;
}

interface WaitingPlayer { room: string; queuedAt: number }

export class MatchmakingQueue extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ["waiting"]);
    server.serializeAttachment({ room: "", queuedAt: Date.now() } satisfies WaitingPlayer);
    server.send(JSON.stringify({ type: "waiting", needed: 3 }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let parsed: unknown;
    try { parsed = JSON.parse(message); } catch { return; }
    if (!isReadyMessage(parsed)) return;
    socket.serializeAttachment({ room: parsed.room, queuedAt: Date.now() } satisfies WaitingPlayer);
    this.matchWaiting();
  }

  webSocketClose(): void {}
  webSocketError(): void {}

  private matchWaiting(): void {
    const cutoff = Date.now() - 60_000;
    const waiting = this.ctx.getWebSockets("waiting")
      .map((socket) => ({ socket, data: socket.deserializeAttachment() as WaitingPlayer }))
      .filter(({ socket, data }) => {
        if (!data.room || data.queuedAt < cutoff) {
          if (data.room) socket.close(1000, "expired");
          return false;
        }
        return true;
      })
      .sort((left, right) => left.data.queuedAt - right.data.queuedAt);
    if (waiting.length < 4) {
      for (const { socket } of waiting) socket.send(JSON.stringify({ type: "waiting", needed: 4 - waiting.length }));
      return;
    }
    const group = waiting.slice(0, 4);
    const room = group[0].data.room;
    group.forEach(({ socket }, seat) => {
      socket.send(JSON.stringify({ type: "matched", room, role: seat === 0 ? "host" : "guest", seat }));
      socket.close(1000, "matched");
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAllowedOrigin(request.headers.get("Origin"), env.ALLOWED_ORIGINS)) return new Response("Forbidden", { status: 403 });
    const url = new URL(request.url);
    if (url.pathname !== "/match") return new Response("Not found", { status: 404 });
    return env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global-v1")).fetch(request);
  },
} satisfies ExportedHandler<Env>;
