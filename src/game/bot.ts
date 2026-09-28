import { cardPoints } from "./cards.ts";
import { availableDeclarations } from "./declarations.ts";
import { contracts } from "./state.ts";
import { legalCards } from "./rules.ts";
import { cardId, teamOf, type BidAction, type Command, type Contract, type PlayerView } from "./types.ts";

function handValue(view: PlayerView, contract: Contract): number {
  return view.hand.reduce((sum, card) => sum + cardPoints(card, contract), 0);
}

function availableBids(view: PlayerView): BidAction[] {
  const result: BidAction[] = [{ type: "pass" }];
  if (view.multiplier === 1) {
    const current = view.contract ? contracts.indexOf(view.contract) : -1;
    result.push(...contracts.slice(current + 1).map((contract) => ({ type: "bid", contract }) as BidAction));
    if (view.contract && view.bidder !== null && teamOf(view.bidder) !== teamOf(view.seat)) result.push({ type: "double" });
  } else if (view.multiplier === 2 && view.bidder !== null && teamOf(view.bidder) === teamOf(view.seat)) result.push({ type: "redouble" });
  return result;
}

function shouldAnnounceBelot(view: PlayerView, card: PlayerView["hand"][number]): boolean {
  if (!view.contract || (view.contract !== "all-trump" && view.contract !== card.suit) || (card.rank !== "Q" && card.rank !== "K")) return false;
  const previous = view.belotAnnouncements.filter((item) => item.seat === view.seat && item.suit === card.suit);
  if (!previous.length) return view.hand.some((held) => held.suit === card.suit && held.rank === (card.rank === "Q" ? "K" : "Q"));
  return previous.length === 1 && previous[0].stage === "belot" && previous[0].card !== card.rank;
}

export function botCommand(view: PlayerView): Command | null {
  if (view.turn !== view.seat || view.trick.length === 4) return null;
  if (view.phase === "bidding") {
    const bids = availableBids(view).filter((action): action is Extract<BidAction, { type: "bid" }> => action.type === "bid");
    const ranked = bids.map((action) => ({ action, value: handValue(view, action.contract) })).sort((a, b) => b.value - a.value);
    const best = ranked[0];
    const currentIndex = view.contract ? contracts.indexOf(view.contract) : -1;
    if (best && best.value >= 25 + Math.max(0, currentIndex) * 2) return { type: "bid", seat: view.seat, action: best.action };
    return { type: "bid", seat: view.seat, action: { type: "pass" } };
  }
  if (view.phase === "playing" && view.contract) {
    if (view.hand.length === 8) {
      const declared = new Set(view.declarations.filter((item) => item.seat === view.seat).map((item) => item.id));
      const declaration = availableDeclarations(view.hand, view.contract).find((item) => !declared.has(item.id));
      if (declaration) return { type: "declare", seat: view.seat, declaration: declaration.id };
    }
    const legal = legalCards(view.hand, view.trick, view.contract);
    const partnerSuits = new Set(view.declarations.filter((item) => teamOf(item.seat) === teamOf(view.seat) && item.kind === "run").map((item) => item.suit));
    const opponentSuits = new Set(view.declarations.filter((item) => teamOf(item.seat) !== teamOf(view.seat) && item.kind === "run").map((item) => item.suit));
    for (const item of view.belotAnnouncements.filter((item) => item.stage === "belot")) {
      (teamOf(item.seat) === teamOf(view.seat) ? partnerSuits : opponentSuits).add(item.suit);
    }
    const chosen = view.hand.filter((card) => legal.includes(cardId(card))).sort((a, b) => {
      const strategic = (card: typeof a) => cardPoints(card, view.contract!) + (view.trick.length === 0 && opponentSuits.has(card.suit) ? 20 : 0) - (view.trick.length === 0 && partnerSuits.has(card.suit) ? 20 : 0);
      return strategic(a) - strategic(b);
    })[0];
    return chosen ? { type: "play", seat: view.seat, card: cardId(chosen), announceBelot: shouldAnnounceBelot(view, chosen) || undefined } : null;
  }
  return null;
}
