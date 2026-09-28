import { cardPoints } from "./cards.ts";
import { availableBids, contracts } from "./state.ts";
import { legalCards } from "./rules.ts";
import { cardId, type BidAction, type Command, type Contract, type GameState, type Seat } from "./types.ts";

function handValue(state: GameState, seat: Seat, contract: Contract): number {
  return state.hands[seat].reduce((sum, card) => sum + cardPoints(card, contract), 0);
}

export function botCommand(state: GameState, seat: Seat): Command | null {
  if (state.turn !== seat || state.trick.length === 4) return null;
  if (state.phase === "bidding") {
    const legal = availableBids(state, seat);
    const bids = legal.filter((action): action is Extract<BidAction, { type: "bid" }> => action.type === "bid");
    const ranked = bids.map((action) => ({ action, value: handValue(state, seat, action.contract) })).sort((a, b) => b.value - a.value);
    const best = ranked[0];
    const currentIndex = state.contract ? contracts.indexOf(state.contract) : -1;
    if (best && best.value >= 25 + Math.max(0, currentIndex) * 2) return { type: "bid", seat, action: best.action };
    return { type: "bid", seat, action: { type: "pass" } };
  }
  if (state.phase === "playing" && state.contract) {
    const legal = legalCards(state.hands[seat], state.trick, state.contract);
    const chosen = state.hands[seat].filter((card) => legal.includes(cardId(card))).sort((a, b) => cardPoints(a, state.contract!) - cardPoints(b, state.contract!))[0];
    return chosen ? { type: "play", seat, card: cardId(chosen) } : null;
  }
  return null;
}
