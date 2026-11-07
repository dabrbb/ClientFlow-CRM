# ClientFlow CRM

A REST API for a small-team CRM: clients, sales deals and tasks, with JWT authentication and role-based access.

> 🚧 **Work in progress.** The backend core is in place and covered by unit tests; see the [roadmap](#roadmap) for what comes next.

## Tech stack

- **NestJS 11** with **TypeScript**
- **PostgreSQL** with **Prisma ORM** (schema and migrations)
- **JWT** access and refresh tokens with **Passport**, passwords hashed with **bcrypt**
- **class-validator** / **class-transformer** for request validation
- **Jest** for unit tests, **ESLint** and **Prettier**

## What works today

**Authentication**
- Register, login, logout and token refresh
- Short-lived access token plus a refresh token that is **rotated on every refresh**; only a bcrypt hash of the refresh token is stored, so a database leak does not expose live tokens
- Roles (`ADMIN`, `MANAGER`) with a custom `@Roles()` decorator and `RolesGuard`

**Clients**
- Create, read, update
- Pagination, text search, filters by status and creation date, sorting by name or date

**Deals**
- Create, read, update, linked to a client
- Deal stages: `NEW`, `QUALIFICATION`, `NEGOTIATION`, `WON`, `LOST`. An open deal can move to any stage, including skipping or going back. `WON` and `LOST` are final: trying to move a closed deal returns **409 Conflict**. Other fields of a closed deal stay editable.
- Optional expected close date (date only, no time-zone drift)

**Tasks**
- Create, read, update, assigned to a user and optionally linked to a deal
- Separate status endpoint, and a `?mine=true` filter for the current user's tasks

**Quality**
- Environment variables validated at startup: the app refuses to boot with a missing secret or a malformed duration
- Global `ValidationPipe` with whitelisting: unknown fields are rejected with 400
- **574 unit tests** across services, repositories, controllers and DTOs

## Architecture

Each feature is a NestJS module split into three layers:

```
controller  →  service  →  repository  →  Prisma
(HTTP, DTOs)   (business rules)  (data access)
```

Controllers only handle HTTP and validation, services hold the business rules (for example the deal stage transition rule), and repositories are the only layer that talks to Prisma. This keeps the rules testable without a database.

```
backend/src
├── auth/        # login, register, refresh, JWT strategies and guards
├── users/       # current user, user list (admin only)
├── clients/
├── deals/
├── tasks/
├── common/      # @CurrentUser, @Roles, RolesGuard
├── config/      # environment validation
└── prisma/      # PrismaService
```

## Data model

```mermaid
erDiagram
    User ||--o{ Client : owns
    User ||--o{ Task : "is assigned"
    User ||--o{ Note : writes
    User ||--o{ ActivityLog : performs
    Client ||--o{ Deal : has
    Deal ||--o{ Task : has
    Deal ||--o{ Note : has
```

`Note` and `ActivityLog` already exist in the schema; their API modules are on the roadmap.

## API

All routes except `register`, `login` and `refresh` require `Authorization: Bearer <access token>`.

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Create an account, returns tokens |
| POST | `/auth/login` | Log in, returns tokens |
| POST | `/auth/refresh` | Exchange a refresh token for a new pair |
| POST | `/auth/logout` | Invalidate the refresh token |
| GET | `/users/me` | Current user |
| GET | `/users` | All users (**ADMIN** only) |
| POST | `/clients` | Create a client |
| GET | `/clients` | List: `page`, `limit`, `search`, `status`, `createdAfter`, `sort`, `order` |
| GET | `/clients/:id` | Get a client |
| PATCH | `/clients/:id` | Update a client |
| POST | `/deals` | Create a deal |
| GET | `/deals` | List deals |
| GET | `/deals/:id` | Get a deal |
| PATCH | `/deals/:id` | Update a deal (stage rule enforced) |
| POST | `/tasks` | Create a task |
| GET | `/tasks` | List tasks, `?mine=true` for your own |
| GET | `/tasks/:id` | Get a task |
| PATCH | `/tasks/:id` | Update a task |
| PATCH | `/tasks/:id/status` | Change only the status |

## Getting started

Requirements: Node.js 20+ and a running PostgreSQL instance.

```bash
cd backend
npm install
cp .env.example .env          # then fill in DATABASE_URL and two JWT secrets (16+ chars)
npx prisma migrate dev
npm run start:dev             # http://localhost:3000
```

Run the tests:

```bash
npm test
npm run test:cov              # with coverage report
```

## Roadmap

The project is built in 15 stages, each finished stage landing as its own commit.

**Done**
- [x] 1. NestJS project setup
- [x] 2. Prisma + PostgreSQL: schema and migrations
- [x] 3. Auth: JWT access and refresh tokens with rotation
- [x] 4. Users and roles (`ADMIN`, `MANAGER`)

**Implemented, closing the gaps**
- [x] 5. Clients CRUD
- [x] 6. Pagination, search, filters and sorting for clients
- [x] 7. Deals CRUD, linked to clients, with an expected close date
- [x] 8. Deal stages with transition rules (`WON` / `LOST` are final, 409 otherwise)
- [x] 9. Tasks: assignee, status endpoint, "my tasks" filter
- [ ] Ownership checks: a manager sees and edits only their own records, an admin sees everything
- [ ] `manager` filter on `GET /clients` (depends on the ownership model)

**Next**
- [ ] 10. Notes: comments on deals
- [ ] 11. Dashboard: pipeline value per stage, won deals, overdue tasks
- [ ] 12. Activity log: who changed what and when
- [ ] 13. Soft delete: archive clients (the `deletedAt` column is ready)
- [ ] 14. Swagger docs and a global error handler (consistent error format, Prisma errors mapped to HTTP)
- [ ] 15. Docker Compose, seed data, end-to-end tests against a real database, CI

**After the plan**
- [ ] Public demo deployment
- [ ] Web frontend

## Author

**Artem Volodin**, junior backend developer based in Alicante, Spain. [GitHub](https://github.com/dabrbb) · [LinkedIn](https://www.linkedin.com/in/artem-volodin-04a235283/)
