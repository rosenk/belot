export const suits = ["clubs", "diamonds", "hearts", "spades"] as const;
export const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const seats = [0, 1, 2, 3] as const;

export type Suit = (typeof suits)[number];
export type Rank = (typeof ranks)[number];
export type Seat = (typeof seats)[number];
export type Team = 0 | 1;
export type Card = { suit: Suit; rank: Rank };
export type CardId = `${Suit}-${Rank}`;
export type Contract = Suit | "no-trump" | "all-trump";
export type Multiplier = 1 | 2 | 4;
export type Phase = "bidding" | "playing" | "deal-end" | "game-over";
export type DeclarationStatus = "pending" | "won" | "lost";

export interface DeclarationOption {
  id: string;
  kind: "run" | "quad";
  suit: Suit | null;
  high: Rank;
  length: number;
  points: number;
}

export interface PublicDeclaration extends DeclarationOption {
  seat: Seat;
  status: DeclarationStatus;
}

export interface BelotAnnouncement {
  seat: Seat;
  suit: Suit;
  card: "Q" | "K";
  stage: "belot" | "rebelot";
}

export type BidAction =
  | { type: "pass" }
  | { type: "bid"; contract: Contract }
  | { type: "double" }
  | { type: "redouble" };

export type Command =
  | { type: "bid"; seat: Seat; action: BidAction }
  | { type: "declare"; seat: Seat; declaration: string }
  | { type: "play"; seat: Seat; card: CardId; announceBelot?: boolean }
  | { type: "next-deal"; seat: Seat };

export interface BidRecord {
  seat: Seat;
  action: BidAction;
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
}

export interface DealResult {
  raw: [number, number];
  written: [number, number];
  contractMade: boolean;
  summary: string;
}

export interface GameState {
  phase: Phase;
  dealer: Seat;
  turn: Seat;
  hands: [Card[], Card[], Card[], Card[]];
  remaining: [Card[], Card[], Card[], Card[]];
  contract: Contract | null;
  bidder: Seat | null;
  multiplier: Multiplier;
  bids: BidRecord[];
  consecutivePasses: number;
  trick: PlayedCard[];
  tricksWon: [number, number];
  captured: [Card[], Card[]];
  declarations: PublicDeclaration[];
  belotAnnouncements: BelotAnnouncement[];
  declarationPoints: [number, number];
  belotPoints: [number, number];
  scores: [number, number];
  hanging: number;
  dealNumber: number;
  result: DealResult | null;
  winner: Team | null;
}

export interface PlayerView {
  phase: Phase;
  dealer: Seat;
  turn: Seat;
  seat: Seat;
  hand: Card[];
  handCounts: [number, number, number, number];
  contract: Contract | null;
  bidder: Seat | null;
  multiplier: Multiplier;
  bids: BidRecord[];
  trick: PlayedCard[];
  tricksWon: [number, number];
  declarations: PublicDeclaration[];
  belotAnnouncements: BelotAnnouncement[];
  declarationPoints: [number, number];
  belotPoints: [number, number];
  scores: [number, number];
  hanging: number;
  dealNumber: number;
  result: DealResult | null;
  winner: Team | null;
  legalCards: CardId[];
}

export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
export const teamOf = (seat: Seat): Team => (seat % 2) as Team;
export const cardId = (card: Card): CardId => `${card.suit}-${card.rank}`;
