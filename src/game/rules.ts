import { cardId, teamOf, type Card, type CardId, type Contract, type PlayedCard, type Seat } from "./types.ts";
import { isTrump, strength } from "./cards.ts";

export function trickWinner(trick: PlayedCard[], contract: Contract): Seat {
  if (!trick.length) throw new Error("Празна ръка");
  return trick.reduce((winner, candidate) => {
    const current = winner.card;
    const card = candidate.card;
    if (contract !== "no-trump" && contract !== "all-trump") {
      if (isTrump(card, contract) !== isTrump(current, contract)) return isTrump(card, contract) ? candidate : winner;
    }
    if (card.suit !== current.suit) return winner;
    return strength(card, contract) > strength(current, contract) ? candidate : winner;
  }).seat;
}

export function legalCards(hand: Card[], trick: PlayedCard[], contract: Contract): CardId[] {
  if (!trick.length) return hand.map(cardId);
  const leadSuit = trick[0].card.suit;
  const following = hand.filter((card) => card.suit === leadSuit);

  if (following.length) {
    const mustRaise = contract === "all-trump" || contract === leadSuit;
    if (!mustRaise) return following.map(cardId);
    const highest = Math.max(...trick.filter((play) => play.card.suit === leadSuit).map((play) => strength(play.card, contract)));
    const higher = following.filter((card) => strength(card, contract) > highest);
    return (higher.length ? higher : following).map(cardId);
  }

  if (contract === "no-trump" || contract === "all-trump") return hand.map(cardId);
  const currentWinner = trickWinner(trick, contract);
  const actingSeat = ((trick[0].seat + trick.length) % 4) as Seat;
  if (teamOf(currentWinner) === teamOf(actingSeat)) return hand.map(cardId);
  const trumps = hand.filter((card) => isTrump(card, contract));
  if (!trumps.length) return hand.map(cardId);
  const playedTrumps = trick.filter((play) => isTrump(play.card, contract));
  if (!playedTrumps.length) return trumps.map(cardId);
  const highest = Math.max(...playedTrumps.map((play) => strength(play.card, contract)));
  const higher = trumps.filter((card) => strength(card, contract) > highest);
  return (higher.length ? higher : hand).map(cardId);
}
