# web — Dealogue AI (frontend)

React 19 + Vite + TypeScript. UI — [MUI v9](https://mui.com/material-ui/),
состояние и запросы — [Redux Toolkit / RTK Query](https://redux-toolkit.js.org/rtk-query/overview),
маршрутизация — [React Router 7](https://reactrouter.com/).
Архитектура — [Feature-Sliced Design](https://feature-sliced.design/).

## Запуск

```bash
npm install --legacy-peer-deps
npm run dev
```

Открыть http://localhost:5173

## Скрипты

| Команда                | Что делает                                  |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | dev-сервер с HMR                            |
| `npm run build`        | `tsc -b` + production-сборка в `dist/`      |
| `npm run preview`      | локальный просмотр собранного `dist/`       |
| `npm run lint`         | oxlint                                      |
| `npm run format`       | Prettier по всему проекту (`--write`)       |
| `npm run format:check` | проверка форматирования без правок (для CI) |

Prettier настроен как в `apps/api` (`.prettierrc`: одинарные кавычки,
запятые везде); `dist`, `node_modules` и `coverage` в `.prettierignore`.

## Что умеет

После входа пользователь попадает в раздел **Аккаунты Telegram**:

- список подключённых аккаунтов со статусом (подключён / ожидает
  подтверждения / отключён / ошибка), числом новых диалогов за сегодня
  и временем последней синхронизации;
- подключение аккаунта через диалог «как в Telegram»: номер → код из
  приложения → облачный пароль, если включена 2FA; переподключение
  отвалившегося аккаунта — тот же диалог с подставленным номером;
- удаление с подтверждением (в таблице — иконкой, на странице аккаунта —
  в меню «⋯»).

Внутри аккаунта пять вкладок:

- **Статистика** — сколько людей написали первое сообщение за день и с каким
  кодом («#1», «# 1», «Код 6», «код - 6», «код: 6»; без совпадения — «Без кода»).
  Фильтр периода (сегодня, вчера, 7 / 30 дней или произвольные даты) живёт в query-строке
  `?from=&to=`, плитки с итогами и дельтой к прошлому периоду, столбчатый
  график с накоплением по кодам (стрелки на клавиатуре листают дни), таблица
  кодов с долями и таблица по дням.
- **Чаты** — все диалоги аккаунта: список догружается по 100 при прокрутке
  вниз, поиск и фильтры (с кодом, без кода) работают на сервере по всем
  чатам, а не только по загруженным. Справа — переписка: открывается на
  свежих сообщениях, при прокрутке вверх догружает более старые по 50, не
  сбивая положение; отправка сообщений от имени аккаунта (если чат ведёт
  агент, под полем предупреждение: после отправки чат уйдёт менеджеру);
  первое сообщение диалога помечено кодом, у медиа — вид вложения.
  В шапке — чей чат (агент или менеджер) и панель агента: режим, журнал
  ходов, память, задания. У сообщений — «продолжить в песочнице» и «в
  примеры». Выбранный чат — в URL, по прямой ссылке он открывается, даже
  если в списке ещё не загружен.
- **У менеджера** — чаты, которые агент передал: «ждут ответа» сверху,
  «цены отправлены, молчат» ниже, затем те, что менеджер уже ведёт.
- **Агент** — `?section=` выбирает раздел: настройки (включение агента на
  аккаунте с подтверждением, стандартная библиотека, образ практика,
  тайминги), библиотека текстов и примеры диалогов.
- **Песочница** — агент ведёт диалог без Telegram: за клиента пишет
  владелец, время виртуальное, рядом журнал ходов, память и задания.

## Архитектура (FSD)

Слои сверху вниз; импорт разрешён только вниз, обращение к чужому слайсу —
через его публичный API (`index.ts`), а не по внутренним путям.

```
src/
  app/                     инициализация приложения
    providers/             Redux Provider + ThemeProvider + CssBaseline + уведомления
    router/                createBrowserRouter, ProtectedRoute, GuestRoute, ленивые страницы
    store/                 configureStore, типы RootState / AppDispatch
    styles/                тема MUI (палитра, типографика, переопределения компонентов), global.css
  pages/                   одна страница — один маршрут и один чанк
    login/                 форма входа
    accounts/              список аккаунтов Telegram
    account/               шапка аккаунта, меню «⋯», вкладки, Outlet
    account-stats/         вкладка «Статистика»
    account-chats/         вкладка «Чаты»
    account-handoffs/      вкладка «У менеджера»
    account-bot/           вкладка «Агент»: настройки, библиотека, примеры
    account-sandbox/       вкладка «Песочница»
    not-found/
  widgets/                 готовые блоки, из которых собраны страницы
    app-shell/             боковое меню + Outlet для авторизованной части
    account-stats/         дашборд статистики: фильтр периода, плитки, график, таблицы
    chat-panel/            список чатов + переписка
  features/                действия пользователя
    auth/login/, auth/logout/
    telegram-account/connect/   диалог подключения (номер → код → 2FA), хук useConnectFlow
    telegram-account/remove/    удаление с подтверждением
    realtime/                   SSE-подключение и реакция на события
    bot-chat/                   агент в чате: режим, панель с журналом
    bot-settings/               включение агента, импорт библиотеки, образ, тайминги
    bot-library/                редактор библиотеки текстов
    bot-examples/               примеры диалогов и «в примеры» из переписки
    bot-sandbox/                песочница: сессии, лента, ввод, журнал; «продолжить в песочнице»
  entities/
    session/               слайс сессии, селекторы, хуки, персист в storage
    telegram-account/      аккаунт: RTK Query (список, карточка, статистика), чип статуса, аватар, контакты
    chat/                  чат и сообщение: RTK Query, чип кода, пузырь сообщения, вид вложения
    bot/                   агент: RTK Query (настройки, состояние, журнал, «у менеджера»),
                           подписи кодов, чипы режима и этапа, журнал (ход, память, задания)
  shared/
    api/                   baseApi (единственный createApi), провайдер токена, SSE,
                           tags.ts (реестр тегов кэша), contracts/ (DTO backend-API)
    config/                env, ROUTES, APP_NAME, палитры графиков и аватаров
    lib/                   даты, форматирование, ошибки API, хелперы RTK Query, хуки
                           (useDraft, useDocumentTitle, useElementWidth, useDebouncedValue,
                           useInfiniteScroll, useStoredState)
    types/                 SxStyles, типы своих токенов темы (theme.d.ts)
    ui/                    BrandMark, PageHeader, EmptyState, StatTile, StackedColumnChart,
                           ChatBubble, QueryBoundary, SectionCard, FormDialog, ConfirmAction,
                           Notifications (useNotify)
```

Алиас `@/*` указывает на `src/*` (настроен в `vite.config.ts` и `tsconfig.app.json`).

### Что где лежит

Слой определяется не темой, а ролью:

- **entities** — данные: RTK Query-эндпоинты, типы, подписи кодов и мелкие
  представления одной записи (чип, аватар, пузырь, ход журнала).
- **features** — действие пользователя: войти, подключить или удалить
  аккаунт, настроить агента, прогнать диалог в песочнице. Логика действия —
  в `model/` (хуки), разметка — в `ui/`.
- **widgets** — собранный блок экрана из нескольких сущностей и фич: дашборд
  статистики, панель чатов. Они ничего не «делают», они компонуют.
- **pages** — маршрут: собирает виджеты и фичи и отдаёт им `accountId` из URL.

Контракты API (`shared/api/contracts`) — только зеркала серверных типов и
справочников (`contracts/bot/` разбит по темам: справочники, настройки,
библиотека, журнал, чат, песочница). Подписи для людей («Цены отправлены»,
«Диагностики») — в `entities/bot/lib/labels.ts`.

### Общие примитивы `shared/ui`

Компоненты, которые убирают обвязку, иначе расползающуюся по панелям:

- `QueryBoundary` — три состояния запроса RTK Query (ошибка с «Повторить»,
  загрузка, пусто) одинаково во всём приложении. Если данные уже были, а упал
  фоновый перезапрос, данные остаются на экране, сверху — предупреждение.
  Дети — функция от данных, поэтому внутри не нужны проверки на `undefined`;
  хуки в ней вызывать нельзя.
- `SectionCard` — карточка-раздел с заголовком (h2) и пояснением.
- `FormDialog` — диалог создания/правки: поля, ошибка мутации, две кнопки,
  Enter отправляет форму; пока идёт сохранение, диалог не закрывается.
- `ConfirmAction` — подтверждение действия вместо `window.confirm`. Если
  `onConfirm` вернул промис, диалог ждёт его с крутилкой на кнопке, а ошибку
  показывает у себя. Триггер передаётся функцией, поэтому одинаково работает
  с кнопкой, иконкой и пунктом меню.
- `useNotify()` — короткое уведомление о результате действия
  (`notify.success('Образ сохранён')`, `notify.error(...)`). Ошибки, без
  которых форму не исправить, по-прежнему показываются рядом с полями.
- `ChatBubble` / `ReadReceipt` — пузырь сообщения и галочки: один для чата и
  песочницы. Действия у сообщения видны при наведении, на тач-экранах — всегда.

### Стили

`sx`-объекты вынесены из компонентов в соседний файл `<Component>.styles.ts`
и типизированы как `SxStyles` (`Record<string, SxProps<Theme>>`):

```
ui/
  LoginPage.tsx
  LoginPage.styles.ts
```

Цвета — только из темы: стандартные токены MUI и свои (`background.subtle` —
подложка ленты, `chat.outgoing`, `chat.milestone*` — пузыри). Их типы — в
`shared/types/theme.d.ts`, значения — в `app/styles/theme.ts`. Hex в
компонентах не пишем; исключение — палитры графиков и аватаров в
`shared/config`, это данные, а не оформление.

Скругление карточек, бумаги и панелей — `shape.borderRadius` (12px), его
даёт тема. В `sx` число у `borderRadius` — **множитель** этого значения
(`borderRadius: 3` — это 36px, а не 3px), поэтому для карточек его не пишут
вовсе, а мелкие детали задают строкой (`'4px'`). Отступы `CardContent`,
заголовки таблиц, вкладки и `DialogActions` тоже настроены в теме.

Страницы с панелями (чаты, песочница) растягиваются на остаток экрана через
flex-цепочку `AppShell` → `AccountPage` → панель (`flex: 1 1 0`), без
`calc(100dvh - …)`.

### Пара тонкостей, которые легко сломать

- `entities/session` не импортирует `RootState` из `app` (это был бы импорт
  вверх по слоям). Селекторы типизированы структурно — через `WithSessionState`,
  под который `RootState` подходит автоматически.
- Токен нужен `shared/api`, но лежит в store. Поэтому `app/store` прокидывает
  getter через `setAuthTokenProvider`, а не наоборот.
- Сессия пишется в storage не из компонентов, а слушателем
  (`entities/session/model/lifecycle.ts`) на экшены `sessionEstablished` /
  `sessionCleared`.
- Теги кэша объявлены в одном месте — `shared/api/tags.ts` — и все сразу
  переданы в `createApi({ tagTypes })`, поэтому слайсам не нужен
  `enhanceEndpoints`. У тега один смысл `id`: список и одна запись — разные
  теги (`CHAT_LIST_TAG` / `CHAT_TAG`, `BOT_SANDBOX_LIST_TAG` / `BOT_SANDBOX_TAG`).
- Каждая страница за логином — отдельный слайс и отдельный чанк
  (`React.lazy` в `app/router`). Заглушку на время загрузки даёт `Suspense`
  в `AppShell`, а для вкладок аккаунта — `Suspense` вокруг `Outlet` в
  `AccountPage`, чтобы шапка не пропадала.
- В `package.json` стоит `"sideEffects": ["*.css"]`: без него сборщик
  считает, что любой модуль может иметь побочные эффекты, и через барели
  `index.ts` тянет в чанк страницы весь слайс. Если модуль нужен только ради
  побочного эффекта (кроме CSS), его придётся добавить в этот список.
- Цвета серий на графике закреплены за кодом по его числовому порядку среди
  показанных, а не по рангу (`widgets/account-stats/lib/buildSeries.ts`):
  при смене периода код не меняет цвет. Больше 6 кодов сворачиваются в
  «Другие коды». Палитра — `shared/config/chartPalette.ts`, порядок слотов
  проверен на различимость (в том числе при дальтонизме), не перетасовывать.
- Код из первого сообщения вычленяет backend (`apps/api/src/telegram/lib/lead-code.ts`);
  фронтенд только показывает готовый `leadCode`.
- `Tooltip` MUI по умолчанию подставляет свой текст в `aria-label` ребёнка.
  У кнопки с видимым текстом это подменяет её имя для экранного диктора —
  такие подсказки пишем с `describeChild`.

## Маршруты

| Путь                                      | Доступ                | Страница                  |
| ----------------------------------------- | --------------------- | ------------------------- |
| `/login`                                  | только гость          | `pages/login`             |
| `/`                                       | только авторизованный | редирект на `/accounts`   |
| `/accounts`                               | только авторизованный | `pages/accounts`          |
| `/accounts/:accountId`                    | только авторизованный | редирект на `…/stats`     |
| `/accounts/:accountId/stats`              | только авторизованный | `pages/account-stats`     |
| `/accounts/:accountId/chats`              | только авторизованный | `pages/account-chats`     |
| `/accounts/:accountId/chats/:chatId`      | только авторизованный | то же, с открытым чатом   |
| `/accounts/:accountId/handoffs`           | только авторизованный | `pages/account-handoffs`  |
| `/accounts/:accountId/bot?section=`       | только авторизованный | `pages/account-bot`       |
| `/accounts/:accountId/sandbox`            | только авторизованный | `pages/account-sandbox`   |
| `/accounts/:accountId/sandbox/:sessionId` | только авторизованный | то же, с открытой сессией |
| `*`                                       | всем                  | `pages/not-found`         |

Вкладки аккаунта — дочерние маршруты `pages/account`: шапка и вкладки
общие, содержимое — в `Outlet`. Заголовок вкладки браузера ставит
`useDocumentTitle`: «Чаты · Jakara — Dealogue AI».

Редиректом после успешного входа занимается `GuestRoute`: форма только
диспатчит `sessionEstablished`, а роутер сам уводит с `/login`.
`ProtectedRoute` запоминает исходный путь в `location.state.from`.

## Подключение к backend

### Авторизация

По умолчанию `VITE_API_URL` не задан, и мутация входа работает на **моке**
(`features/auth/login/api/mockLogin.ts`) с парой `demo` / `demo1234` — сети нет.
Живые события в этом режиме не подключаются.

Чтобы ходить в реальный API, скопируйте `.env.example` в `.env`:

```
VITE_API_URL=http://localhost:3000
```

Тогда пойдёт `POST {VITE_API_URL}/auth/login` с телом
`{ "login": "...", "password": "..." }` и ожиданием ответа:

```json
{
  "accessToken": "...",
  "user": { "id": "1", "login": "demo", "name": "Демо-пользователь" }
}
```

`400`/`401` показываются как «Неверный логин или пароль», остальные коды —
через `features/auth/login/lib/getLoginErrorMessage.ts`.

### Telegram

По умолчанию раздел ходит в `/telegram/*` backend'а (см.
[apps/api/README.md](../api/README.md#telegram)). Новые сообщения приходят
по SSE (см. «Живые события»); опрос — страховка на случай обрыва: аккаунты
раз в 30 секунд, переписка — в 30, список чатов — в 60 (он перезапрашивает
все загруженные страницы), статистика — раз в минуту.

Список чатов — `build.infiniteQuery` в `entities/chat/api/chatsApi.ts`:
страница — `ChatsPageDto`, следующая запрашивается с `cursor` из
`nextCursor`. Догрузку по прокрутке даёт `shared/lib/useInfiniteScroll`
(IntersectionObserver на маяке в конце списка), поиск уходит на сервер
через `useDebouncedValue` с паузой 300 мс.

Переписка — тоже `infiniteQuery`, но «следующая» страница там — более
старые сообщения, а маяк стоит сверху (`useInfiniteScroll({ edge: 'top' })`).
Положение ленты держит `widgets/chat-panel/lib/useFeedScroll`: внизу лента
липнет к низу и докручивается за новыми сообщениями, выше — после каждого
рендера на прежнее место возвращается первое видимое сообщение (его ищут по
`data-message-id`). Так не прыгает ни подгрузка старых страниц сверху, ни
новое сообщение снизу, ни перезапрос страниц, сдвигающий их границы.
Встроенная подстройка браузера (`overflow-anchor`) в ленте выключена, чтобы
не сдвигать дважды.

Мока у раздела нет: без поднятого backend'а с настроенным Telegram страница
аккаунтов покажет ошибку из ответа API (503 «Раздел Telegram не настроен»).

Контракт описан типами в `shared/api/contracts/telegram.ts`:

| Метод  | Путь                                                                          | Ответ                                                  |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/telegram/accounts`                                                          | `TelegramAccountDto[]`                                 |
| GET    | `/telegram/accounts/:id`                                                      | `TelegramAccountDto`                                   |
| DELETE | `/telegram/accounts/:id`                                                      | —                                                      |
| POST   | `/telegram/accounts/send-code` `{ phone }`                                    | `SendCodeResponse`                                     |
| POST   | `/telegram/accounts/sign-in` `{ attemptId, code }`                            | `SignInResponse` (`connected` или `password_required`) |
| POST   | `/telegram/accounts/password` `{ attemptId, password }`                       | `SubmitPasswordResponse`                               |
| GET    | `/telegram/accounts/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/Moscow` | `AccountStatsDto`                                      |
| GET    | `/telegram/accounts/:id/chats?cursor=&limit=100&search=&code=with\|without`   | `ChatsPageDto`                                         |
| GET    | `/telegram/accounts/:id/chats/:chatId`                                        | `ChatDto`                                              |
| GET    | `/telegram/accounts/:id/chats/:chatId/messages?cursor=&limit=50`              | `MessagesPageDto`                                      |
| POST   | `/telegram/accounts/:id/chats/:chatId/messages` `{ text }`                    | `MessageDto`                                           |

### Агент

Контракт — `shared/api/contracts/bot/`. Префикс всех путей —
`/telegram/accounts/:id`.

| Метод        | Путь                                                                                           | Ответ                                       |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| GET / PUT    | `/bot` (PUT: `{ persona?, timings?, model? }`)                                                 | `BotSettingsDto`                            |
| PUT          | `/bot/enabled` `{ enabled }`                                                                   | `BotSettingsDto`                            |
| POST         | `/bot/library/import` `{ mode: keep \| replace }`                                              | `LibraryImportResultDto`                    |
| GET / POST   | `/bot/library`                                                                                 | `LibraryItemDto[]` / `LibraryItemDto`       |
| PUT / DELETE | `/bot/library/:itemId`                                                                         | `LibraryItemDto` / —                        |
| GET / POST   | `/bot/examples`                                                                                | `ExampleDto[]` / `ExampleDto`               |
| PUT / DELETE | `/bot/examples/:exampleId`                                                                     | `ExampleDto` / —                            |
| GET          | `/bot/handoffs`                                                                                | `HandoffChatDto[]`                          |
| GET          | `/chats/:chatId/bot`                                                                           | `ChatBotStateResponse`                      |
| PUT          | `/chats/:chatId/bot/mode` `{ mode: auto \| off }`                                              | `ChatBotStateResponse`                      |
| GET          | `/chats/:chatId/bot/journal`                                                                   | `ChatJournalResponse`                       |
| POST         | `/chats/:chatId/bot/sandbox` `{ messageId? }`                                                  | `SandboxSessionDto`                         |
| GET / POST   | `/bot/sandbox` (POST: `{ title? }`)                                                            | `SandboxSummaryDto[]` / `SandboxSessionDto` |
| GET / DELETE | `/bot/sandbox/:sessionId`                                                                      | `SandboxSessionDto` / —                     |
| POST         | `/bot/sandbox/:sessionId/messages` `{ texts }`, `/respond`, `/read`, `/advance` `{ minutes? }` | `SandboxSessionDto`                         |
| PUT          | `/bot/sandbox/:sessionId/mode` `{ mode }`                                                      | `SandboxSessionDto`                         |

Действия песочницы возвращают сессию целиком — ею и обновляется кэш. Ход
идёт на сервере в фоне (`running: true`), пока он идёт, сессия опрашивается
раз в секунду.

Ошибки ожидаются в формате NestJS: `{ "message": "..." }` — текст показывается
пользователю как есть (`shared/lib/getApiErrorMessage.ts`).

## Живые события

`shared/api/realtime.ts` держит SSE-подключение по тикету, контракт событий —
`shared/api/contracts/realtime.ts`. `features/realtime` (`RealtimeProvider`)
превращает события в инвалидацию кэшей: новое сообщение обновляет переписку,
список чатов, состояние агента в чате и список «у менеджера», прочтение —
галочки и состояние агента. Опрос по таймеру остаётся страховкой на случай
обрыва соединения. При закрытии соединения недолетевший запрос тикета
отменяется; без backend'а (мок) подключения нет вовсе.
