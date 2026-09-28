<script lang="ts">
  import { cardId, type Card as CardType } from "../game/types.ts";

  let { card, playable = false, compact = false, onclick }: { card: CardType; playable?: boolean; compact?: boolean; onclick?: () => void } = $props();
  const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
  const names = { clubs: "спатия", diamonds: "каро", hearts: "купа", spades: "пика" } as const;
  const red = $derived(card.suit === "diamonds" || card.suit === "hearts");
</script>

<button
  class:playable
  class:compact
  class:red
  class="card"
  disabled={!playable}
  aria-label={`${card.rank} ${names[card.suit]}${playable ? ", може да се играе" : ""}`}
  data-card={cardId(card)}
  {onclick}
>
  <span class="corner"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
  <span class="suit">{symbols[card.suit]}</span>
</button>
