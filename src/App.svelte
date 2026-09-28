<script lang="ts">
  import { onMount } from "svelte";
  import Card from "./components/Card.svelte";
  import { botCommand } from "./game/bot.ts";
  import { availableDeclarations } from "./game/declarations.ts";
  import { applyCommand, availableBids, collectTrick, contracts, createGame, viewForSeat } from "./game/state.ts";
  import { trickWinner } from "./game/rules.ts";
  import { cardId, teamOf, type BidAction, type CardId, type Command, type Contract, type GameState, type PlayerView, type Seat } from "./game/types.ts";
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
  let selectedCardId = $state<CardId | null>(null);
  let announcementsDialog = $state<HTMLDialogElement>();
  let reservations: [string, Seat][] = [];

  const suitSymbol: Record<string, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
  const contractName: Record<Contract, string> = { clubs: "Спатия", diamonds: "Каро", hearts: "Купа", spades: "Пика", "no-trump": "Без коз", "all-trump": "Всичко коз" };
  const seatName = ["Вие", "Дясно", "Партньор", "Ляво"];
  const phaseText = $derived(view.phase === "bidding" ? "Наддаване" : view.phase === "playing" ? "Разиграване" : view.phase === "deal-end" ? "Край на раздаването" : "Край на мача");
  const ourTeam = $derived(teamOf(seat));
  const theirTeam = $derived((1 - ourTeam) as 0 | 1);
  const myTurn = $derived(view.turn === seat && view.trick.length < 4 && (mode === "local" || status.ready));
  const northSeat = $derived(((seat + 2) % 4) as Seat);
  const eastSeat = $derived(((seat + 1) % 4) as Seat);
  const westSeat = $derived(((seat + 3) % 4) as Seat);
  const collector = $derived(view.trick.length === 4 && view.contract ? trickWinner(view.trick, view.contract) : null);
  const collectorPosition = $derived(collector === null ? -1 : (collector - seat + 4) % 4);
  const declarationOptions = $derived(view.phase === "playing" && view.contract && view.hand.length === 8
    ? availableDeclarations(view.hand, view.contract).filter((option) => !view.declarations.some((item) => item.seat === seat && item.id === option.id))
    : []);
  const selectedCard = $derived(selectedCardId ? view.hand.find((card) => cardId(card) === selectedCardId) ?? null : null);
  const selectedBelotStage = $derived(selectedCardId ? belotStage(selectedCardId) : null);
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
    selectedCardId = null;
    const next = createGame();
    game = next;
    view = viewForSeat(next, 0);
  }

  function startOnline(kind: "host" | "guest", code: string): void {
    session?.close();
    mode = kind;
    selectedCardId = null;
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
  function declare(id: string): void { act({ type: "declare", seat, declaration: id }); }
  function play(id: CardId, announceBelot = false): void {
    selectedCardId = null;
    act({ type: "play", seat, card: id, announceBelot: announceBelot || undefined });
  }
  function quickPlay(id: CardId): void { play(id, belotStage(id) !== null); }
  function selectCard(id: CardId): void { selectedCardId = selectedCardId === id ? null : id; }
  function nextDeal(): void { act({ type: "next-deal", seat }); }
  function toMenu(): void {
    cancelMatchmaking();
    session?.close();
    session = null;
    mode = "menu";
    selectedCardId = null;
    history.replaceState(null, "", location.pathname);
  }

  function bidLabel(action: BidAction): string {
    if (action.type === "pass") return "Пас";
    if (action.type === "double") return "Контра";
    if (action.type === "redouble") return "Реконтра";
    return `${suitSymbol[action.contract] ?? ""} ${contractName[action.contract]}`.trim();
  }

  function declarationLabel(kind: "run" | "quad", length: number, high: string, suit: string | null): string {
    if (kind === "quad") return `Каре ${high}`;
    const name = length === 3 ? "Терца" : length === 4 ? "Кварта" : "Квинта";
    return `${name} до ${high}${suit ? ` ${suitSymbol[suit]}` : ""}`;
  }

  function belotStage(id: ReturnType<typeof cardId>): "belot" | "rebelot" | null {
    const card = view.hand.find((item) => cardId(item) === id);
    if (!card || !view.contract || !view.legalCards.includes(id) || (card.rank !== "Q" && card.rank !== "K") || (view.contract !== "all-trump" && view.contract !== card.suit)) return null;
    const previous = view.belotAnnouncements.filter((item) => item.seat === seat && item.suit === card.suit);
    if (!previous.length) return view.hand.some((held) => held.suit === card.suit && held.rank === (card.rank === "Q" ? "K" : "Q")) ? "belot" : null;
    return previous.length === 1 && previous[0].stage === "belot" && previous[0].card !== card.rank ? "rebelot" : null;
  }

  $effect(() => {
    if (mode !== "local" || (game.phase !== "bidding" && game.phase !== "playing") || game.turn === 0) return;
    const timer = setTimeout(() => {
      const command = botCommand(viewForSeat(game, game.turn));
      if (command) {
        const next = applyCommand(game, command);
        game = next;
        view = viewForSeat(next, 0);
      }
    }, 420);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (selectedCardId && (view.phase !== "playing" || view.turn !== seat || !view.hand.some((card) => cardId(card) === selectedCardId))) selectedCardId = null;
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
    <section class="landing-hero">
      <div class="brand-line"><span aria-hidden="true">♣ ♦ ♥ ♠</span> Български белот</div>
      <h1>Белот</h1>
      <p>Четирима. Два отбора.<br />Една маса до 151.</p>
      <div class="hero-cards" aria-hidden="true"><i>J♣</i><i>9♥</i><i>A♠</i></div>
    </section>
    <section class="menu-card">
      <p class="eyebrow">Седнете на масата</p>
      <div class="menu-actions">
        <button class="primary" onclick={startLocal}><span>Играй с ботове</span><small>Започни веднага</small></button>
        <button class="secondary" disabled={!configuredMatchmakerUrl || findingPlayers} onclick={findPlayers}><span>Намери играчи</span><small>{configuredMatchmakerUrl ? "Случайна онлайн маса" : "Онлайн търсенето още не е достъпно"}</small></button>
        <button class="secondary" onclick={createOnline}><span>Създай онлайн маса</span><small>Покани приятели с линк</small></button>
      </div>
      {#if findingPlayers || matchText}
        <div class="match-status" aria-live="polite">
          {#if findingPlayers}<span class="search-spinner" aria-hidden="true"></span>{/if}
          <span>{matchText}</span>
          {#if findingPlayers}<button onclick={cancelMatchmaking}>Отказ</button>{/if}
        </div>
      {/if}
      <details class="rules-teaser">
        <summary>Какво включва играта?</summary>
        <p>Наддаване, контра и реконтра, публични анонси, белот и ребелот, валат и игра до 151.</p>
      </details>
    </section>
  </main>
{:else}
  <main class="game-shell" class:finished={view.phase === "deal-end" || view.phase === "game-over"}>
    <header class="match-header">
      <button class="icon-button" aria-label="Изход към началото" onclick={toMenu}>←</button>
      <div class="scoreboard" aria-label={`Резултат: ние ${view.scores[ourTeam]}, те ${view.scores[theirTeam]}`}>
        <span><small>НИЕ</small><b>{view.scores[ourTeam]}</b></span><i>:</i><span><small>ТЕ</small><b>{view.scores[theirTeam]}</b></span>
      </div>
      <div class="deal-number"><small>РАЗДАВАНЕ</small><b>{view.dealNumber}</b></div>
    </header>

    <section class="match-context">
      <div><small>ДОГОВОР</small><b>{view.contract ? `${suitSymbol[view.contract] ?? ""} ${contractName[view.contract]}` : "Няма"}{view.multiplier > 1 ? ` ×${view.multiplier}` : ""}</b></div>
      <div><small>ВЗЯТКИ</small><b>{view.tricksWon[ourTeam]} : {view.tricksWon[theirTeam]}</b></div>
    </section>

    {#if mode === "host" || mode === "guest"}
      <section class="online-strip" class:ready={status.ready} aria-live="polite">
        <span class="dot"></span><span>{status.text}</span><b>{room}</b>
        {#if mode === "host"}<button onclick={shareRoom}>{copied ? "Готово" : "Покани"}</button>{/if}
      </section>
    {/if}

    {#if view.phase === "bidding" || view.phase === "playing"}
      <div class="active-layout">
        <section class="table-stage" aria-label="Маса за белот">
          <div class="player-seat north" class:active={view.turn === northSeat} class:taking={collector === northSeat}>
            <b>Партньор</b><span><i class="mini-back"></i>{view.handCounts[northSeat]} карти</span>
          </div>
          <div class="player-seat east" class:active={view.turn === eastSeat} class:taking={collector === eastSeat}>
            <b>Дясно</b><span><i class="mini-back"></i>{view.handCounts[eastSeat]} карти</span>
          </div>
          <div class="player-seat west" class:active={view.turn === westSeat} class:taking={collector === westSeat}>
            <b>Ляво</b><span><i class="mini-back"></i>{view.handCounts[westSeat]} карти</span>
          </div>
          <div class="player-seat south" class:active={view.turn === seat} class:taking={collector === seat}><b>Вие</b><span>{myTurn ? "На ход" : `${view.handCounts[seat]} карти`}</span></div>

          {#if view.phase === "bidding"}
            <div class="auction-center">
              <small>{view.contract ? "ТЕКУЩА ОБЯВА" : "НАДДАВАНЕ"}</small>
              <strong>{view.contract ? `${suitSymbol[view.contract] ?? ""} ${contractName[view.contract]}` : "Открийте играта"}</strong>
              {#if view.bidder !== null}<span>{seatName[(view.bidder - seat + 4) % 4]}</span>{/if}
            </div>
          {:else}
            <div class="trick-board" class:collecting={collector !== null}>
              {#each view.trick as played (cardId(played.card))}
                <div class:play-north={(played.seat - seat + 4) % 4 === 2} class:play-east={(played.seat - seat + 4) % 4 === 1} class:play-south={played.seat === seat} class:play-west={(played.seat - seat + 4) % 4 === 3} class:winner={collector === played.seat} class="played">
                  <Card card={played.card} compact />
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <section class="public-feed" aria-live="polite">
          {#if view.phase === "bidding"}
            <div class="feed-heading"><span>ИСТОРИЯ НА НАДДАВАНЕТО</span></div>
            <div class="bid-history">
              {#if view.bids.length}
                {#each view.bids.slice(-4) as record}<span><b>{seatName[(record.seat - seat + 4) % 4]}</b> {bidLabel(record.action)}</span>{/each}
              {:else}<span>Първата обява предстои</span>{/if}
            </div>
          {:else}
            <div class="feed-heading"><span>АНОНСИ НА МАСАТА</span><button onclick={() => announcementsDialog?.showModal()}>Всички ({view.declarations.length + view.belotAnnouncements.length})</button></div>
            <div class="feed-lines">
              {#if view.declarations.length}
                {@const item = view.declarations.at(-1)!}
                <span><b>{seatName[(item.seat - seat + 4) % 4]}</b> · {declarationLabel(item.kind, item.length, item.high, item.suit)} <em>{item.status === "pending" ? `${item.points} т. · Изчаква` : item.status === "won" ? `✓ Зачита се · ${item.points} т.` : "Не се зачита"}</em></span>
              {:else}<span>Все още няма обявени комбинации</span>{/if}
              {#if view.belotAnnouncements.length}
                {@const item = view.belotAnnouncements.at(-1)!}
                <span><b>{seatName[(item.seat - seat + 4) % 4]}</b> · {item.stage === "belot" ? "Белот" : "Ребелот"} {suitSymbol[item.suit]} <em>{item.stage === "rebelot" ? "+20 т." : ""}</em></span>
              {/if}
            </div>
          {/if}
        </section>

        <section class="player-dock" class:your-turn={myTurn}>
          <div class="decision-stack">
            <div class="turn-status">
              <b>{#if !status.ready && (mode === "host" || mode === "guest")}Изчакваме масата{:else if collector !== null}{collector === seat ? "Вие вземате взятката" : `${seatName[collectorPosition]} взема взятката`}{:else if myTurn}Ваш ред{:else}{seatName[(view.turn - seat + 4) % 4]} е на ход{/if}</b>
              <span>{view.phase === "bidding" ? "Изберете обява" : myTurn ? (selectedCard ? `Избрана е ${selectedCard.rank}${suitSymbol[selectedCard.suit]}` : "Плъзнете позволена карта нагоре") : "Следете играта на масата"}</span>
            </div>

            {#if view.phase === "bidding"}
              <div class="bid-actions">
                {#each contracts as contract}
                  {@const action = { type: "bid", contract } as BidAction}
                  <button disabled={!myTurn || !bidOptions.some((option) => JSON.stringify(option) === JSON.stringify(action))} onclick={() => bid(action)}>{bidLabel(action)}</button>
                {/each}
                <button class="pass" disabled={!myTurn || !bidOptions.some((option) => option.type === "pass")} onclick={() => bid({ type: "pass" })}>Пас</button>
                {#if bidOptions.some((option) => option.type === "double" || option.type === "redouble")}
                  {@const action = bidOptions.find((option) => option.type === "double" || option.type === "redouble")!}
                  <button class="accent" disabled={!myTurn} onclick={() => bid(action)}>{bidLabel(action)}</button>
                {/if}
              </div>
            {:else}
              {#if myTurn && declarationOptions.length}
                <div class="declaration-options" aria-label="Възможни анонси">
                  {#each declarationOptions as option}
                    <button onclick={() => declare(option.id)}><small>ОБЯВИ</small><b>{declarationLabel(option.kind, option.length, option.high, option.suit)}</b><span>{option.points} т.</span></button>
                  {/each}
                </div>
              {/if}
              <div class="play-actions">
                {#if selectedCard && selectedCardId}
                  <button class="play-primary" onclick={() => play(selectedCardId!, selectedBelotStage !== null)}>{selectedBelotStage === "belot" ? "Белот и изиграй" : selectedBelotStage === "rebelot" ? "Ребелот и изиграй" : "Изиграй"} {selectedCard.rank}{suitSymbol[selectedCard.suit]}</button>
                  {#if selectedBelotStage}<button class="play-secondary" onclick={() => play(selectedCardId!)}>Без обявяване</button>{/if}
                {:else}<button class="play-primary" disabled>Изберете карта</button>{/if}
              </div>
            {/if}
          </div>

          <section class="hand-cards" aria-label="Вашите карти">
            {#each view.hand as card (cardId(card))}
              <Card {card} playable={myTurn && view.phase === "playing" && view.legalCards.includes(cardId(card))} selected={selectedCardId === cardId(card)} onclick={() => selectCard(cardId(card))} onplay={() => quickPlay(cardId(card))} />
            {/each}
          </section>
        </section>
      </div>
    {:else}
      <section class="deal-result">
        <p class="eyebrow">{view.phase === "game-over" ? "Мачът приключи" : `Раздаване ${view.dealNumber} приключи`}</p>
        <h2>{view.phase === "game-over" ? (view.winner === ourTeam ? "Победа!" : "Загуба") : view.result?.summary}</h2>
        <div class="result-score"><span><small>НИЕ</small><b>+{view.result?.written[ourTeam] ?? 0}</b></span><i>:</i><span><small>ТЕ</small><b>+{view.result?.written[theirTeam] ?? 0}</b></span></div>
        {#if view.result}
          <div class="result-breakdown">
            <span><b>Анонси</b><i>{view.declarationPoints[ourTeam]} : {view.declarationPoints[theirTeam]}</i></span>
            <span><b>Белот</b><i>{view.belotPoints[ourTeam]} : {view.belotPoints[theirTeam]}</i></span>
            <span><b>Карти и премии</b><i>{view.result.raw[ourTeam]} : {view.result.raw[theirTeam]}</i></span>
            <span class="total"><b>Общ резултат</b><i>{view.scores[ourTeam]} : {view.scores[theirTeam]}</i></span>
          </div>
        {/if}
        {#if view.hanging}<p class="hanging">{view.hanging} точки висят</p>{/if}
        {#if view.phase === "deal-end"}<button class="primary result-action" onclick={nextDeal}>Следващо раздаване</button>{:else}<button class="primary result-action" onclick={toMenu}>Нова маса</button>{/if}
      </section>
    {/if}

    <dialog class="announcements-dialog" bind:this={announcementsDialog} onclick={(event) => { if (event.target === announcementsDialog) announcementsDialog?.close(); }}>
      <div class="dialog-head"><div><p class="eyebrow">Публична информация</p><h2>Анонси на масата</h2></div><button aria-label="Затвори" onclick={() => announcementsDialog?.close()}>×</button></div>
      <div class="dialog-list">
        {#if !view.declarations.length && !view.belotAnnouncements.length}<p>Все още няма публични анонси.</p>{/if}
        {#each view.declarations as item}
          <article><b>{seatName[(item.seat - seat + 4) % 4]}</b><span>{declarationLabel(item.kind, item.length, item.high, item.suit)}</span><em class:won={item.status === "won"}>{item.status === "pending" ? `${item.points} т. · Изчаква` : item.status === "won" ? `✓ Зачита се · ${item.points} т.` : "Не се зачита"}</em></article>
        {/each}
        {#each view.belotAnnouncements as item}
          <article><b>{seatName[(item.seat - seat + 4) % 4]}</b><span>{item.stage === "belot" ? "Белот" : "Ребелот"} {suitSymbol[item.suit]}</span><em>{item.stage === "rebelot" ? "+20 т." : "Обявен"}</em></article>
        {/each}
      </div>
    </dialog>
  </main>
{/if}
