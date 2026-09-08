# api — Dealogue AI (backend)

NestJS 12 (ESM) + TypeORM + PostgreSQL. Авторизация по логину и паролю,
access-токен — JWT.

## Быстрый старт

```bash
docker compose up -d
```

```bash
cp .env.example .env && npm install --legacy-peer-deps && npm run migration:run && npm run start:dev
```

API поднимется на http://localhost:3000. Сид-миграция заводит пользователя
из `SEED_USER_LOGIN` / `SEED_USER_PASSWORD` (по умолчанию `demo` / `demo1234`).
Задать их нужно **до** первого `npm run migration:run`: уже применённая
миграция повторно не выполняется. Если опоздали — откатите сид, поправьте
`.env` и накатите заново, **именно в таком порядке**:

```bash
npm run migration:revert && npm run migration:run
```

Откат ищет пользователя по текущему `SEED_USER_LOGIN`, поэтому если логин
в `.env` уже изменён, откатывать нужно со старым значением:
`SEED_USER_LOGIN=прежний npm run migration:revert`.

## Эндпоинты

### `POST /auth/login`

```json
{ "login": "demo", "password": "demo1234" }
```

`200` →

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "uuid", "login": "demo", "name": "Демо-пользователь" }
}
```

- `401` — неверная пара логин/пароль (одинаковый ответ и для чужого логина,
  и для неверного пароля).
- `400` — не прошла валидация тела (пустое поле, лишнее поле, перебор длины).

Логин нечувствителен к регистру и пробелам по краям: `"  DEMO  "` найдёт `demo`.

### `GET /auth/me`

Требует `Authorization: Bearer <accessToken>`. Отдаёт актуального пользователя,
`401` — если токена нет, он битый, истёк или пользователя уже удалили.

## Telegram

Подключение аккаунтов пользователей Telegram через MTProto на
[teleproto](https://www.npmjs.com/package/teleproto), отслеживание сообщений
и статистика по первым сообщениям диалогов. Все эндпоинты — под
`Authorization: Bearer`, аккаунты видны только их владельцу.

### Настройка

В `.env` (см. `.env.example`):

| Переменная | Что это |
|---|---|
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | приложение с https://my.telegram.org/apps. Без них раздел выключен: `/telegram/*` отвечает 503 |
| `TELEGRAM_SESSION_SECRET` | ключ AES-256-GCM для сессий в базе. Обязателен при включённом разделе; при потере все аккаунты придётся переподключить |
| `TELEGRAM_MTPROXY` | `host:port:secret[,host2:port2:secret2]` — MTProxy (из России Telegram напрямую недоступен). Несколько адресов перебираются по кругу, подключаемся к первому живому |
| `TELEGRAM_TIMEZONE` | зона «дня» для статистики по умолчанию; фронтенд передаёт свою в `tz=` |
| `TELEGRAM_SYNC_DIALOGS_LIMIT`, `TELEGRAM_SYNC_MESSAGES_LIMIT` | сколько личных диалогов и последних сообщений на диалог забирать при первом подключении |
| `TELEGRAM_RESYNC_INTERVAL_SEC`, `TELEGRAM_RESYNC_DIALOGS_LIMIT` | периодическая досинхронизация: интервал и сколько свежих диалогов проверять |
| `TELEGRAM_LOGIN_ATTEMPT_TTL_SEC` | сколько живёт незавершённый вход |

Секрет MTProxy — hex: `dd…` (random padding) или `ee…` + домен (fake-TLS).
Для таких секретов прокси принимает только транспорт padded intermediate
(тег `0xdddddddd`), а teleproto для MTProxy всегда шлёт abridged — прокси
молча рвёт соединение («NetSocket was closed» на первом же пакете). Поэтому
`client/mtproxy-padded-transport.ts` подменяет класс соединения на свой
`ConnectionTCPMTProxyPadded`; «голые» 16-байтовые секреты идут через abridged
как раньше. Быстрая проверка прокси без приложения: `npm run telegram:probe`.

### Эндпоинты (`/telegram/accounts`)

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/` | список аккаунтов с числом новых диалогов за сегодня |
| POST | `/send-code` `{ phone }` | отправить код в Telegram → `{ attemptId, phone }` |
| POST | `/sign-in` `{ attemptId, code }` | ввести код → `{ status: 'connected', account }` или `{ status: 'password_required' }` при 2FA |
| POST | `/password` `{ attemptId, password }` | облачный пароль → `{ status: 'connected', account }` |
| GET | `/:id` | карточка аккаунта |
| DELETE | `/:id` | завершить сессию в Telegram и удалить аккаунт с историей |
| GET | `/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/Moscow` | первые входящие сообщения по дням и кодам, итоги и итоги за предыдущий период |
| GET | `/:id/chats` | личные диалоги (до 500, свежие первыми) |
| GET | `/:id/chats/:chatId/messages` | сообщения диалога по возрастанию времени |

Ошибки Telegram переводятся в понятные тексты (`lib/telegram-errors.ts`):
неверный код — 400, номер заблокирован — 403, `FLOOD_WAIT` — 429 с числом
минут, прокси недоступен — 503.

### Как это работает

**Вход.** `send-code` поднимает клиент через MTProxy, просит код и сохраняет
сессию (зашифрованную) вместе с `phoneCodeHash` в `telegram_login_attempts` —
ввод кода переживает перезапуск API. `sign-in` вызывает `auth.signIn`; на
`SESSION_PASSWORD_NEEDED` возвращает `password_required`, тогда `password`
делает SRP-проверку (`account.getPassword` + `auth.checkPassword`). После
успеха создаётся или обновляется строка `telegram_accounts` и клиент сразу
передаётся рантайму — второе соединение не открывается. Повторный вход по
номеру отвалившегося аккаунта переподключает его с сохранённой историей.

**Рантайм** (`services/telegram-runtime.service.ts`). При старте API поднимает
по клиенту на каждый аккаунт со статусом `connected` / `error` (в фоне, с
разбегом, чтобы не бить в прокси пачкой). На клиенте висит обработчик
`NewMessage`: входящие и исходящие сообщения личных чатов сразу пишутся в
базу. Если диалог ещё не известен, для него один раз забирается история —
иначе «первое сообщение» было бы определено неверно.

**Синхронизация** (`services/telegram-sync.service.ts`). Первичная: все
личные диалоги (без ботов, «Избранного» и удалённых), для каждого — последние
N сообщений и самое первое (по нему фиксируются `first_message_at`,
направление и код). Периодическая: раз в `TELEGRAM_RESYNC_INTERVAL_SEC`
проверяются свежие диалоги и догружается всё, что новее последнего
сохранённого id, — это страхует от пропущенных событий при обрывах связи.

**Стабильность.**
- teleproto сам переподключается при обрыве; если соединение всё же потеряно,
  рантайм пересоздаёт клиент с экспоненциальной паузой (15 с → 5 мин),
  перебирая прокси из списка.
- Короткие `FLOOD_WAIT` (до 30 с) библиотека пересиживает сама, длинные
  показываются в статусе аккаунта, следующий цикл повторит попытку.
- `AUTH_KEY_UNREGISTERED` / `SESSION_REVOKED` / `USER_DEACTIVATED` переводят
  аккаунт в `disconnected`, сессия стирается — в списке появляется кнопка
  «Переподключить».
- Запись сообщений идемпотентна (`ON CONFLICT DO NOTHING` по паре
  chat + telegram_message_id), гонка события и синхронизации безопасна.
- Сессии в базе только зашифрованные; облачный пароль не хранится.
- При остановке API клиенты аккуратно отключаются без logout — сессии
  остаются действительными.

**Статистика.** Считается SQL-запросом по `telegram_chats`: только диалоги,
которые начал собеседник (`first_message_direction = 'in'`), группировка по
локальному дню в зоне `tz` и по `lead_code`. Код вычленяется из первого
входящего сообщения по шаблону «Код: 5» / «код 12» / «code #7»
(`lib/lead-code.ts`, дублируется во фронтенде).

## Структура

```
src/
  telegram/
    telegram.controller.ts    /telegram/accounts/*
    telegram.module.ts
    telegram.config.ts        переменные окружения, разбор списка MTProxy
    telegram.types.ts         DTO ответов (зеркало контракта фронтенда)
    client/telegram-client.factory.ts   клиенты teleproto, перебор прокси
    services/
      telegram-auth.service.ts      номер → код → пароль
      telegram-runtime.service.ts   живые клиенты, события, переподключение
      telegram-sync.service.ts      первичная и периодическая синхронизация
      telegram-ingest.service.ts    запись чатов и сообщений в базу
      telegram-accounts.service.ts  чтение: список, чаты, сообщения, статистика
    entities/                 telegram_accounts, telegram_login_attempts, telegram_chats, telegram_messages
    lib/                      lead-code, session-crypto, telegram-errors, phone, timezone
  auth/
    auth.controller.ts        POST /auth/login, GET /auth/me
    auth.service.ts           проверка пароля, выпуск токена
    auth.types.ts             JwtPayload, AuthenticatedUser, LoginResponse
    dto/login.dto.ts          валидация тела запроса
    guards/jwt-auth.guard.ts  разбор Bearer-токена
    decorators/current-user.decorator.ts
  users/
    user.entity.ts            таблица users
    users.service.ts          поиск по логину и id
    user.types.ts             PublicUser (без хеша пароля)
  database/
    database.config.ts        опции TypeORM — общие для приложения и CLI
    data-source.ts            точка входа для CLI миграций
    migrations/
```

## Миграции

```bash
npm run migration:run
```

```bash
npm run migration:revert
```

```bash
npm run migration:show
```

Создать новую:

```bash
npm run migration:create -- src/database/migrations/AddSomething
```

**Важно:** после создания впишите класс миграции в массив `migrations`
в `src/database/database.config.ts`. Проект на ESM, где глоб-пути TypeORM
работают ненадёжно, поэтому и сущности, и миграции перечислены явно.

### Как добавить своих пользователей

Ровно так же, как это делает `1700000000001-SeedDemoUser.ts`: создаёте
миграцию и в `up()` пишете `INSERT`. Пароль хешируйте `bcrypt` прямо в
миграции — в репозиторий тогда попадает код, а не готовый хеш:

```ts
const passwordHash = await bcrypt.hash(password, 12);
await queryRunner.query(
  `INSERT INTO "users" ("login", "password_hash", "name") VALUES ($1, $2, $3)`,
  ['ivanov', passwordHash, 'Иванов Иван'],
);
```

Логин кладите в нижнем регистре — поиск идёт по нормализованному значению.

## Переменные окружения

Все — в `.env.example`. Без `JWT_SECRET` приложение не стартует (`getOrThrow`).
`CORS_ORIGIN` — список origin'ов через запятую, по умолчанию dev-сервер Vite
на `http://localhost:5173`.

## Заметки по реализации

- Пароли — bcrypt, 12 раундов. При неизвестном логине сравнение всё равно
  выполняется с фиктивным хешем, чтобы по времени ответа нельзя было
  перебирать существующие логины.
- Guard написан на `@nestjs/jwt` без Passport: для одной JWT-стратегии
  Passport даёт мало, а зависимостей и CJS/ESM-стыков добавляет заметно.
- `synchronize` выключен намеренно — схема меняется только миграциями.
