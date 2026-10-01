<script lang="ts">
  import { cardId, type Card as CardType } from "../game/types.ts";

  let { card, playable = false, compact = false, selected = false, onclick }: { card: CardType; playable?: boolean; compact?: boolean; selected?: boolean; onclick?: () => void } = $props();
  const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
  const names = { clubs: "спатия", diamonds: "каро", hearts: "купа", spades: "пика" } as const;
  const red = $derived(card.suit === "diamonds" || card.suit === "hearts");
</script>

{#if compact}
  <div class:red class="card compact" role="img" aria-label={`${card.rank} ${names[card.suit]}`} data-card={cardId(card)}>
    <span class="corner"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
    <span class="suit">{symbols[card.suit]}</span>
    <span class="corner bottom" aria-hidden="true"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
  </div>
{:else}
  <button
    class:playable
    class:selected
    class:red
    class="card"
    disabled={!playable}
    aria-pressed={selected}
    aria-label={`${card.rank} ${names[card.suit]}${playable ? ", може да се избере" : ", не може да се играе сега"}`}
    data-card={cardId(card)}
    {onclick}
  >
    <span class="corner"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
    <span class="suit">{symbols[card.suit]}</span>
    <span class="corner bottom" aria-hidden="true"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
  </button>
{/if}
