import { ranks, suits, teamOf, type Card, type Contract, type Seat, type Team } from "./types.ts";

interface Declaration { kind: "run" | "quad"; points: number; high: number; cards: Set<string>; team: Team }

const rankIndex = new Map(ranks.map((rank, index) => [rank, index]));
const quadPoints: Partial<Record<(typeof ranks)[number], number>> = { "10": 100, Q: 100, K: 100, A: 100, "9": 150, J: 200 };

function declarationsFor(hand: Card[], seat: Seat): Declaration[] {
  const declarations: Declaration[] = [];
  for (const suit of suits) {
    const indexes = hand.filter((card) => card.suit === suit).map((card) => rankIndex.get(card.rank)!).sort((a, b) => a - b);
    let start = 0;
    for (let index = 1; index <= indexes.length; index++) {
      if (index < indexes.length && indexes[index] === indexes[index - 1] + 1) continue;
      const run = indexes.slice(start, index);
      if (run.length >= 3) {
        const points = run.length >= 5 ? 100 : run.length === 4 ? 50 : 20;
        declarations.push({ kind: "run", points, high: run.at(-1)!, cards: new Set(run.map((rank) => `${suit}-${ranks[rank]}`)), team: teamOf(seat) });
      }
      start = index;
    }
  }
  for (const rank of ranks) {
    const points = quadPoints[rank];
    if (points && suits.every((suit) => hand.some((card) => card.suit === suit && card.rank === rank))) {
      declarations.push({ kind: "quad", points, high: points, cards: new Set(suits.map((suit) => `${suit}-${rank}`)), team: teamOf(seat) });
    }
  }
  const quads = declarations.filter((item) => item.kind === "quad");
  return declarations.filter((item) => item.kind === "quad" || !quads.some((quad) => [...item.cards].some((card) => quad.cards.has(card)) && quad.points >= item.points));
}

export function declarationScores(hands: [Card[], Card[], Card[], Card[]], contract: Contract): [number, number] {
  if (contract === "no-trump") return [0, 0];
  const all = hands.flatMap((hand, seat) => declarationsFor(hand, seat as Seat));
  const result: [number, number] = [0, 0];
  for (const kind of ["run", "quad"] as const) {
    const group = all.filter((item) => item.kind === kind);
    if (!group.length) continue;
    const best = Math.max(...group.map((item) => item.high));
    const winningTeams = new Set(group.filter((item) => item.high === best).map((item) => item.team));
    if (winningTeams.size !== 1) continue;
    const team = [...winningTeams][0];
    result[team] += group.filter((item) => item.team === team).reduce((sum, item) => sum + item.points, 0);
  }
  return result;
}

export function belotScores(hands: [Card[], Card[], Card[], Card[]], contract: Contract): [number, number] {
  if (contract === "no-trump") return [0, 0];
  const result: [number, number] = [0, 0];
  for (let seat = 0; seat < 4; seat++) {
    for (const suit of suits) {
      if (contract !== "all-trump" && contract !== suit) continue;
      if (["Q", "K"].every((rank) => hands[seat as Seat].some((card) => card.suit === suit && card.rank === rank))) result[teamOf(seat as Seat)] += 20;
    }
  }
  return result;
}
