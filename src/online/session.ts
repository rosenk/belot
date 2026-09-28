import Peer, { type DataConnection } from "peerjs";
import { isPlayerView, viewForSeat } from "../game/state.ts";
import type { Command, GameState, PlayerView, Seat } from "../game/types.ts";
import { playerToken } from "./room.ts";

type Status = { text: string; connected: number; ready: boolean };
type WireMessage =
  | { type: "joined"; seat: Seat; connected: number }
  | { type: "state"; view: PlayerView; connected: number }
  | { type: "command"; command: Command }
  | { type: "full" };

interface Callbacks {
  getState: () => GameState;
  applyCommand: (command: Command) => void;
  onView: (view: PlayerView) => void;
  onSeat: (seat: Seat) => void;
  onStatus: (status: Status) => void;
  onReservations?: (reservations: [string, Seat][]) => void;
}

function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<Command>;
  return (command.type === "bid" || command.type === "play" || command.type === "next-deal") && typeof command.seat === "number";
}

export class OnlineSession {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private connections = new Map<Seat, DataConnection>();
  private reservations = new Map<string, Seat>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  readonly mode: "host" | "guest";
  readonly room: string;

  constructor(mode: "host" | "guest", room: string, private callbacks: Callbacks, reservations: [string, Seat][] = []) {
    this.mode = mode;
    this.room = room;
    this.reservations = new Map(reservations);
  }

  start(): void {
    if (this.mode === "host") this.startHost();
    else this.startGuest();
    addEventListener("online", this.handleOnline);
  }

  private startHost(): void {
    this.peer = new Peer(`belot-${this.room}`);
    this.callbacks.onSeat(0);
    this.callbacks.onView(viewForSeat(this.callbacks.getState(), 0));
    this.peer.on("open", () => this.report("Стаята е готова. Поканете още трима."));
    this.peer.on("connection", (connection) => this.accept(connection));
    this.peer.on("error", (error) => this.report(error.type === "unavailable-id" ? "Този код вече се използва." : "Проблем с връзката."));
  }

  private accept(connection: DataConnection): void {
    const token = typeof connection.metadata?.token === "string" ? connection.metadata.token : "";
    let seat = this.reservations.get(token);
    if (seat === undefined) seat = ([1, 2, 3] as Seat[]).find((candidate) => !this.connections.has(candidate) && ![...this.reservations.values()].includes(candidate));
    if (!token || seat === undefined) {
      connection.on("open", () => { connection.send({ type: "full" } satisfies WireMessage); connection.close(); });
      return;
    }
    this.reservations.set(token, seat);
    this.callbacks.onReservations?.([...this.reservations]);
    const old = this.connections.get(seat);
    old?.close();
    this.connections.set(seat, connection);
    connection.on("open", () => { connection.send({ type: "joined", seat, connected: this.connectedCount() } satisfies WireMessage); this.broadcast(); });
    connection.on("data", (data) => {
      const message = data as Partial<WireMessage>;
      if (message.type !== "command" || !isCommand(message.command)) return;
      this.callbacks.applyCommand({ ...message.command, seat: seat! } as Command);
      this.broadcast();
    });
    connection.on("close", () => {
      if (this.connections.get(seat!) === connection) this.connections.delete(seat!);
      this.broadcast();
    });
  }

  private startGuest(): void {
    this.peer = new Peer();
    this.peer.on("open", () => this.connectGuest());
    this.peer.on("disconnected", () => this.scheduleReconnect());
    this.peer.on("error", () => this.scheduleReconnect());
    this.callbacks.onStatus({ text: "Свързване…", connected: 1, ready: false });
  }

  private connectGuest(): void {
    if (!this.peer || this.peer.destroyed) return;
    const connection = this.peer.connect(`belot-${this.room}`, { reliable: true, metadata: { token: playerToken() } });
    this.connection = connection;
    connection.on("open", () => this.callbacks.onStatus({ text: "Свързани сте.", connected: 2, ready: false }));
    connection.on("data", (data) => this.receive(data));
    connection.on("close", () => this.scheduleReconnect());
    connection.on("error", () => this.scheduleReconnect());
  }

  private receive(data: unknown): void {
    const message = data as Partial<WireMessage>;
    if (message.type === "full") {
      this.callbacks.onStatus({ text: "Стаята е пълна.", connected: 4, ready: false });
    } else if (message.type === "joined" && typeof message.seat === "number") {
      this.callbacks.onSeat(message.seat);
    } else if (message.type === "state" && isPlayerView(message.view)) {
      this.callbacks.onView(message.view);
      const connected = typeof message.connected === "number" ? message.connected : 1;
      this.callbacks.onStatus({ text: connected === 4 ? "Четиримата сте на масата." : `Играчите са ${connected} от 4.`, connected, ready: connected === 4 });
    }
  }

  private connectedCount(): number { return 1 + this.connections.size; }

  private report(text: string): void {
    const connected = this.connectedCount();
    this.callbacks.onStatus({ text, connected, ready: connected === 4 });
  }

  broadcast(): void {
    if (this.mode !== "host") return;
    const state = this.callbacks.getState();
    const connected = this.connectedCount();
    this.callbacks.onView(viewForSeat(state, 0));
    for (const [seat, connection] of this.connections) {
      if (connection.open) connection.send({ type: "state", view: viewForSeat(state, seat), connected } satisfies WireMessage);
    }
    this.report(connected === 4 ? "Четиримата сте на масата." : `Играчите са ${connected} от 4.`);
  }

  send(command: Command): void {
    if (this.mode === "guest" && this.connection?.open) this.connection.send({ type: "command", command } satisfies WireMessage);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.callbacks.onStatus({ text: "Връзката прекъсна. Нов опит…", connected: 1, ready: false });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.peer || this.peer.destroyed) return;
      if (this.peer.disconnected) this.peer.reconnect();
      else this.connectGuest();
    }, 1500);
  }

  private handleOnline = (): void => { if (this.mode === "guest") this.scheduleReconnect(); };

  close(): void {
    removeEventListener("online", this.handleOnline);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connection?.close();
    for (const connection of this.connections.values()) connection.close();
    this.peer?.destroy();
  }
}
