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

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер с HMR |
| `npm run build` | `tsc -b` + production-сборка в `dist/` |
| `npm run preview` | локальный просмотр собранного `dist/` |
| `npm run lint` | oxlint |

## Что умеет

После входа пользователь попадает в раздел **Аккаунты Telegram**:

- список подключённых аккаунтов со статусом (подключён / ожидает
  подтверждения / отключён / ошибка), числом новых диалогов за сегодня
  и временем последней синхронизации;
- подключение аккаунта через диалог «как в Telegram»: номер → код из
  приложения → облачный пароль, если включена 2FA; переподключение
  отвалившегося аккаунта — тот же диалог с подставленным номером;
- удаление с подтверждением.

Внутри аккаунта две вкладки:

- **Статистика** — сколько людей написали первое сообщение за день и с каким
  кодом («#1», «# 1», «Код 6», «код - 6», «код: 6»; без совпадения — «Без кода»).
  Фильтр периода (сегодня, вчера, 7 / 30 дней или произвольные даты) живёт в query-строке
  `?from=&to=`, плитки с итогами и дельтой к прошлому периоду, столбчатый
  график с накоплением по кодам, таблица кодов с долями и таблица по дням.
- **Чаты** — список диалогов с поиском и фильтрами (с кодом, без кода) и переписка в режиме чтения; первое сообщение диалога помечено
  кодом. Выбранный чат — в URL.

## Архитектура (FSD)

Слои сверху вниз; импорт разрешён только вниз, обращение к чужому слайсу —
через его публичный API (`index.ts`), а не по внутренним путям.

```
src/
  app/                     инициализация приложения
    providers/             Redux Provider + ThemeProvider + CssBaseline
    router/                createBrowserRouter, ProtectedRoute, GuestRoute
    store/                 configureStore, типы RootState / AppDispatch
    styles/                тема MUI, global.css
  pages/
    login/                 форма входа
    accounts/              список аккаунтов Telegram
    account/               шапка аккаунта + вкладки (stats, chats)
    not-found/
  widgets/
    app-shell/             боковое меню + Outlet для авторизованной части
    account-stats/         дашборд статистики: фильтр периода, плитки, график, таблицы
    chat-panel/            список чатов + переписка
  features/
    auth/login/, auth/logout/
    telegram-account/connect/   диалог подключения (номер → код → 2FA)
    telegram-account/remove/    удаление с подтверждением
  entities/
    session/               слайс сессии, селекторы, хуки, персист в storage
    telegram-account/      аккаунт: типы, RTK Query (список, карточка, статистика), чип статуса, аватар
    chat/                  чат и сообщение: типы, RTK Query, чип кода, пузырь сообщения
  shared/
    api/                   baseApi (единственный createApi), провайдер токена,
                           contracts/ (DTO backend-API раздела Telegram)
    config/                env, ROUTES, палитра графиков
    lib/                   даты, форматирование, извлечение кода, ошибки API
    types/                 SxStyles
    ui/                    BrandMark, PageHeader, EmptyState, StatTile, StackedColumnChart
```

Алиас `@/*` указывает на `src/*` (настроен в `vite.config.ts` и `tsconfig.app.json`).

### Стили

`sx`-объекты вынесены из компонентов в соседний файл `<Component>.styles.ts`
и типизированы как `SxStyles` (`Record<string, SxProps<Theme>>`):

```
ui/
  LoginPage.tsx
  LoginPage.styles.ts
```

### Пара тонкостей, которые легко сломать

- `entities/session` не импортирует `RootState` из `app` (это был бы импорт
  вверх по слоям). Селекторы типизированы структурно — через `WithSessionState`,
  под который `RootState` подходит автоматически.
- Токен нужен `shared/api`, но лежит в store. Поэтому `app/store` прокидывает
  getter через `setAuthTokenProvider`, а не наоборот.
- Сессия пишется в storage не из компонентов, а слушателем
  (`entities/session/model/persistence.ts`) на экшены `sessionEstablished` /
  `sessionCleared`.
- Теги RTK Query для Telegram объявляет `entities/telegram-account`
  (`enhanceEndpoints`), а мутации из `features/telegram-account/*` инжектятся
  в тот же `accountsApi`, чтобы инвалидировать список теми же тегами.
- Цвета серий на графике закреплены за кодом по его числовому порядку среди
  показанных, а не по рангу (`widgets/account-stats/lib/buildSeries.ts`):
  при смене периода код не меняет цвет. Больше 6 кодов сворачиваются в
  «Другие коды». Палитра — `shared/config/chartPalette.ts`, порядок слотов
  проверен на различимость (в том числе при дальтонизме), не перетасовывать.
- Код из первого сообщения вычленяет backend (`apps/api/src/telegram/lib/lead-code.ts`);
  фронтенд только показывает готовый `leadCode`.

## Маршруты

| Путь | Доступ | Страница |
|---|---|---|
| `/login` | только гость | `pages/login` |
| `/` | только авторизованный | редирект на `/accounts` |
| `/accounts` | только авторизованный | `pages/accounts` |
| `/accounts/:accountId` | только авторизованный | редирект на `…/stats` |
| `/accounts/:accountId/stats` | только авторизованный | `pages/account` → статистика |
| `/accounts/:accountId/chats` | только авторизованный | `pages/account` → чаты |
| `/accounts/:accountId/chats/:chatId` | только авторизованный | то же, с открытым чатом |
| `*` | всем | `pages/not-found` |

Редиректом после успешного входа занимается `GuestRoute`: форма только
диспатчит `sessionEstablished`, а роутер сам уводит с `/login`.
`ProtectedRoute` запоминает исходный путь в `location.state.from`.

## Подключение к backend

### Авторизация

По умолчанию `VITE_API_URL` не задан, и мутация входа работает на **моке**
(`features/auth/login/api/mockLogin.ts`) с парой `demo` / `demo1234` — сети нет.

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
[apps/api/README.md](../api/README.md#telegram)). Списки аккаунтов, чатов и
сообщений опрашиваются раз в 30 / 15 / 10 секунд, статистика — раз в минуту,
так что новые сообщения появляются без перезагрузки.

Мока у раздела нет: без поднятого backend'а с настроенным Telegram страница
аккаунтов покажет ошибку из ответа API (503 «Раздел Telegram не настроен»).

Контракт описан типами в `shared/api/contracts/telegram.ts`:

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/telegram/accounts` | `TelegramAccountDto[]` |
| GET | `/telegram/accounts/:id` | `TelegramAccountDto` |
| DELETE | `/telegram/accounts/:id` | — |
| POST | `/telegram/accounts/send-code` `{ phone }` | `SendCodeResponse` |
| POST | `/telegram/accounts/sign-in` `{ attemptId, code }` | `SignInResponse` (`connected` или `password_required`) |
| POST | `/telegram/accounts/password` `{ attemptId, password }` | `SubmitPasswordResponse` |
| GET | `/telegram/accounts/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/Moscow` | `AccountStatsDto` |
| GET | `/telegram/accounts/:id/chats` | `ChatDto[]` |
| GET | `/telegram/accounts/:id/chats/:chatId/messages` | `MessageDto[]` |

Ошибки ожидаются в формате NestJS: `{ "message": "..." }` — текст показывается
пользователю как есть (`shared/lib/getApiErrorMessage.ts`).

## ИИ-агент (что где лежит)

- `shared/api/contracts/{ai,alerts,realtime}.ts` — зеркала backend-контрактов;
  `shared/api/realtime.ts` — SSE-подключение по тикету.
- `entities/ai-agent` — RTK Query для настроек/обучения/чата (инжектится в
  `chatsApi`, чтобы включение ИИ инвалидировало список чатов), метаданные причин
  паузы и пометок, чипы. `entities/alert` — алерты.
- `features/ai-agent/toggle-chat` — переключатель в шапке чата;
  `edit-settings` — форма скрипта и настроек; `learning` — выгрузка истории,
  обучение, профиль с правками; `test-generate` — песочница.
- `features/realtime` — `RealtimeProvider` (SSE → инвалидация кэшей, тост и
  браузерное уведомление на алерт, без звука). `features/alerts/manage` — ack/resolve.
- `widgets/attention-list`, `pages/attention` — раздел «Требуют внимания»;
  `pages/account/ui/AccountAiPage.tsx` — вкладка «ИИ-агент» (`?tab=`).

| Путь | Страница |
|---|---|
| `/attention` | `pages/attention` |
| `/accounts/:accountId/ai` | `pages/account` → `AccountAiPage` |
