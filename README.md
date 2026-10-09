<div align="center">

<img src="docs/images/logo.svg" alt="Inspectra logo" width="72" />

# Inspectra

**From failed check to verified fix.**

A multi-tenant SaaS that schedules equipment inspections, turns failed checks into work orders, and proves what was fixed, by whom, and when.

**[Read the documentation →](./docs/README.md)**

</div>

<img src="docs/images/case-study-cover.png" alt="Inspectra case study cover" width="100%" />

## Key documents

| Document | What you'll find |
| --- | --- |
| [Features](./docs/03-features.md) | What each page does, in plain words |
| [API reference](./docs/06-api-reference.md) | All 30 endpoints and who can call them |
| [System design](./docs/04-system-design.md) | How the web app, API, database and job queue fit together |
| [Database design](./docs/05-database-design.md) | The 13 tables and how they connect |

## What's in this repository

| Folder | What it is | Stack |
| --- | --- | --- |
| [`apps/web/`](./apps/web) | The web app | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Clerk |
| [`apps/api/`](./apps/api) | The REST API | NestJS 12 · TypeScript · PostgreSQL · Prisma · Redis · BullMQ |
| [`packages/shared/`](./packages/shared) | Types, Zod schemas and business rules used by both apps | TypeScript · Zod |
| [`docker/`](./docker) | Runs the whole stack with one command | Docker Compose |
| [`docs/`](./docs) | Project documentation | |

## Try it

There's no shared demo account. Sign up with Clerk, name your organization, and you're its admin. Then invite teammates as inspectors or technicians.

Running it yourself? See [Getting started](./docs/08-getting-started.md).

---

<div align="center">

Designed and built by [**@m0hkx**](https://github.com/m0hkx)

</div>
