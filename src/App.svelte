<script lang="ts">
  import { onMount } from "svelte";
  import Card from "./components/Card.svelte";
  import { botCommand } from "./game/bot.ts";
  import { applyCommand, availableBids, collectTrick, contracts, createGame, viewForSeat } from "./game/state.ts";
  import { trickWinner } from "./game/rules.ts";
  import { cardId, teamOf, type BidAction, type Command, type Contract, type GameState, type PlayerView, type Seat } from "./game/types.ts";
  import { createRoomCode, inviteUrl, isHostRoom, markHostRoom, roomFromUrl } from "./online/room.ts";
  import { configuredMatchmakerUrl, findMatch, type MatchSearch } from "./online/matchmaker.ts";
  import { OnlineSession } from "./online/session.ts";
  import { loadMatch, saveMatch } from "./online/store.ts";

  type Mode = "menu" | "local" | "host" | "guest";
  const initialGame = createGame();
  let mode = $state<Mode>("menu");
  let game = $state<GameState>(initialGame);
  let seat = $state<Seat>(0);
  let view = $state<PlayerView>(viewForSeat(initialGame, 0));
  let room = $state("");
  let session: OnlineSession | null = null;
  let status = $state({ text: "", connected: 0, ready: false });
  let copied = $state(false);
  let matchSearch: MatchSearch | null = null;
  let findingPlayers = $state(false);
  let matchText = $state("");
  let reservations: [string, Seat][] = [];

  const suitSymbol: Record<string, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
  const contractName: Record<Contract, string> = { clubs: "Спатия", diamonds: "Каро", hearts: "Купа", spades: "Пика", "no-trump": "Без коз", "all-trump": "Всичко коз" };
  const seatName = ["Вие", "Дясно", "Партньор", "Ляво"];
  const phaseText = $derived(view.phase === "bidding" ? "Наддаване" : view.phase === "playing" ? "Разиграване" : view.phase === "deal-end" ? "Край на раздаването" : "Край на мача");
  const myTurn = $derived(view.turn === seat && view.trick.length < 4 && (mode === "local" || status.ready));
  const northSeat = $derived(((seat + 2) % 4) as Seat);
  const eastSeat = $derived(((seat + 1) % 4) as Seat);
  const westSeat = $derived(((seat + 3) % 4) as Seat);
  const collector = $derived(view.trick.length === 4 && view.contract ? trickWinner(view.trick, view.contract) : null);
  const collectorPosition = $derived(collector === null ? -1 : (collector - seat + 4) % 4);
  const bidOptions = $derived.by((): BidAction[] => {
    if (mode === "local" || mode === "host") return availableBids(game, seat);
    if (view.phase !== "bidding" || view.turn !== seat) return [];
    const options: BidAction[] = [{ type: "pass" }];
    if (view.multiplier === 1) {
      const index = view.contract ? contracts.indexOf(view.contract) : -1;
      options.push(...contracts.slice(index + 1).map((contract) => ({ type: "bid", contract }) as BidAction));
      if (view.contract && view.bidder !== null && teamOf(view.bidder) !== teamOf(seat)) options.push({ type: "double" });
    } else if (view.multiplier === 2 && view.bidder !== null && teamOf(view.bidder) === teamOf(seat)) options.push({ type: "redouble" });
    return options;
  });

  function applyHost(command: Command): void {
    const next = applyCommand(game, command);
    if (next === game) return;
    game = next;
    view = viewForSeat(next, seat);
    if (room) saveMatch(room, game, reservations);
  }

  function act(command: Command): void {
    if (mode === "guest") session?.send(command);
    else {
      applyHost(command);
      session?.broadcast();
    }
  }

  function startLocal(): void {
    session?.close();
    mode = "local";
    seat = 0;
    const next = createGame();
    game = next;
    view = viewForSeat(next, 0);
  }

  function startOnline(kind: "host" | "guest", code: string): void {
    session?.close();
    mode = kind;
    room = code;
    if (kind === "host") {
      markHostRoom(code);
      const saved = loadMatch(code);
      game = saved?.state ?? createGame();
      reservations = saved?.reservations ?? [];
      view = viewForSeat(game, 0);
      saveMatch(code, game, reservations);
    } else reservations = [];
    status = { text: "Свързване…", connected: 1, ready: false };
    session = new OnlineSession(kind, code, {
      getState: () => game,
      applyCommand: applyHost,
      onView: (next) => { view = next; },
      onSeat: (next) => { seat = next; },
      onStatus: (next) => { status = next; },
      onReservations: (next) => { reservations = next; saveMatch(code, game, reservations); },
    }, reservations);
    session.start();
    if (kind === "host") history.replaceState(null, "", `?room=${code}`);
  }

  function createOnline(): void { startOnline("host", createRoomCode()); }

  function findPlayers(): void {
    if (!configuredMatchmakerUrl || findingPlayers) return;
    findingPlayers = true;
    matchText = "Свързване с опашката…";
    const search = findMatch(configuredMatchmakerUrl, createRoomCode(), (needed) => {
      matchText = needed === 0 ? "Събираме масата…" : `Търсим още ${needed} ${needed === 1 ? "играч" : "играчи"}…`;
    });
    matchSearch = search;
    search.result.then((result) => {
      if (matchSearch !== search) return;
      matchSearch = null;
      findingPlayers = false;
      startOnline(result.role, result.room);
    }).catch((error: Error) => {
      if (matchSearch !== search) return;
      matchSearch = null;
      findingPlayers = false;
      if (error.message !== "Matchmaking cancelled") matchText = "Опашката не е достъпна. Опитайте отново.";
    });
  }

  function cancelMatchmaking(): void {
    const search = matchSearch;
    matchSearch = null;
    findingPlayers = false;
    matchText = "";
    search?.cancel();
  }

  async function shareRoom(): Promise<void> {
    const url = inviteUrl(room);
    try {
      if (navigator.share) await navigator.share({ title: "Белот", text: `Ела на масата ${room}`, url });
      else await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => copied = false, 1800);
    } catch { /* cancelled share */ }
  }

  function bid(action: BidAction): void { act({ type: "bid", seat, action }); }
  function play(id: ReturnType<typeof cardId>): void { act({ type: "play", seat, card: id }); }
  function nextDeal(): void { act({ type: "next-deal", seat }); }
  function toMenu(): void {
    cancelMatchmaking();
    session?.close();
    session = null;
    mode = "menu";
    history.replaceState(null, "", location.pathname);
  }

  function bidLabel(action: BidAction): string {
    if (action.type === "pass") return "Пас";
    if (action.type === "double") return "Контра";
    if (action.type === "redouble") return "Реконтра";
    return `${suitSymbol[action.contract] ?? ""} ${contractName[action.contract]}`.trim();
  }

  $effect(() => {
    if (mode !== "local" || (game.phase !== "bidding" && game.phase !== "playing") || game.turn === 0) return;
    const timer = setTimeout(() => {
      const command = botCommand(game, game.turn);
      if (command) {
        const next = applyCommand(game, command);
        game = next;
        view = viewForSeat(next, 0);
      }
    }, 420);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if ((mode !== "local" && mode !== "host") || game.phase !== "playing" || game.trick.length !== 4) return;
    const timer = setTimeout(() => {
      const next = collectTrick(game);
      if (next === game) return;
      game = next;
      view = viewForSeat(next, seat);
      if (room) saveMatch(room, next, reservations);
      session?.broadcast();
    }, 1050);
    return () => clearTimeout(timer);
  });

  onMount(() => {
    const code = roomFromUrl();
    if (code) startOnline(isHostRoom(code) ? "host" : "guest", code);
    return () => session?.close();
  });
</script>

<svelte:head><title>{mode === "menu" ? "Белот" : `${phaseText} · Белот`}</title></svelte:head>

{#if mode === "menu"}
  <main class="landing">
    <div class="brand-mark" aria-hidden="true"><span>♣</span><span>♦</span><span>♥</span><span>♠</span></div>
    <p class="eyebrow">Българският класически белот</p>
    <h1>Белот</h1>
    <p class="lead">Четирима. Два отбора. Една маса до 151.</p>
    <div class="menu-actions">
      <button class="primary" onclick={startLocal}><span>Играй срещу ботове</span><small>Сам на това устройство</small></button>
      <button class="secondary find-button" disabled={!configuredMatchmakerUrl || findingPlayers} onclick={findPlayers}><span>Намери играчи</span><small>{configuredMatchmakerUrl ? "Случайна онлайн маса за четирима" : "Ще бъде достъпно след deployment"}</small></button>
      <button class="secondary" onclick={createOnline}><span>Създай онлайн маса</span><small>Покани трима с кратък линк</small></button>
    </div>
    {#if findingPlayers || matchText}
      <div class="match-status" aria-live="polite">
        {#if findingPlayers}<span class="search-spinner" aria-hidden="true"></span>{/if}
        <span>{matchText}</span>
        {#if findingPlayers}<button onclick={cancelMatchmaking}>Отказ</button>{/if}
      </div>
    {/if}
    <details class="rules-teaser">
      <summary>Какво поддържа тази версия?</summary>
      <p>32 карти, наддаване, контра и реконтра, боя / без коз / всичко коз, автоматични анонси и белот, валат и игра до 151.</p>
    </details>
  </main>
{:else}
  <main class="game-shell">
    <header class="topbar">
      <button class="icon-button" aria-label="Изход към началото" onclick={toMenu}>←</button>
      <div class="score" aria-label={`Резултат: ние ${view.scores[0]}, те ${view.scores[1]}`}>
        <span><small>НИЕ</small><b>{view.scores[0]}</b></span><i>:</i><span><small>ТЕ</small><b>{view.scores[1]}</b></span>
      </div>
      <div class="deal-label">#{view.dealNumber}</div>
    </header>

    {#if mode === "host" || mode === "guest"}
      <section class="online-strip" class:ready={status.ready} aria-live="polite">
        <span class="dot"></span><span>{status.text}</span><b>{room}</b>
        {#if mode === "host"}<button onclick={shareRoom}>{copied ? "Готово" : "Покани"}</button>{/if}
      </section>
    {/if}

    <section class="table" aria-label="Маса за белот">
      <div class="opponent north" class:active={view.turn === northSeat} class:taking={collector === northSeat}>
        <span>Партньор</span><div class="backs">{#each Array(Math.min(view.handCounts[northSeat], 5)) as _}<i></i>{/each}</div><b>{view.handCounts[northSeat]}</b>
      </div>
      <div class="opponent east" class:active={view.turn === eastSeat} class:taking={collector === eastSeat}>
        <span>Дясно</span><div class="backs">{#each Array(Math.min(view.handCounts[eastSeat], 5)) as _}<i></i>{/each}</div><b>{view.handCounts[eastSeat]}</b>
      </div>
      <div class="opponent west" class:active={view.turn === westSeat} class:taking={collector === westSeat}>
        <span>Ляво</span><div class="backs">{#each Array(Math.min(view.handCounts[westSeat], 5)) as _}<i></i>{/each}</div><b>{view.handCounts[westSeat]}</b>
      </div>

      <div class="table-center">
        <div class="contract-pill">
          {#if view.contract}<span>{suitSymbol[view.contract] ?? ""}</span>{contractName[view.contract]}{#if view.multiplier > 1}<b>×{view.multiplier}</b>{/if}{:else}{phaseText}{/if}
        </div>
        <div
          class="trick"
          class:collecting={collector !== null}
          class:collect-north={collectorPosition === 2}
          class:collect-east={collectorPosition === 1}
          class:collect-south={collectorPosition === 0}
          class:collect-west={collectorPosition === 3}
        >
          {#each view.trick as played (cardId(played.card))}
            <div class:play-north={(played.seat - seat + 4) % 4 === 2} class:play-east={(played.seat - seat + 4) % 4 === 1} class:play-south={played.seat === seat} class:play-west={(played.seat - seat + 4) % 4 === 3} class="played">
              <Card card={played.card} compact />
            </div>
          {/each}
        </div>
        <div class="trick-score">Ръце {view.tricksWon[0]} : {view.tricksWon[1]}</div>
      </div>
    </section>

    <section class="status-line" aria-live="polite">
      {#if !status.ready && (mode === "host" || mode === "guest")}Изчакваме четирима играчи.{:else if collector !== null}{collector === seat ? "Вие печелите ръката." : `${seatName[collectorPosition]} печели ръката.`}{:else if myTurn}Ваш ред е.{:else}{seatName[(view.turn - seat + 4) % 4]} е на ход.{/if}
      {#if view.hanging}<span>{view.hanging} т. висят</span>{/if}
    </section>

    {#if view.phase === "bidding"}
      <section class="bid-panel" aria-label="Наддаване">
        <div class="bid-history">
          {#each view.bids.slice(-4) as record}<span><b>{seatName[(record.seat - seat + 4) % 4]}</b> {bidLabel(record.action)}</span>{/each}
        </div>
        <div class="bid-actions">
          {#each bidOptions as action}
            <button disabled={!myTurn} class:accent={action.type === "double" || action.type === "redouble"} onclick={() => bid(action)}>{bidLabel(action)}</button>
          {/each}
        </div>
      </section>
    {:else if view.phase === "deal-end" || view.phase === "game-over"}
      <section class="result-panel">
        <p class="eyebrow">{view.phase === "game-over" ? "Мачът приключи" : `Раздаване ${view.dealNumber}`}</p>
        <h2>{view.phase === "game-over" ? (view.winner === teamOf(seat) ? "Победа!" : "Загуба") : view.result?.summary}</h2>
        {#if view.result}<p>Карти и премии: {view.result.raw[0]} : {view.result.raw[1]} · записани {view.result.written[0]} : {view.result.written[1]}</p>{/if}
        {#if view.phase === "deal-end"}<button class="primary compact-action" onclick={nextDeal}>Следващо раздаване</button>{:else}<button class="primary compact-action" onclick={toMenu}>Нова маса</button>{/if}
      </section>
    {/if}

    <section class="hand" aria-label="Вашите карти">
      {#each view.hand as card (cardId(card))}
        <Card {card} playable={myTurn && view.phase === "playing" && view.legalCards.includes(cardId(card))} onclick={() => play(cardId(card))} />
      {/each}
    </section>
  </main>
{/if}
