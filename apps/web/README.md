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
  pages/                   login, home, not-found
  features/                действия пользователя
    auth/login/            форма входа, мутация RTK Query, валидация
    auth/logout/           кнопка выхода
  entities/
    session/               слайс сессии, селекторы, хуки, персист в storage
  shared/
    api/                   baseApi (единственный createApi) + провайдер токена
    config/                env, ROUTES
    lib/                   мелкие утилиты
    types/                 SxStyles
    ui/                    BrandMark
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

## Маршруты

| Путь | Доступ | Страница |
|---|---|---|
| `/login` | только гость | `pages/login` |
| `/` | только авторизованный | `pages/home` |
| `*` | всем | `pages/not-found` |

Редиректом после успешного входа занимается `GuestRoute`: форма только
диспатчит `sessionEstablished`, а роутер сам уводит с `/login`.
`ProtectedRoute` запоминает исходный путь в `location.state.from`.

## Подключение к backend

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
Такого эндпоинта в `apps/api` пока нет — его нужно реализовать.
