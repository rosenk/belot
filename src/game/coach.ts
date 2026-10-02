import { botCommand } from "./bot.ts";
import { cardPoints, isTrump, strength } from "./cards.ts";
import { availableDeclarations } from "./declarations.ts";
import { trickWinner } from "./rules.ts";
import { cardId, teamOf, type Card, type CardId, type PlayerView } from "./types.ts";

const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const names = { clubs: "спатия", diamonds: "каро", hearts: "купа", spades: "пика", "no-trump": "без коз", "all-trump": "всичко коз" };
const cardLabel = (card: Card) => `${card.rank}${symbols[card.suit]}`;
const playerLabel = (view: PlayerView, seat: number) => ["Вие", "Играчът вдясно", "Партньорът ви", "Играчът вляво"][(seat - view.seat + 4) % 4];

export interface CoachHint {
  title: string;
  explanation: string;
  suggestion?: { label: string; reason: string; card?: CardId };
}

// Advice has the same information boundary as a player, never the host's GameState.
export function coachHint(view: PlayerView): CoachHint {
  if (view.phase === "deal-end" || view.phase === "game-over") {
    const result = view.result;
    if (!result) return { title: "Раздаването приключи", explanation: "Записаните точки се добавят към резултата на отбора. Играем до 151." };
    const bidder = view.bidder === null ? "Обявилият отбор" : teamOf(view.bidder) === teamOf(view.seat) ? "Вашият отбор" : "Другият отбор";
    const outcome = result.raw[0] === result.raw[1]
      ? "Точките са равни: част от резултата не се записва веднага, а „виси“. Ще я получи победителят в следващо раздаване без равенство."
      : view.multiplier > 1
        ? `При ${view.multiplier === 2 ? "контра" : "реконтра"} отборът с повече точки записва целия резултат ×${view.multiplier}.`
        : result.contractMade ? `${bidder} е събрал повече точки от другия и е изпълнил обявения договор.` : `${bidder} не е събрал повече точки от другия — играта е „вътре“ и другият отбор записва целия резултат.`;
    return { title: "Как се получи резултатът?", explanation: `${outcome} Точките от карти, премии и зачетени обявявания се закръглят за записване. Целта е 151 записани точки.` };
  }

  if (view.phase === "bidding") {
    const explanation = view.multiplier > 1
      ? `Има ${view.multiplier === 2 ? "контра" : "реконтра"}: целият резултат се умножава по ${view.multiplier}. Не може да смените договора; можете да пасувате${view.multiplier === 2 && view.bidder !== null && teamOf(view.bidder) === teamOf(view.seat) ? " или да дадете реконтра" : ""}.`
      : `Обявата избира коз, „без коз“ или „всичко коз“. ${view.contract === "all-trump" ? "Всичко коз е най-високата обява; можете да пасувате." : view.contract ? `Можете да предложите по-висока обява от ${names[view.contract]} или да пасувате.` : "Можете и да пасувате — да не предложите договор."} Обявилият отбор трябва да събере повече точки от другия.`;
    const command = botCommand(view);
    return {
      title: view.turn === view.seat ? "Какво да обявя?" : "Избираме как ще играем",
      explanation,
      suggestion: command?.type === "bid" ? command.action.type === "bid"
        ? { label: `Помислете за ${names[command.action.contract]}`, reason: "Картите ви носят сравнително много точки при този договор. Оценката е само по първите ви 5 карти; след наддаването ще получите още 3, които още не знаем." }
        : { label: "Може да пасувате", reason: view.multiplier > 1 || view.contract === "all-trump"
          ? "Няма позволена по-висока обява. Пасът запазва договора; контра и реконтра са риск, а не задължение."
          : "По тази ориентировъчна оценка картите ви не са достатъчно силни за по-висока обява. Можете да пасувате и пак ще участвате в разиграването." }
        : undefined,
    };
  }

  if (!view.contract) return { title: "Следете масата", explanation: "Изчакваме договора за това раздаване." };
  const contract = view.contract;
  const order = contract === "no-trump" ? "Без коз: A е най-силна, следвана от 10, K, Q, J, 9, 8, 7."
    : contract === "all-trump" ? "Всичко коз: във всяка боя J е най-силна, после 9, A, 10, K, Q, 8, 7. Различна боя не бие поисканата."
      : `Козът е ${names[contract]} и бие другите бои. В коза редът е J, 9, A, 10, K, Q, 8, 7; извън него — A, 10, K, Q, J, 9, 8, 7.`;
  if (view.trick.length === 4) {
    const winner = trickWinner(view.trick, contract);
    const winningCard = view.trick.find((play) => play.seat === winner)!.card;
    return { title: `${playerLabel(view, winner)} ${winner === view.seat ? "вземате" : "взема"} ръката`, explanation: `${cardLabel(winningCard)} бие останалите изиграни карти според правилата за коз и боя. Спечелилият отбор получава точките от тези четири карти, а играчът, взел ръката, играе пръв в следващата. ${order}` };
  }
  if (view.turn !== view.seat) {
    const winner = view.trick.length ? trickWinner(view.trick, contract) : null;
    const winning = winner === null ? "" : winner === view.seat ? " Вие печелите ръката засега." : ` ${playerLabel(view, winner)} печели ръката засега.`;
    return { title: "Една ръка = по една карта от всеки", explanation: `${playerLabel(view, view.turn)} е на ход.${winning} ${order}` };
  }

  let explanation = "Започвате ръката и можете да изберете всяка карта. Останалите трябва да отговорят с тази боя, ако я имат.";
  if (view.trick.length) {
    const lead = view.trick[0].card.suit;
    const following = view.hand.filter((card) => card.suit === lead);
    const winner = trickWinner(view.trick, contract);
    const highest = Math.max(...view.trick.filter((play) => play.card.suit === lead).map((play) => strength(play.card, contract)));
    if (following.length) {
      explanation = `Поискана е ${names[lead]}. Имате тази боя и трябва да отговорите с нея.`;
      if (contract === "all-trump" || contract === lead) explanation += following.some((card) => strength(card, contract) > highest)
        ? " Трябва да изиграете карта, която бие най-силната от тази боя на масата. Това се нарича „качване“ и е задължително дори ако партньорът ви печели ръката засега."
        : " Нямате карта, която бие най-силната от тази боя на масата. Изберете която и да е своя карта от същата боя.";
    } else if (contract === "no-trump" || contract === "all-trump") {
      explanation = `Нямате ${names[lead]}. Можете да изиграете всяка своя карта, но при този договор друга боя не може да спечели ръката.`;
    } else if (teamOf(winner) === teamOf(view.seat)) {
      explanation = `Нямате ${names[lead]}, но партньорът ви печели ръката засега. Не сте длъжни да цакате — да изиграете коз. Можете да изберете всяка своя карта.`;
    } else {
      const trumps = view.hand.filter((card) => isTrump(card, contract));
      const winningCard = view.trick.find((play) => play.seat === winner)!.card;
      explanation = !trumps.length ? `Нямате нито ${names[lead]}, нито коз. Можете да изиграете всяка своя карта.`
        : !isTrump(winningCard, contract) ? `Нямате ${names[lead]}, а противникът печели ръката засега. Трябва да цакате — да изиграете коз (${names[contract]}).`
          : trumps.some((card) => strength(card, contract) > strength(winningCard, contract)) ? "Противникът печели ръката с коз. Имате коз, който го бие, и трябва да го изиграете — това се нарича „надцакване“."
            : "Противникът печели ръката с коз, а вие нямате по-силен коз. По тези правила можете да изиграете всяка своя карта; не сте длъжни да дадете коз.";
    }
  }

  const undeclared = view.hand.length === 8 ? availableDeclarations(view.hand, contract).find((option) => !view.declarations.some((item) => item.seat === view.seat && item.id === option.id)) : undefined;
  if (undeclared) return { title: "Преди първата ви карта", explanation, suggestion: { label: "Обявете комбинацията си", reason: `Имате необявена комбинация за ${undeclared.points} т. Използвайте „Обяви“ преди първата си карта — след нея е късно. Точките се зачитат само ако отборът ви спечели сравняването на анонсите.` } };

  const legal = view.hand.filter((card) => view.legalCards.includes(cardId(card)));
  const cheapest = (cards: Card[]) => [...cards].sort((a, b) => cardPoints(a, contract) - cardPoints(b, contract) || strength(a, contract) - strength(b, contract))[0];
  let chosen = cheapest(legal);
  let reason = "Можете да започнете с тази карта и да запазите картите с повече точки за следващите ръце. Това е само предложение, не гаранция, че ще спечелите.";
  if (view.trick.length) {
    const partnerWinning = teamOf(trickWinner(view.trick, contract)) === teamOf(view.seat);
    const winning = legal.filter((card) => trickWinner([...view.trick, { seat: view.seat, card }], contract) === view.seat);
    if (partnerWinning) {
      chosen = cheapest(legal.filter((card) => !winning.includes(card))) ?? chosen;
      reason = "Партньорът ви печели ръката засега. Когато правилата позволяват, запазете по-силните си карти за следващите ръце. Ако след вас има други играчи, те още могат да бият картата на партньора ви.";
    } else if (winning.length) {
      chosen = cheapest(winning);
      reason = "С тази карта ще печелите ръката засега. Тя е една от картите с най-малко точки, които бият изиграните дотук. Ако след вас има други играчи, те още могат да ви бият.";
    } else reason = "Нито една карта, която можете да изиграете сега, не бие печелещата карта на масата. Предложената карта носи най-малко точки сред позволените. Ако противникът вземе ръката, така ще получи възможно най-малко точки от вашата карта.";
  }
  return { title: "Защо точно тези карти?", explanation, suggestion: chosen ? { label: `Опитайте ${cardLabel(chosen)}`, reason, card: cardId(chosen) } : undefined };
}
