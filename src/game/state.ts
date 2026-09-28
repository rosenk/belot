import { cardPoints, createDeck, shuffle } from "./cards.ts";
import { belotScores, declarationScores } from "./declarations.ts";
import { legalCards, trickWinner } from "./rules.ts";
import {
  cardId,
  nextSeat,
  teamOf,
  type BidAction,
  type Card,
  type Command,
  type Contract,
  type GameState,
  type PlayerView,
  type Seat,
  type Team,
} from "./types.ts";

export const contracts: Contract[] = ["clubs", "diamonds", "hearts", "spades", "no-trump", "all-trump"];

function emptyHands(): [Card[], Card[], Card[], Card[]] { return [[], [], [], []]; }

function deal(dealer: Seat, random: () => number, scores: [number, number], dealNumber: number, hanging = 0): GameState {
  const deck = shuffle(createDeck(), random);
  const hands = emptyHands();
  const remaining = emptyHands();
  let cursor = 0;
  const first = nextSeat(dealer);
  for (const batch of [3, 2]) {
    for (let offset = 0; offset < 4; offset++) {
      const seat = ((first + offset) % 4) as Seat;
      hands[seat].push(...deck.slice(cursor, cursor + batch));
      cursor += batch;
    }
  }
  for (let offset = 0; offset < 4; offset++) {
    const seat = ((first + offset) % 4) as Seat;
    remaining[seat].push(...deck.slice(cursor, cursor + 3));
    cursor += 3;
  }
  return {
    phase: "bidding", dealer, turn: first, hands, remaining, contract: null, bidder: null,
    multiplier: 1, bids: [], consecutivePasses: 0, trick: [], tricksWon: [0, 0], captured: [[], []],
    declarationPoints: [0, 0], belotPoints: [0, 0], scores, hanging, dealNumber, result: null, winner: null,
  };
}

export function createGame(random: () => number = Math.random): GameState {
  return deal(3, random, [0, 0], 1);
}

export function availableBids(state: GameState, seat: Seat): BidAction[] {
  if (state.phase !== "bidding" || state.turn !== seat) return [];
  const result: BidAction[] = [{ type: "pass" }];
  if (state.multiplier === 1) {
    const current = state.contract ? contracts.indexOf(state.contract) : -1;
    result.push(...contracts.slice(current + 1).map((contract) => ({ type: "bid", contract }) as BidAction));
    if (state.contract && state.bidder !== null && teamOf(state.bidder) !== teamOf(seat)) result.push({ type: "double" });
  } else if (state.multiplier === 2 && state.bidder !== null && teamOf(state.bidder) === teamOf(seat)) {
    result.push({ type: "redouble" });
  }
  return result;
}

function finishAuction(state: GameState): GameState {
  const hands = state.hands.map((hand, seat) => [...hand, ...state.remaining[seat as Seat]]) as GameState["hands"];
  const contract = state.contract!;
  return {
    ...state,
    phase: "playing",
    hands,
    remaining: emptyHands(),
    turn: nextSeat(state.dealer),
    declarationPoints: declarationScores(hands, contract),
    belotPoints: belotScores(hands, contract),
  };
}

function applyBid(state: GameState, seat: Seat, action: BidAction, random: () => number): GameState {
  if (!availableBids(state, seat).some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))) return state;
  let next: GameState = { ...state, bids: [...state.bids, { seat, action }], turn: nextSeat(seat) };
  if (action.type === "pass") {
    next.consecutivePasses++;
    if (!next.contract && next.consecutivePasses === 4) return deal(nextSeat(state.dealer), random, state.scores, state.dealNumber + 1, state.hanging);
    if (next.contract && next.consecutivePasses === 3) return finishAuction(next);
  } else {
    next.consecutivePasses = 0;
    if (action.type === "bid") {
      next.contract = action.contract;
      next.bidder = seat;
    } else if (action.type === "double") next.multiplier = 2;
    else next.multiplier = 4;
  }
  return next;
}

function rounded(raw: number, contract: Contract, otherRaw: number): number {
  const remainder = raw % 10;
  if (contract === "all-trump" && remainder === 4) return Math.floor(raw / 10) + (raw < otherRaw ? 1 : 0);
  return Math.floor(raw / 10) + (remainder >= (contract === "spades" || contract === "hearts" || contract === "diamonds" || contract === "clubs" ? 6 : 5) ? 1 : 0);
}

function scoreDeal(state: GameState, lastWinner: Seat): GameState {
  const contract = state.contract!;
  const raw: [number, number] = [0, 0];
  for (const team of [0, 1] as Team[]) raw[team] = state.captured[team].reduce((sum, card) => sum + cardPoints(card, contract), 0) + state.declarationPoints[team] + state.belotPoints[team];
  raw[teamOf(lastWinner)] += contract === "no-trump" ? 20 : 10;
  const valatTeam = state.tricksWon[0] === 8 ? 0 : state.tricksWon[1] === 8 ? 1 : null;
  if (valatTeam !== null) raw[valatTeam] += 90;

  const bidderTeam = teamOf(state.bidder!);
  const other = (1 - bidderTeam) as Team;
  const made = raw[bidderTeam] > raw[other];
  let written: [number, number] = [0, 0];
  let hanging = state.hanging;
  let summary = "";

  if (raw[0] === raw[1]) {
    written[other] = rounded(raw[other], contract, raw[bidderTeam]);
    hanging += rounded(raw[bidderTeam], contract, raw[other]) * state.multiplier;
    summary = `Равенство — ${hanging} т. висят.`;
  } else if (state.multiplier > 1) {
    const winner = raw[0] > raw[1] ? 0 : 1;
    written[winner] = rounded(raw[0] + raw[1], contract, 0) * state.multiplier + hanging;
    hanging = 0;
    summary = `${winner === 0 ? "Ние" : "Те"} печелят ${state.multiplier === 2 ? "контрата" : "реконтрата"}.`;
  } else if (made) {
    written = [rounded(raw[0], contract, raw[1]), rounded(raw[1], contract, raw[0])];
    const winner = raw[0] > raw[1] ? 0 : 1;
    written[winner] += hanging;
    hanging = 0;
    summary = "Играта е изкарана.";
  } else {
    written[other] = rounded(raw[0] + raw[1], contract, 0) + hanging;
    hanging = 0;
    summary = "Играта е вътре.";
  }

  const scores: [number, number] = [state.scores[0] + written[0], state.scores[1] + written[1]];
  let winner: Team | null = null;
  if (scores[0] >= 151 || scores[1] >= 151) {
    if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  }
  return { ...state, phase: winner === null ? "deal-end" : "game-over", scores, hanging, winner, result: { raw, written, contractMade: made, summary } };
}

function applyPlay(state: GameState, seat: Seat, id: string): GameState {
  if (state.phase !== "playing" || state.turn !== seat || !state.contract || state.trick.length >= 4) return state;
  const allowed = legalCards(state.hands[seat], state.trick, state.contract);
  if (!allowed.includes(id as never)) return state;
  const index = state.hands[seat].findIndex((card) => cardId(card) === id);
  if (index < 0) return state;
  const card = state.hands[seat][index];
  const hands = state.hands.map((hand, handSeat) => handSeat === seat ? hand.filter((_, cardIndex) => cardIndex !== index) : [...hand]) as GameState["hands"];
  const trick = [...state.trick, { seat, card }];
  if (trick.length < 4) return { ...state, hands, trick, turn: nextSeat(seat) };
  const winner = trickWinner(trick, state.contract);
  const team = teamOf(winner);
  const captured = state.captured.map((cards, index) => index === team ? [...cards, ...trick.map((play) => play.card)] : [...cards]) as GameState["captured"];
  const tricksWon: [number, number] = [...state.tricksWon];
  tricksWon[team]++;
  return { ...state, hands, trick, turn: winner, captured, tricksWon };
}

export function collectTrick(state: GameState): GameState {
  if (state.phase !== "playing" || state.trick.length !== 4 || !state.contract) return state;
  const winner = trickWinner(state.trick, state.contract);
  const next = { ...state, trick: [], turn: winner };
  return state.hands.every((hand) => hand.length === 0) ? scoreDeal(next, winner) : next;
}

export function applyCommand(state: GameState, command: Command, random: () => number = Math.random): GameState {
  if (command.type === "bid") return applyBid(state, command.seat, command.action, random);
  if (command.type === "play") return applyPlay(state, command.seat, command.card);
  if (command.type === "next-deal" && state.phase === "deal-end") return deal(nextSeat(state.dealer), random, state.scores, state.dealNumber + 1, state.hanging);
  return state;
}

export function viewForSeat(state: GameState, seat: Seat): PlayerView {
  return {
    phase: state.phase, dealer: state.dealer, turn: state.turn, seat,
    hand: state.hands[seat].map((card) => ({ ...card })),
    handCounts: state.hands.map((hand) => hand.length) as PlayerView["handCounts"],
    contract: state.contract, bidder: state.bidder, multiplier: state.multiplier,
    bids: state.bids.map((bid) => ({ seat: bid.seat, action: { ...bid.action } })),
    trick: state.trick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    tricksWon: [...state.tricksWon],
    declarationPoints: [...state.declarationPoints], belotPoints: [...state.belotPoints], scores: [...state.scores],
    hanging: state.hanging, dealNumber: state.dealNumber,
    result: state.result ? { ...state.result, raw: [...state.result.raw], written: [...state.result.written] } : null,
    winner: state.winner,
    legalCards: state.phase === "playing" && state.turn === seat && state.contract && state.trick.length < 4 ? legalCards(state.hands[seat], state.trick, state.contract) : [],
  };
}

export function isPlayerView(value: unknown): value is PlayerView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<PlayerView>;
  return typeof view.phase === "string" && typeof view.seat === "number" && Array.isArray(view.hand) && view.hand.length <= 8 && Array.isArray(view.handCounts) && view.handCounts.length === 4 && Array.isArray(view.scores) && view.scores.length === 2 && Array.isArray(view.legalCards);
}
