import assert from "node:assert/strict";
import test from "node:test";
import { createDeck } from "../src/game/cards.ts";
import { legalCards, trickWinner } from "../src/game/rules.ts";
import { applyCommand, collectTrick, createGame, viewForSeat } from "../src/game/state.ts";
import { cardId, type Card, type PlayedCard, type Seat } from "../src/game/types.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

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
