import { extractLeadCode } from '@/shared/lib/extractLeadCode'
import type {
  ChatDto,
  MessageDto,
  TelegramAccountDto,
} from '../../contracts/telegram'
import { createRng } from './rng'
import type { Rng } from './rng'

const MALE_NAMES = [
  'Алексей', 'Дмитрий', 'Иван', 'Сергей', 'Николай', 'Павел', 'Андрей',
  'Михаил', 'Владимир', 'Артём', 'Роман', 'Егор', 'Кирилл', 'Максим',
]
const FEMALE_NAMES = [
  'Мария', 'Елена', 'Ольга', 'Анна', 'Татьяна', 'Наталья', 'Ирина',
  'Екатерина', 'Светлана', 'Юлия', 'Ксения', 'Дарья', 'Алина', 'Вера',
]
const SURNAMES = [
  'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов',
  'Новиков', 'Морозов', 'Волков', 'Петров', 'Фёдоров', 'Орлов', 'Макаров',
  'Зайцев', 'Белов', 'Григорьев', 'Романов',
]

/** Распределение кодов из первого сообщения (null — без кода). */
const CODE_WEIGHTS: ReadonlyArray<readonly [string | null, number]> = [
  [null, 36],
  ['5', 24],
  ['12', 16],
  ['7', 11],
  ['3', 7],
  ['21', 4],
  ['48', 2],
]

const FIRST_WITH_CODE = [
  'Здравствуйте! Код: {code}. Хочу узнать подробнее об условиях.',
  'Добрый день, код {code}. Актуально ли предложение?',
  'Привет! Мой код — {code}, интересует стоимость.',
  'Здравствуйте, code #{code}. Можно консультацию?',
  'Код {code}. Подскажите, как оформить заявку?',
  'Добрый вечер! КОД:{code} Есть ли рассрочка?',
  'Здравствуйте. код {code}, увидела в сторис, расскажите подробнее',
]

const FIRST_WITHOUT_CODE = [
  'Здравствуйте! Увидел вашу рекламу, расскажите подробнее.',
  'Добрый день, ещё актуально?',
  'Привет, сколько стоит?',
  'Здравствуйте, хотел бы записаться на консультацию.',
  'Подскажите, вы работаете по выходным?',
  'Добрый день! Мне вас порекомендовали, интересует ваш продукт.',
  'Здравствуйте, а доставка в регионы есть?',
]

const REPLIES_OUT = [
  'Здравствуйте! Да, конечно. Расскажите, что именно вас интересует?',
  'Добрый день! Актуально. Могу рассказать подробнее — удобно созвониться?',
  'Отправляю презентацию и прайс, посмотрите, пожалуйста.',
  'Подготовил расчёт под ваш запрос — во вложении.',
  'Напомню о себе: остались вопросы?',
  'Отлично, тогда оформляю. Понадобятся ваши реквизиты.',
  'Да, есть рассрочка на 6 и 12 месяцев без переплаты.',
]

const REPLIES_IN = [
  'Спасибо, посмотрю и вернусь.',
  'Да, давайте созвонимся завтра после обеда.',
  'А какие есть варианты оплаты?',
  'Пока думаю, нужно посоветоваться.',
  'Хорошо, отправляйте.',
  'Подходит, оформляем!',
  'Спасибо, пока не актуально.',
  'А есть скидка при оплате сразу?',
]

const DAY_MS = 86_400_000
const HISTORY_DAYS = 45

export interface SeededAccount {
  account: TelegramAccountDto
  chats: ChatDto[]
  messages: MessageDto[]
}

interface AccountBlueprint {
  id: string
  phone: string
  username: string | null
  displayName: string
  status: TelegramAccountDto['status']
  statusMessage: string | null
  connectedDaysAgo: number
  lastSyncMinutesAgo: number | null
  /** Средний поток новых диалогов в будний день. */
  dailyBase: number
  /** Сколько последних дней «молчат» (аккаунт отключён). */
  silentDays: number
}

const ACCOUNTS: AccountBlueprint[] = [
  {
    id: 'acc_anna',
    phone: '+79151234567',
    username: 'anna_dealogue',
    displayName: 'Анна · Dealogue',
    status: 'connected',
    statusMessage: null,
    connectedDaysAgo: 62,
    lastSyncMinutesAgo: 2,
    dailyBase: 4,
    silentDays: 0,
  },
  {
    id: 'acc_sales',
    phone: '+79267654321',
    username: 'dealogue_sales',
    displayName: 'Отдел продаж',
    status: 'connected',
    statusMessage: null,
    connectedDaysAgo: 40,
    lastSyncMinutesAgo: 6,
    dailyBase: 2.5,
    silentDays: 0,
  },
  {
    id: 'acc_reserve',
    phone: '+79039876543',
    username: null,
    displayName: 'Резервный номер',
    status: 'disconnected',
    statusMessage:
      'Сессия завершена на стороне Telegram. Переподключите аккаунт, чтобы продолжить отслеживание.',
    connectedDaysAgo: 90,
    lastSyncMinutesAgo: 9 * 24 * 60,
    dailyBase: 1.2,
    silentDays: 9,
  },
  {
    id: 'acc_promo',
    phone: '+79165550101',
    username: 'dealogue_promo',
    displayName: 'Промо-кампания',
    status: 'error',
    statusMessage:
      'Telegram временно ограничил запросы (FLOOD_WAIT, 43 мин). Синхронизация возобновится автоматически.',
    connectedDaysAgo: 5,
    lastSyncMinutesAgo: 47,
    dailyBase: 3,
    silentDays: 0,
  },
]

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function translit(word: string): string {
  return [...word.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join('')
}

function makePeer(rng: Rng, index: number) {
  const female = rng.chance(0.5)
  const first = rng.pick(female ? FEMALE_NAMES : MALE_NAMES)
  const surname = rng.pick(SURNAMES) + (female ? 'а' : '')
  const hasUsername = rng.chance(0.55)
  const handle = rng.chance(0.5)
    ? `${translit(first[0])}${translit(surname)}`
    : `${translit(first)}_${translit(surname).slice(0, 3)}`
  return {
    id: `peer_${index}`,
    name: `${first} ${surname}`,
    username: hasUsername ? `${handle}${rng.int(1, 99)}` : null,
    phone: rng.chance(0.4) ? `+79${rng.int(100000000, 999999999)}` : null,
  }
}

/**
 * Поток новых диалогов по дням: базовый уровень × фактор дня недели + шум.
 * Возвращает количество первых сообщений для дня со сдвигом `daysAgo`.
 */
function newChatsForDay(rng: Rng, base: number, date: Date): number {
  const weekday = date.getDay()
  const weekend = weekday === 0 || weekday === 6
  const factor = weekend ? 0.45 : 0.85 + 0.35 * rng.next()
  const spike = rng.chance(0.08) ? 1.8 : 1
  return Math.max(0, Math.round(base * factor * spike + (rng.next() - 0.5) * 2))
}

function buildAccount(
  blueprint: AccountBlueprint,
  now: Date,
  rng: Rng,
  peerIndexStart: number,
): SeededAccount {
  const chats: ChatDto[] = []
  const messages: MessageDto[] = []
  let peerIndex = peerIndexStart
  let chatIndex = 0

  const historyDays = Math.min(HISTORY_DAYS, blueprint.connectedDaysAgo)

  for (let daysAgo = historyDays; daysAgo >= 0; daysAgo -= 1) {
    if (daysAgo < blueprint.silentDays) break

    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
    let count = newChatsForDay(rng, blueprint.dailyBase, day)

    // Сегодняшний день ещё не закончился — часть потока впереди.
    if (daysAgo === 0) {
      const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60)
      count = Math.round(count * Math.min(1, dayProgress / 0.8))
    }

    for (let i = 0; i < count; i += 1) {
      const chatId = `${blueprint.id}_chat_${chatIndex}`
      chatIndex += 1
      const peer = makePeer(rng, peerIndex)
      peerIndex += 1

      // Первое сообщение — в рабочее время 09:00–21:30.
      const minuteOfDay = rng.int(9 * 60, 21 * 60 + 30)
      let cursor = new Date(day.getTime() + minuteOfDay * 60_000)
      if (cursor > now) cursor = new Date(now.getTime() - rng.int(1, 40) * 60_000)

      const code = rng.weighted(CODE_WEIGHTS)
      const firstText = code
        ? rng.pick(FIRST_WITH_CODE).replace('{code}', code)
        : rng.pick(FIRST_WITHOUT_CODE)

      const chatMessages: MessageDto[] = [
        {
          id: `${chatId}_m0`,
          chatId,
          direction: 'in',
          text: firstText,
          sentAt: cursor.toISOString(),
        },
      ]

      const followUps = rng.weighted([
        [0, 2],
        [1, 3],
        [2, 4],
        [4, 4],
        [6, 3],
        [9, 2],
        [12, 1],
      ] as const)

      for (let m = 1; m <= followUps; m += 1) {
        const direction = m % 2 === 1 ? 'out' : 'in'
        const gapMinutes = rng.chance(0.15) ? rng.int(8 * 60, 36 * 60) : rng.int(2, 150)
        const next = new Date(cursor.getTime() + gapMinutes * 60_000)
        if (next > now) break
        cursor = next
        chatMessages.push({
          id: `${chatId}_m${m}`,
          chatId,
          direction,
          text: rng.pick(direction === 'out' ? REPLIES_OUT : REPLIES_IN),
          sentAt: cursor.toISOString(),
        })
      }

      const last = chatMessages[chatMessages.length - 1]

      chats.push({
        id: chatId,
        accountId: blueprint.id,
        peer,
        lastMessage: { text: last.text, sentAt: last.sentAt, direction: last.direction },
        messagesCount: chatMessages.length,
        firstMessageAt: chatMessages[0].sentAt,
        // Код берём той же функцией, что и в проде, — мок не «знает» ответ заранее.
        leadCode: extractLeadCode(firstText),
      })
      messages.push(...chatMessages)
    }
  }

  const account: TelegramAccountDto = {
    id: blueprint.id,
    phone: blueprint.phone,
    username: blueprint.username,
    displayName: blueprint.displayName,
    status: blueprint.status,
    statusMessage: blueprint.statusMessage,
    connectedAt: new Date(now.getTime() - blueprint.connectedDaysAgo * DAY_MS).toISOString(),
    lastSyncAt:
      blueprint.lastSyncMinutesAgo === null
        ? null
        : new Date(now.getTime() - blueprint.lastSyncMinutesAgo * 60_000).toISOString(),
    newChatsToday: 0,
  }

  return { account, chats, messages }
}

export function seedTelegram(now = new Date()): SeededAccount[] {
  const rng = createRng(20260908)
  let peerIndex = 1
  return ACCOUNTS.map((blueprint) => {
    const seeded = buildAccount(blueprint, now, rng, peerIndex)
    peerIndex += seeded.chats.length
    return seeded
  })
}

/** Небольшая история для только что подключённого аккаунта. */
export function seedFreshAccount(
  id: string,
  phone: string,
  now = new Date(),
): SeededAccount {
  const rng = createRng(phone.length * 7919 + id.length)
  return buildAccount(
    {
      id,
      phone,
      username: null,
      displayName: 'Новый аккаунт',
      status: 'connected',
      statusMessage: null,
      connectedDaysAgo: 6,
      lastSyncMinutesAgo: 0,
      dailyBase: 1.5,
      silentDays: 0,
    },
    now,
    rng,
    10_000 + rng.int(0, 999),
  )
}
