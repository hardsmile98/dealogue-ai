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
- **Чаты** — все диалоги аккаунта: список догружается по 100 при прокрутке
  вниз, поиск и фильтры (с кодом, без кода) работают на сервере по всем
  чатам, а не только по загруженным. Справа — переписка: открывается на
  свежих сообщениях, при прокрутке вверх догружает более старые по 50, не
  сбивая положение; отправка сообщений от имени аккаунта; первое сообщение
  диалога помечено кодом. Выбранный чат — в URL, по прямой ссылке он
  открывается, даже если в списке ещё не загружен.

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
  widgets/                 готовые блоки, из которых собраны страницы
    app-shell/             боковое меню + Outlet для авторизованной части
    account-stats/         дашборд статистики: фильтр периода, плитки, график, таблицы
    chat-panel/            список чатов + переписка
  features/                действия пользователя
    auth/login/, auth/logout/
    telegram-account/connect/   диалог подключения (номер → код → 2FA)
    telegram-account/remove/    удаление с подтверждением
    realtime/                   SSE-подключение и реакция на события
  entities/
    session/               слайс сессии, селекторы, хуки, персист в storage
    telegram-account/      аккаунт: типы, RTK Query (список, карточка, статистика), чип статуса, аватар
    chat/                  чат и сообщение: типы, RTK Query, чип кода, пузырь сообщения
  shared/
    api/                   baseApi (единственный createApi), провайдер токена,
                           tags.ts (реестр тегов кэша), contracts/ (DTO backend-API)
    config/                env, ROUTES, палитра графиков
    lib/                   даты, форматирование, ошибки API, хелперы RTK Query,
                           хуки useDebouncedValue и useInfiniteScroll
    types/                 SxStyles
    ui/                    BrandMark, PageHeader, EmptyState, StatTile, StackedColumnChart,
                           QueryBoundary, SectionCard, FormDialog, ConfirmAction
```

Алиас `@/*` указывает на `src/*` (настроен в `vite.config.ts` и `tsconfig.app.json`).

### Что где лежит

Слой определяется не темой, а ролью:

- **entities** — данные: RTK Query-эндпоинты, типы, метаданные (подписи
  статусов) и мелкие представления одной записи (чип, аватар, пузырь).
- **features** — действие пользователя: войти, подключить или удалить аккаунт.
- **widgets** — собранный блок экрана из нескольких сущностей и фич: дашборд
  статистики, панель чатов. Они ничего не «делают», они компонуют.
- **pages** — маршрут: собирает виджеты и отдаёт им `accountId` из URL.

### Общие примитивы `shared/ui`

Четыре компонента убирают обвязку, которая иначе расползается по панелям:

- `QueryBoundary` — три состояния запроса RTK Query (ошибка, загрузка, пусто)
  одинаково во всём приложении. Дети — функция от данных, поэтому внутри
  не нужны проверки на `undefined`; хуки в ней вызывать нельзя.
- `SectionCard` — карточка-раздел с заголовком и пояснением.
- `FormDialog` — диалог создания/правки: поля, ошибка мутации, две кнопки,
  Enter отправляет форму.
- `ConfirmAction` — подтверждение необратимого действия вместо `window.confirm`.
  Триггер передаётся функцией, поэтому одинаково работает с кнопкой и иконкой.

### Стили

`sx`-объекты вынесены из компонентов в соседний файл `<Component>.styles.ts`
и типизированы как `SxStyles` (`Record<string, SxProps<Theme>>`):

```
ui/
  LoginPage.tsx
  LoginPage.styles.ts
```

Скругления карточек, бумаги и скелетонов задаёт тема (`shape.borderRadius`),
дублировать их через `sx={{ borderRadius: 3 }}` не нужно.

### Пара тонкостей, которые легко сломать

- `entities/session` не импортирует `RootState` из `app` (это был бы импорт
  вверх по слоям). Селекторы типизированы структурно — через `WithSessionState`,
  под который `RootState` подходит автоматически.
- Токен нужен `shared/api`, но лежит в store. Поэтому `app/store` прокидывает
  getter через `setAuthTokenProvider`, а не наоборот.
- Сессия пишется в storage не из компонентов, а слушателем
  (`entities/session/model/lifecycle.ts`) на экшены `sessionEstablished` /
  `sessionCleared`.
- Теги кэша объявлены в одном месте — `shared/api/tags.ts`. На приложение один
  `createApi`, поэтому пространство тегов общее, и сущности не импортируют друг
  друга ради тега. Мутации из `features/*` инжектятся в api той же сущности,
  чтобы инвалидировать кэш теми же тегами.
- Страницы за логином подключены через `React.lazy`: в первый чанк попадает
  только форма входа. Заглушку на время загрузки даёт `Suspense` в `AppShell`.
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

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/telegram/accounts` | `TelegramAccountDto[]` |
| GET | `/telegram/accounts/:id` | `TelegramAccountDto` |
| DELETE | `/telegram/accounts/:id` | — |
| POST | `/telegram/accounts/send-code` `{ phone }` | `SendCodeResponse` |
| POST | `/telegram/accounts/sign-in` `{ attemptId, code }` | `SignInResponse` (`connected` или `password_required`) |
| POST | `/telegram/accounts/password` `{ attemptId, password }` | `SubmitPasswordResponse` |
| GET | `/telegram/accounts/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/Moscow` | `AccountStatsDto` |
| GET | `/telegram/accounts/:id/chats?cursor=&limit=100&search=&code=with\|without` | `ChatsPageDto` |
| GET | `/telegram/accounts/:id/chats/:chatId` | `ChatDto` |
| GET | `/telegram/accounts/:id/chats/:chatId/messages?cursor=&limit=50` | `MessagesPageDto` |
| POST | `/telegram/accounts/:id/chats/:chatId/messages` `{ text }` | `MessageDto` |

Ошибки ожидаются в формате NestJS: `{ "message": "..." }` — текст показывается
пользователю как есть (`shared/lib/getApiErrorMessage.ts`).

## Живые события

`shared/api/realtime.ts` держит SSE-подключение по тикету, контракт событий —
`shared/api/contracts/realtime.ts`. `features/realtime` (`RealtimeProvider`)
превращает события в инвалидацию кэшей: новое сообщение обновляет переписку и
список чатов, прочтение — галочки в переписке. Опрос по таймеру остаётся
страховкой на случай обрыва соединения.
