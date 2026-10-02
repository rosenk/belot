import assert from "node:assert/strict";
import test from "node:test";
import { coachHint } from "../src/game/coach.ts";
import { availableDeclarations } from "../src/game/declarations.ts";
import { botCommand } from "../src/game/bot.ts";
import { applyCommand, collectTrick, createGame, viewForSeat } from "../src/game/state.ts";
import { type Card, type Contract, type GameState, type PlayedCard } from "../src/game/types.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });
function position(hand: Card[], trick: PlayedCard[] = [], contract: Contract = "hearts"): GameState {
  return { ...createGame(() => 0.31), phase: "playing", contract, bidder: 0, turn: 0, hands: [hand, [], [], []], remaining: [[], [], [], []], trick };
}
const hint = (game: GameState) => coachHint(viewForSeat(game, 0));

test("coach follows suit and takes an opponent's trick with the cheapest winning legal card", () => {
  const game = position([card("clubs", "7"), card("clubs", "Q"), card("clubs", "A"), card("hearts", "7")], [{ seat: 3, card: card("clubs", "J") }]);
  assert.equal(hint(game).suggestion?.card, "clubs-Q");
  assert.match(hint(game).explanation, /трябва да отговорите с нея/);
  assert.match(hint(game).suggestion!.reason, /ще печелите ръката засега/);
  game.trick[0].card = card("clubs", "A");
  assert.equal(hint(game).suggestion?.card, "clubs-7");
  assert.match(hint(game).suggestion!.reason, /Нито една карта.*не бие/);
});

test("all-trump requires raising even a partner, but does not require an impossible raise", () => {
  const game = position([card("clubs", "7"), card("clubs", "J"), card("spades", "7")], [{ seat: 2, card: card("clubs", "9") }, { seat: 3, card: card("clubs", "Q") }], "all-trump");
  assert.equal(hint(game).suggestion?.card, "clubs-J");
  assert.match(hint(game).explanation, /задължително дори ако партньорът ви печели/);
  game.hands[0][1] = card("clubs", "A");
  assert.equal(hint(game).suggestion?.card, "clubs-7");
  assert.match(hint(game).explanation, /Нямате карта, която бие/);
});

test("partner protection and compulsory trumping give different advice from the same hand", () => {
  const game = position([card("hearts", "7"), card("diamonds", "7"), card("diamonds", "A")], [{ seat: 2, card: card("clubs", "A") }, { seat: 3, card: card("clubs", "7") }]);
  assert.equal(hint(game).suggestion?.card, "diamonds-7");
  assert.match(hint(game).explanation, /Не сте длъжни да цакате/);
  game.trick = [{ seat: 3, card: card("clubs", "A") }];
  assert.equal(hint(game).suggestion?.card, "hearts-7");
  assert.match(hint(game).explanation, /Трябва да цакате/);
});

test("overtrumping is required only when a higher trump exists", () => {
  const game = position([card("hearts", "9"), card("spades", "7")], [{ seat: 1, card: card("clubs", "A") }, { seat: 2, card: card("clubs", "7") }, { seat: 3, card: card("hearts", "A") }]);
  assert.equal(hint(game).suggestion?.card, "hearts-9");
  assert.match(hint(game).explanation, /трябва да го изиграете.*надцакване/);
  game.trick[2].card = card("hearts", "J");
  assert.equal(hint(game).suggestion?.card, "spades-7");
  assert.match(hint(game).explanation, /нямате по-силен коз/);
});

test("no-trump and all-trump allow discarding when void, not winning with a different suit", () => {
  for (const contract of ["no-trump", "all-trump"] as const) {
    const game = position([card("hearts", "J"), card("spades", "7")], [{ seat: 3, card: card("clubs", "7") }], contract);
    assert.equal(hint(game).suggestion?.card, "spades-7");
    assert.match(hint(game).explanation, /друга боя не може да спечели/);
  }
});

test("declaration advice disappears after announcement or after the first card", () => {
  const hand = [card("clubs", "7"), card("clubs", "8"), card("clubs", "9"), card("diamonds", "A"), card("diamonds", "7"), card("spades", "K"), card("spades", "7"), card("hearts", "J")];
  const game = position(hand);
  assert.equal(hint(game).suggestion?.label, "Обявете комбинацията си");
  assert.match(hint(game).suggestion!.reason, /20 т/);
  game.declarations = availableDeclarations(hand, "hearts").map((option) => ({ ...option, seat: 0, status: "pending" }));
  assert.equal(hint(game).suggestion?.card, "clubs-7");
  game.declarations = [];
  game.hands[0] = hand.slice(0, 7);
  assert.equal(hint(game).suggestion?.card, "clubs-7");
});

test("completed tricks explain the actual trump winner; waiting never suggests an action", () => {
  const game = position([card("clubs", "7")], [{ seat: 0, card: card("clubs", "A") }, { seat: 1, card: card("hearts", "9") }, { seat: 2, card: card("hearts", "J") }, { seat: 3, card: card("clubs", "10") }]);
  assert.equal(hint(game).title, "Партньорът ви взема ръката");
  assert.match(hint(game).explanation, /J♥/);
  assert.equal(hint(game).suggestion, undefined);
  game.trick = [];
  game.turn = 1;
  assert.equal(hint(game).suggestion, undefined);
});

test("bidding advice handles weak hands, strong hands and blocked higher bids honestly", () => {
  const game = createGame(() => 0.31);
  game.hands[0] = [card("clubs", "7"), card("diamonds", "7"), card("hearts", "8"), card("spades", "7"), card("clubs", "8")];
  assert.equal(hint(game).suggestion?.label, "Може да пасувате");
  game.hands[0] = [card("hearts", "J"), card("hearts", "9"), card("hearts", "A"), card("clubs", "7"), card("clubs", "8")];
  assert.equal(hint(game).suggestion?.label, "Помислете за купа");
  game.contract = "all-trump";
  assert.match(hint(game).explanation, /най-високата обява/);
  assert.equal(hint(game).suggestion?.label, "Може да пасувате");
  game.contract = "hearts";
  game.bidder = 0;
  game.multiplier = 2;
  assert.match(hint(game).explanation, /реконтра/);
  assert.match(hint(game).suggestion!.reason, /Няма позволена по-висока обява/);
  game.turn = 1;
  assert.equal(hint(game).suggestion, undefined);
});

test("result explanation distinguishes failure, equality and doubled results for a guest seat", () => {
  const game = { ...position([]), phase: "deal-end" as const, result: { raw: [70, 92] as [number, number], written: [0, 16] as [number, number], contractMade: false, summary: "" } };
  const guest = viewForSeat(game, 1);
  assert.match(coachHint(guest).explanation, /Другият отбор.*„вътре“/);
  guest.multiplier = 2;
  assert.match(coachHint(guest).explanation, /целия резултат ×2/);
  guest.result!.raw = [81, 81];
  assert.match(coachHint(guest).explanation, /Точките са равни/);
  assert.equal(coachHint(guest).suggestion, undefined);
});

test("coach cannot change the view or use hidden hands, and recommends legal cards throughout a deal", () => {
  let game = createGame(() => 0.63);
  const before = structuredClone(game);
  const advice = hint(game);
  game.hands[1] = [card("clubs", "A")];
  game.remaining[0] = [card("spades", "J")];
  assert.deepEqual(hint(game), advice);
  game = before;
  game = applyCommand(game, { type: "bid", seat: 0, action: { type: "bid", contract: "spades" } });
  for (const seat of [1, 2, 3] as const) game = applyCommand(game, { type: "bid", seat, action: { type: "pass" } });
  while (game.phase === "playing") {
    if (game.trick.length === 4) { game = collectTrick(game); continue; }
    const view = viewForSeat(game, game.turn);
    const original = structuredClone(view);
    const suggestion = coachHint(view).suggestion;
    assert.deepEqual(view, original);
    if (suggestion?.card) assert.ok(view.legalCards.includes(suggestion.card));
    const command = botCommand(view)!;
    const next = applyCommand(game, command);
    assert.notEqual(next, game);
    game = next;
  }
  assert.equal(game.phase, "deal-end");
});
