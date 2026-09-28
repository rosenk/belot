import { ranks, suits, teamOf, type Card, type Contract, type DeclarationOption, type PublicDeclaration } from "./types.ts";

interface DetectedDeclaration extends DeclarationOption { highIndex: number; cards: Set<string> }

const rankIndex = new Map(ranks.map((rank, index) => [rank, index]));
const quadPoints: Partial<Record<(typeof ranks)[number], number>> = { "10": 100, Q: 100, K: 100, A: 100, "9": 150, J: 200 };

export function availableDeclarations(hand: Card[], contract: Contract): DeclarationOption[] {
  if (contract === "no-trump") return [];
  const declarations: DetectedDeclaration[] = [];
  for (const suit of suits) {
    const indexes = hand.filter((card) => card.suit === suit).map((card) => rankIndex.get(card.rank)!).sort((a, b) => a - b);
    let start = 0;
    for (let index = 1; index <= indexes.length; index++) {
      if (index < indexes.length && indexes[index] === indexes[index - 1] + 1) continue;
      const run = indexes.slice(start, index);
      if (run.length >= 3) {
        const points = run.length >= 5 ? 100 : run.length === 4 ? 50 : 20;
        const highIndex = run.at(-1)!;
        declarations.push({ id: `run-${suit}-${ranks[highIndex]}-${run.length}`, kind: "run", suit, points, high: ranks[highIndex], highIndex, length: run.length, cards: new Set(run.map((rank) => `${suit}-${ranks[rank]}`)) });
      }
      start = index;
    }
  }
  for (const rank of ranks) {
    const points = quadPoints[rank];
    if (points && suits.every((suit) => hand.some((card) => card.suit === suit && card.rank === rank))) {
      declarations.push({ id: `quad-${rank}`, kind: "quad", suit: null, points, high: rank, highIndex: rankIndex.get(rank)!, length: 4, cards: new Set(suits.map((suit) => `${suit}-${rank}`)) });
    }
  }
  const quads = declarations.filter((item) => item.kind === "quad");
  return declarations
    .filter((item) => item.kind === "quad" || !quads.some((quad) => [...item.cards].some((card) => quad.cards.has(card)) && quad.points >= item.points))
    .map(({ cards: _cards, highIndex: _highIndex, ...item }) => item);
}

function strength(item: PublicDeclaration): [number, number] {
  return item.kind === "run" ? [item.length, rankIndex.get(item.high)!] : [item.points, rankIndex.get(item.high)!];
}

function compare(left: PublicDeclaration, right: PublicDeclaration): number {
  const a = strength(left);
  const b = strength(right);
  return a[0] - b[0] || a[1] - b[1];
}

export function resolveDeclarations(all: PublicDeclaration[]): { declarations: PublicDeclaration[]; scores: [number, number] } {
  const result: [number, number] = [0, 0];
  const winners = new Set<string>();
  for (const kind of ["run", "quad"] as const) {
    const group = all.filter((item) => item.kind === kind);
    if (!group.length) continue;
    const best = group.reduce((current, item) => compare(item, current) > 0 ? item : current);
    const winningTeams = new Set(group.filter((item) => compare(item, best) === 0).map((item) => teamOf(item.seat)));
    if (winningTeams.size !== 1) continue;
    const team = [...winningTeams][0];
    for (const item of group.filter((item) => teamOf(item.seat) === team)) winners.add(`${item.seat}:${item.id}`);
    result[team] += group.filter((item) => teamOf(item.seat) === team).reduce((sum, item) => sum + item.points, 0);
  }
  return {
    declarations: all.map((item) => ({ ...item, status: winners.has(`${item.seat}:${item.id}`) ? "won" : "lost" })),
    scores: result,
  };
}
