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

## Структура

```
src/
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
