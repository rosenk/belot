import { cardId, ranks, suits, type Card, type Contract, type Rank } from "./types.ts";

const plainOrder: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const trumpOrder: Rank[] = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const plainPoints: Record<Rank, number> = { "7": 0, "8": 0, "9": 0, "10": 10, J: 2, Q: 3, K: 4, A: 11 };
const trumpPoints: Record<Rank, number> = { "7": 0, "8": 0, "9": 14, "10": 10, J: 20, Q: 3, K: 4, A: 11 };

export function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
}

export function shuffle(deck: Card[], random: () => number = Math.random): Card[] {
  const result = deck.map((card) => ({ ...card }));
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function isTrump(card: Card, contract: Contract): boolean {
  return contract === "all-trump" || card.suit === contract;
}

export function strength(card: Card, contract: Contract): number {
  return (isTrump(card, contract) ? trumpOrder : plainOrder).indexOf(card.rank);
}

export function cardPoints(card: Card, contract: Contract): number {
  const points = isTrump(card, contract) ? trumpPoints[card.rank] : plainPoints[card.rank];
  return contract === "no-trump" ? points * 2 : points;
}

export function sameCard(left: Card, right: Card): boolean {
  return cardId(left) === cardId(right);
}
