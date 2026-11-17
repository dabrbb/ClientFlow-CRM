# ClientFlow CRM: backend

A REST API for a small-team CRM: clients, deals and tasks, with JWT authentication, roles and per-client access. Built with **NestJS 11**, **Prisma 6** and **PostgreSQL**. There is no frontend in this repository.

The project overview, the architecture diagram and the roadmap are in the [root README](../README.md). This file covers what the backend does and how to run it.

## What it does

- **Authentication.** Register, login, logout and refresh. Short-lived access token plus a refresh token that is rotated on every refresh. Roles: `ADMIN` and `MANAGER`.
- **Clients.** Created by an admin into a pool; a manager takes a client from the pool, and several managers can work on one client. Pagination, search, filters and sorting. A client can be **archived** and **restored** (see [Archiving clients](#archiving-clients)).
- **Deals.** Linked to a client, with stages `NEW`, `QUALIFICATION`, `NEGOTIATION`, `WON`, `LOST` (`WON` and `LOST` are final) and an optional expected close date.
- **Tasks.** Assigned to a user, optionally linked to a deal, with a status endpoint and a `?mine=true` filter.
- **Notes.** Comments on a deal; only the author or an admin may change or delete a note.
- **Dashboard.** Counts and revenue over what the caller may see.
- **Activity log.** An append-only audit trail of data-changing requests, readable by an admin.

Access is decided per client. A manager sees a client, its deals, tasks and notes only while assigned to it; anything else answers **404**, the same as a missing record. An admin sees everything.

## Archiving clients

Clients are never physically deleted. Archiving sets `Client.deletedAt`, and restoring clears it. Deals, tasks and notes have no archive flag of their own: they are hidden through their client.

- **Who.** Only an `ADMIN` can archive a client, restore one, or list the archive. A manager gets **403** on all three routes and never sees an archived client.
- **Archive** (`DELETE /clients/:id`, 204). The client disappears from `GET /clients`, from the pool and from every route that reads or changes it (`GET`, `PATCH`, `claim`, managers). Its deals, notes and the tasks attached to those deals disappear too, for everyone including an admin: they answer 404 and are left out of lists. An archived or missing client answers 404, so archiving twice is a 404.
- **Tasks without a deal** are not tied to any client, so archiving does not affect them: they stay visible and editable.
- **Dashboard.** `clients`, `activeDeals`, `wonDeals`, `lostDeals`, `revenue` and `tasksToday` leave out archived clients and their data. A task without a deal still counts towards `tasksToday`.
- **Restore** (`POST /clients/:id/restore`, 201, returns the client). `deletedAt` goes back to `NULL`. Nothing else was touched when the client was archived, so its managers, deals, tasks and notes come back with the same access as before; nobody has to be assigned again. Restoring a client that is not archived is a **409**; a client that does not exist is a **404**.
- **Archive list** (`GET /clients/archived`). Admin only, `page` and `limit` (default 10, max 100), most recently archived first. Items are full client objects with `deletedAt`.
- **Activity log.** Archiving writes one `ARCHIVE` record and restoring writes one `RESTORE` record (entity `Client`, no details). Requests that fail write nothing.

## API

All routes except `register`, `login` and `refresh` require `Authorization: Bearer <access token>`.

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Create an account, returns tokens |
| POST | `/auth/login` | public | Log in, returns tokens |
| POST | `/auth/refresh` | refresh token | Exchange a refresh token for a new pair |
| POST | `/auth/logout` | signed in | Invalidate the refresh token |
| GET | `/users/me` | signed in | Current user |
| GET | `/users/colleagues` | signed in | Everyone as `id`, `name`, `role` |
| GET | `/users` | **ADMIN** | All users |
| POST | `/clients` | **ADMIN** | Create a client; it lands in the pool |
| GET | `/clients` | signed in | Your clients (an admin: all): `page`, `limit`, `search`, `status`, `createdAfter`, `managerId`, `sort`, `order` |
| GET | `/clients/pool` | signed in | Unassigned clients, short card: `page`, `limit` |
| GET | `/clients/archived` | **ADMIN** | Archived clients: `page`, `limit` |
| GET | `/clients/:id` | assigned / admin | Get a client |
| PATCH | `/clients/:id` | assigned / admin | Update a client |
| DELETE | `/clients/:id` | **ADMIN** | Archive a client (204) |
| POST | `/clients/:id/restore` | **ADMIN** | Restore an archived client |
| POST | `/clients/:id/claim` | signed in | Take a client from the pool |
| GET | `/clients/:id/managers` | assigned / admin | Managers of a client |
| POST | `/clients/:id/managers` | assigned / admin | Add a manager, body `{ "userId": 5 }` |
| DELETE | `/clients/:id/managers/:userId` | assigned / admin | Remove a manager (409 while they hold open tasks) |
| POST | `/deals` | assigned / admin | Create a deal |
| GET | `/deals` | signed in | Deals of the clients you may see |
| GET | `/deals/:id` | assigned / admin | Get a deal |
| PATCH | `/deals/:id` | assigned / admin | Update a deal (stage rule enforced) |
| POST | `/deals/:dealId/notes` | assigned / admin | Add a note to a deal |
| GET | `/deals/:dealId/notes` | assigned / admin | Notes of a deal, newest first |
| PATCH | `/notes/:id` | author / admin | Edit a note |
| DELETE | `/notes/:id` | author / admin | Delete a note (204, physical delete) |
| POST | `/tasks` | signed in | Create a task |
| GET | `/tasks` | signed in | Tasks you may see; `?mine=true` for those assigned to you |
| GET | `/tasks/:id` | see rules | Get a task |
| PATCH | `/tasks/:id` | see rules | Update a task, or hand it over with `assigneeId` |
| PATCH | `/tasks/:id/status` | see rules | Change only the status |
| GET | `/dashboard` | signed in | `clients`, `activeDeals`, `wonDeals`, `lostDeals`, `tasksToday`, `revenue` |
| GET | `/activity` | **ADMIN** | Activity log: `page`, `limit`, `entity`, `entityId`, `action`, `userId`, `createdAfter`, `createdBefore` |

"Assigned / admin" means the caller is assigned to the client, or is an admin. Tasks: a task with a deal is visible to everyone assigned to the deal's client; a task without a deal only to its assignee (and admins). Anything the caller may not see answers 404.

## Setup

Requirements: Node.js 20+ and a running PostgreSQL instance.

```bash
cd backend
npm install
cp .env.example .env            # then fill in DATABASE_URL and the two JWT secrets
npx prisma generate
npx prisma migrate deploy       # applies pending migrations, never resets the database
npm run start:dev               # http://localhost:3000
```

`.env` is validated at startup and the app refuses to boot if a value is missing or malformed. The variables are `DATABASE_URL`, `PORT`, `NODE_ENV`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (16+ characters each), `JWT_ACCESS_EXPIRES` and `JWT_REFRESH_EXPIRES` (a unit is required: `15m`, `7d`).

There is no API to make someone an admin. Promote the first one in the database (`UPDATE "User" SET role = 'ADMIN' WHERE email = '...'`) and log in again, because the role is stored in the token.

## Commands

```bash
npm run start:dev      # dev server with watch
npm run build          # compile to dist/
npm run start:prod     # run the compiled build
npm test               # unit tests
npm run test:cov       # with coverage
npm run lint           # ESLint, report only
npx tsc --noEmit --incremental false   # type-check
```

Always run tests through `npm test`: several dependencies are ESM-only and Jest needs Node's `--experimental-vm-modules` flag, which the script sets. Date-dependent code should be checked under several time zones, for example `TZ=Asia/Tokyo npm test`. The e2e script (`npm run test:e2e`) is not working yet; it is planned for the Docker stage.
