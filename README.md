# dealogue-ai

Монорепозиторий из двух приложений.

```
apps/
  api/   NestJS + TypeORM + PostgreSQL — http://localhost:3000
  web/   React + Vite + TS (FSD, RTK Query) — http://localhost:5173
docker-compose.yml   PostgreSQL 16 для локальной разработки
```

## Требования

- Node.js 22+
- Docker (для Postgres)

> На этой машине установлен npm 8.5.4 при Node 22 — при установке зависимостей
> нужен флаг `--legacy-peer-deps` (или обновить npm: `npm i -g npm@latest`).

## Запуск с нуля

База:

```bash
docker compose up -d
```

Backend:

```bash
cd apps/api && cp .env.example .env && npm install --legacy-peer-deps && npm run migration:run && npm run start:dev
```

Frontend:

```bash
cd apps/web && cp .env.example .env && npm install --legacy-peer-deps && npm run dev
```

Логин по умолчанию: **demo** / **demo1234**. Пользователя заводит сид-миграция,
логин и пароль настраиваются через `SEED_USER_LOGIN` и `SEED_USER_PASSWORD`
в `apps/api/.env` — задать их нужно до первого `npm run migration:run`.

Если у `apps/web` нет `.env` с `VITE_API_URL`, форма входа работает на моке
и в сеть не ходит — удобно, когда backend не поднят.

## Telegram

Раздел «Аккаунты Telegram» подключает аккаунты пользователей через MTProto
(библиотека [teleproto](https://www.npmjs.com/package/teleproto)), отслеживает
входящие и исходящие сообщения и считает статистику по кодам из первых
сообщений. Из России Telegram доступен только через MTProxy — адрес задаётся
в `apps/api/.env`:

```
TELEGRAM_API_ID=…            # https://my.telegram.org/apps
TELEGRAM_API_HASH=…
TELEGRAM_SESSION_SECRET=…    # ключ шифрования сессий в базе
TELEGRAM_MTPROXY=host:port:secret[,host2:port2:secret2]
```

Подробности — в [apps/api/README.md](apps/api/README.md#telegram). Без этих
переменных backend отвечает на `/telegram/*` кодом 503, и фронтенд покажет
эту ошибку на странице аккаунтов — мока у раздела нет.

## Подробности

- [apps/api/README.md](apps/api/README.md) — эндпоинты авторизации, миграции,
  как добавлять пользователей.
- [apps/web/README.md](apps/web/README.md) — слои FSD, роуты, где лежат стили.

## Скрипты

| | api | web |
|---|---|---|
| dev | `npm run start:dev` | `npm run dev` |
| build | `npm run build` | `npm run build` |
| lint | `npm run lint` | `npm run lint` |
| миграции | `npm run migration:run` / `:revert` / `:show` | — |
