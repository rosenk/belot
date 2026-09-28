<script lang="ts">
  import { cardId, type Card as CardType } from "../game/types.ts";

  let { card, playable = false, compact = false, selected = false, onclick, onplay }: { card: CardType; playable?: boolean; compact?: boolean; selected?: boolean; onclick?: () => void; onplay?: () => void } = $props();
  const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
  const names = { clubs: "спатия", diamonds: "каро", hearts: "купа", spades: "пика" } as const;
  const red = $derived(card.suit === "diamonds" || card.suit === "hearts");
  let startY = 0;
  let dragY = $state(0);
  let dragging = $state(false);
  let suppressClick = false;

  function pointerDown(event: PointerEvent): void {
    if (!playable) return;
    startY = event.clientY;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent): void {
    if (!dragging) return;
    dragY = Math.max(-72, Math.min(0, event.clientY - startY));
    if (dragY < -4) event.preventDefault();
  }

  function pointerUp(): void {
    if (!dragging) return;
    const shouldPlay = dragY <= -44;
    dragging = false;
    dragY = 0;
    if (shouldPlay) {
      suppressClick = true;
      onplay?.();
    }
  }

  function pointerCancel(): void { dragging = false; dragY = 0; }
  function click(): void {
    if (suppressClick) { suppressClick = false; return; }
    onclick?.();
  }
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
    class:dragging
    class:red
    class="card"
    disabled={!playable}
    aria-pressed={selected}
    aria-label={`${card.rank} ${names[card.suit]}${playable ? ", може да се изиграе с плъзгане нагоре" : ", не може да се играе сега"}`}
    data-card={cardId(card)}
    style:--drag-y={`${dragY}px`}
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerCancel}
    onclick={click}
  >
    <span class="corner"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
    <span class="suit">{symbols[card.suit]}</span>
    <span class="corner bottom" aria-hidden="true"><b>{card.rank}</b><span>{symbols[card.suit]}</span></span>
    {#if playable}<span class="legal-mark" aria-hidden="true">↑</span>{/if}
  </button>
{/if}
