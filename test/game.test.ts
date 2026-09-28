import assert from "node:assert/strict";
import test from "node:test";
import { botCommand } from "../src/game/bot.ts";
import { createDeck } from "../src/game/cards.ts";
import { availableDeclarations, resolveDeclarations } from "../src/game/declarations.ts";
import { legalCards, trickWinner } from "../src/game/rules.ts";
import { applyCommand, collectTrick, createGame, viewForSeat } from "../src/game/state.ts";
import { cardId, type Card, type GameState, type PlayedCard, type PublicDeclaration, type Seat } from "../src/game/types.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

function playingGame(hands: GameState["hands"], contract: GameState["contract"] = "hearts"): GameState {
  return {
    ...createGame(() => 0.3), phase: "playing", turn: 0, hands, remaining: [[], [], [], []], contract, bidder: 0,
    declarations: [], belotAnnouncements: [], declarationPoints: [0, 0], belotPoints: [0, 0],
  };
}

test("deck and first deal contain every card exactly once in 3+2 plus reserved 3", () => {
  const game = createGame(() => 0.37);
  assert.deepEqual(game.hands.map((hand) => hand.length), [5, 5, 5, 5]);
  assert.deepEqual(game.remaining.map((hand) => hand.length), [3, 3, 3, 3]);
  const ids = [...game.hands.flat(), ...game.remaining.flat()].map(cardId);
  assert.equal(new Set(ids).size, 32);
  assert.equal(createDeck().length, 32);
});

test("four passes redeal and move the dealer counterclockwise", () => {
  let game = createGame(() => 0.2);
  for (const seat of [0, 1, 2, 3] as Seat[]) game = applyCommand(game, { type: "bid", seat, action: { type: "pass" } }, () => 0.4);
  assert.equal(game.dealer, 0);
  assert.equal(game.dealNumber, 2);
  assert.equal(game.phase, "bidding");
});

test("auction finishes after a contract and three passes, then deals the last three", () => {
  let game = createGame(() => 0.1);
  game = applyCommand(game, { type: "bid", seat: 0, action: { type: "bid", contract: "hearts" } });
  for (const seat of [1, 2, 3] as Seat[]) game = applyCommand(game, { type: "bid", seat, action: { type: "pass" } });
  assert.equal(game.phase, "playing");
  assert.deepEqual(game.hands.map((hand) => hand.length), [8, 8, 8, 8]);
  assert.equal(game.contract, "hearts");
});

test("all-trump requires raising in the led suit", () => {
  const hand = [card("hearts", "7"), card("hearts", "J"), card("clubs", "A")];
  const trick: PlayedCard[] = [{ seat: 0, card: card("hearts", "9") }];
  assert.deepEqual(legalCards(hand, trick, "all-trump"), ["hearts-J"]);
});

test("suit contract requires trumping an opponent but permits discard when partner wins", () => {
  const hand = [card("spades", "7"), card("clubs", "A")];
  const opponentWinning: PlayedCard[] = [{ seat: 0, card: card("hearts", "A") }];
  assert.deepEqual(legalCards(hand, opponentWinning, "spades"), ["spades-7"]);
  const partnerWinning: PlayedCard[] = [{ seat: 3, card: card("hearts", "A") }, { seat: 0, card: card("hearts", "7") }];
  assert.deepEqual(legalCards(hand, partnerWinning, "spades").sort(), ["clubs-A", "spades-7"]);
});

test("trump wins a trick and trump jack beats trump nine", () => {
  const trick: PlayedCard[] = [
    { seat: 0, card: card("hearts", "A") }, { seat: 1, card: card("spades", "9") },
    { seat: 2, card: card("spades", "J") }, { seat: 3, card: card("hearts", "10") },
  ];
  assert.equal(trickWinner(trick, "spades"), 2);
});

test("seat projection never exposes the other three hands", () => {
  const game = createGame(() => 0.7);
  const view = viewForSeat(game, 2);
  assert.deepEqual(view.hand, game.hands[2]);
  assert.equal("hands" in view, false);
  assert.deepEqual(view.handCounts, [5, 5, 5, 5]);
});

test("a complete deal reaches scoring using only legal commands", () => {
  let game = createGame(() => 0.63);
  game = applyCommand(game, { type: "bid", seat: 0, action: { type: "bid", contract: "clubs" } });
  for (const seat of [1, 2, 3] as Seat[]) game = applyCommand(game, { type: "bid", seat, action: { type: "pass" } });
  let safety = 40;
  while (game.phase === "playing" && safety-- > 0) {
    if (game.trick.length === 4) {
      game = collectTrick(game);
      continue;
    }
    const view = viewForSeat(game, game.turn);
    game = applyCommand(game, { type: "play", seat: game.turn, card: view.legalCards[0] });
  }
  assert.equal(game.phase, "deal-end");
  assert.equal(game.captured[0].length + game.captured[1].length, 32);
  assert.equal(game.tricksWon[0] + game.tricksWon[1], 8);
  assert.ok(game.result);
});

test("keeps all four cards visible until the completed trick is collected", () => {
  let game = createGame(() => 0.51);
  game = applyCommand(game, { type: "bid", seat: 0, action: { type: "bid", contract: "all-trump" } });
  for (const seat of [1, 2, 3] as Seat[]) game = applyCommand(game, { type: "bid", seat, action: { type: "pass" } });
  for (let play = 0; play < 4; play++) {
    const view = viewForSeat(game, game.turn);
    game = applyCommand(game, { type: "play", seat: game.turn, card: view.legalCards[0] });
  }
  const winner = game.turn;
  assert.equal(game.trick.length, 4);
  assert.deepEqual(viewForSeat(game, winner).legalCards, []);
  game = collectTrick(game);
  assert.equal(game.trick.length, 0);
  assert.equal(game.turn, winner);
});

test("declarations are explicit, public, and validated against the announcing hand", () => {
  const hands: GameState["hands"] = [
    [card("hearts", "7"), card("hearts", "8"), card("hearts", "9"), card("clubs", "7"), card("clubs", "8"), card("diamonds", "7"), card("spades", "7"), card("spades", "8")],
    Array(8).fill(card("clubs", "A")), Array(8).fill(card("diamonds", "A")), Array(8).fill(card("spades", "A")),
  ];
  const game = playingGame(hands);
  const option = availableDeclarations(hands[0], "hearts").find((item) => item.kind === "run");
  assert.ok(option);
  const declared = applyCommand(game, { type: "declare", seat: 0, declaration: option.id });
  assert.equal(declared.declarations.length, 1);
  assert.equal(viewForSeat(declared, 3).declarations[0].high, "9");
  assert.deepEqual(declared.declarationPoints, [0, 0], "points wait until every player has had a chance to announce");
  assert.equal(applyCommand(game, { type: "declare", seat: 0, declaration: "quad-J" }), game);
  const afterPlay = applyCommand(declared, { type: "play", seat: 0, card: "clubs-7" });
  assert.equal(applyCommand(afterPlay, { type: "declare", seat: 0, declaration: option.id }), afterPlay, "late declarations are rejected");
  let resolved = afterPlay;
  for (const seat of [1, 2, 3] as Seat[]) resolved = applyCommand(resolved, { type: "play", seat, card: viewForSeat(resolved, seat).legalCards[0] });
  assert.deepEqual(resolved.declarationPoints, [20, 0]);
  assert.equal(resolved.declarations[0].status, "won");
});

test("a longer run beats a shorter run ending in a higher card", () => {
  const declarations: PublicDeclaration[] = [
    { id: "run-hearts-K-4", seat: 0, kind: "run", suit: "hearts", high: "K", length: 4, points: 50, status: "pending" },
    { id: "run-spades-A-3", seat: 1, kind: "run", suit: "spades", high: "A", length: 3, points: 20, status: "pending" },
  ];
  const resolved = resolveDeclarations(declarations);
  assert.deepEqual(resolved.scores, [50, 0]);
  assert.deepEqual(resolved.declarations.map((item) => item.status), ["won", "lost"]);
  assert.deepEqual(availableDeclarations([card("hearts", "7"), card("hearts", "8"), card("hearts", "9")], "no-trump"), []);
});

test("belot scores only after valid public belot and rebelot plays", () => {
  const hands: GameState["hands"] = [
    [card("hearts", "Q"), card("hearts", "K"), card("clubs", "7"), card("clubs", "8"), card("diamonds", "7"), card("diamonds", "8"), card("spades", "7"), card("spades", "8")],
    [card("clubs", "9"), card("clubs", "10"), card("diamonds", "9"), card("diamonds", "10"), card("spades", "9"), card("spades", "10"), card("clubs", "J"), card("diamonds", "J")],
    [card("clubs", "Q"), card("clubs", "K"), card("diamonds", "Q"), card("diamonds", "K"), card("spades", "Q"), card("spades", "K"), card("clubs", "A"), card("diamonds", "A")],
    [card("clubs", "7"), card("clubs", "8"), card("diamonds", "7"), card("diamonds", "8"), card("spades", "7"), card("spades", "8"), card("spades", "J"), card("spades", "A")],
  ];
  let omitted = playingGame(hands.map((hand) => hand.map((item) => ({ ...item }))) as GameState["hands"]);
  omitted = applyCommand(omitted, { type: "play", seat: 0, card: "hearts-Q" });
  for (const seat of [1, 2, 3] as Seat[]) omitted = applyCommand(omitted, { type: "play", seat, card: viewForSeat(omitted, seat).legalCards[0] });
  omitted = collectTrick(omitted);
  assert.equal(applyCommand(omitted, { type: "play", seat: 0, card: "hearts-K", announceBelot: true }), omitted, "rebelot cannot be claimed when belot was omitted");

  let game = playingGame(hands);
  game = applyCommand(game, { type: "play", seat: 0, card: "hearts-Q", announceBelot: true });
  assert.equal(game.belotAnnouncements[0].stage, "belot");
  assert.deepEqual(game.belotPoints, [0, 0]);
  for (const seat of [1, 2, 3] as Seat[]) game = applyCommand(game, { type: "play", seat, card: viewForSeat(game, seat).legalCards[0] });
  game = collectTrick(game);
  assert.equal(game.turn, 0);
  game = applyCommand(game, { type: "play", seat: 0, card: "hearts-K", announceBelot: true });
  assert.equal(game.belotAnnouncements[1].stage, "rebelot");
  assert.deepEqual(game.belotPoints, [20, 0]);
});

test("bots use only their player view and react to a partner's public run", () => {
  const hands: GameState["hands"] = [
    [card("clubs", "7"), card("hearts", "7"), card("diamonds", "A"), card("spades", "A"), card("clubs", "A"), card("hearts", "A"), card("diamonds", "10")],
    Array(7).fill(card("clubs", "8")), Array(7).fill(card("diamonds", "8")), Array(7).fill(card("spades", "8")),
  ];
  const game = playingGame(hands);
  const plain = botCommand(viewForSeat(game, 0));
  assert.equal(plain?.type === "play" && plain.card, "clubs-7");
  game.declarations = [{ id: "run-hearts-9-3", seat: 2, kind: "run", suit: "hearts", high: "9", length: 3, points: 20, status: "won" }];
  const informed = botCommand(viewForSeat(game, 0));
  assert.equal(informed?.type === "play" && informed.card, "hearts-7");
  assert.equal("hands" in viewForSeat(game, 0), false);
});
