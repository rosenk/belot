<script lang="ts">
  import { coachHint } from "../game/coach.ts";
  import type { CardId, PlayerView } from "../game/types.ts";

  let { view, canAct = false, belotStage = null, onselect }: { view: PlayerView; canAct?: boolean; belotStage?: "belot" | "rebelot" | null; onselect?: (card: CardId) => void } = $props();
  const hint = $derived(coachHint(view));
</script>

<aside class="coach-note" aria-label="Насоки за начинаещи">
  <small>ПОМОЩ ЗА НАЧИНАЕЩИ</small>
  <b>{hint.title}</b>
  <p>{hint.explanation}</p>
  {#if belotStage}
    <p class="coach-reminder">{belotStage === "belot" ? "Имате Q и K от една козова боя. Изберете „Белот и изиграй“ с тази карта. Когато играете другата, обявете и ребелот, за да получите 20 т." : "Вече сте обявили белот с първата карта от двойката Q и K. Сега изберете „Ребелот и изиграй“, за да получите 20 т."}</p>
  {/if}
  {#if canAct && hint.suggestion}
    {#key view}
      <details class="coach-idea">
        <summary>Идея за ход</summary>
        <b>{hint.suggestion.label}</b>
        <p>{hint.suggestion.reason}</p>
        <small>Ориентир само по вашите карти и видимото на масата.</small>
        {#if hint.suggestion.card && onselect}
          <button onclick={() => onselect?.(hint.suggestion!.card!)}>Покажи картата</button>
        {/if}
      </details>
    {/key}
  {/if}
</aside>
