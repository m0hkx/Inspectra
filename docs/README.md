<div align="center">

<img src="./images/logo.svg" alt="Inspectra logo" width="72" />

# Inspectra

**From failed check to verified fix.**

A multi-tenant SaaS that schedules equipment inspections, turns failed checks into work orders, and proves what was fixed, by whom, and when.

![Next.js](https://img.shields.io/badge/Next.js-16-141414?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-141414?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-141414?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-141414?style=flat-square&logo=tailwindcss&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-12-141414?style=flat-square&logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-141414?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-141414?style=flat-square&logo=prisma&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-BullMQ-141414?style=flat-square&logo=redis&logoColor=white)

[Case study](./01-case-study.md) · [Screenshots](./02-screenshots.md) · [Run it locally](./08-getting-started.md) · [Repository](https://github.com/m0hkx/Inspectra)

</div>

<img src="./images/case-study-cover.png" alt="Inspectra case study cover: the operations overview with 12 inspections due today, 3 overdue, 7 open issues and a work order awaiting verification" width="100%" />

## At a glance

- **What it is:** An inspection and maintenance tracker for facilities teams: schedule checks on equipment, catch what fails, fix it, and prove it was fixed
- **Type:** Full-stack, multi-tenant SaaS: a Next.js web app and a NestJS REST API on PostgreSQL and Redis, in one monorepo
- **My role:** Solo project: product design, UI design, frontend, backend, database and DevOps
- **Scale:** 9 main screens · 30 API endpoints · 13 database tables · 170+ automated tests
- **Year:** 2026

## Try it

There's no shared demo account. Sign up with Clerk, name your organization, and you become its admin. Then invite your team as **inspectors** or **technicians** from the *Members* page.

> [!TIP]
> Running it yourself? One command starts the whole stack in Docker. See [Getting started](./08-getting-started.md).

## Highlights

- **One closed loop.** A schedule creates an inspection, a failed item opens an issue, the issue becomes a work order, and an inspector verifies the fix. Every step links back to the one before it.
- **Inspections create themselves.** An hourly background job creates each due inspection in the site's own timezone, and a unique database key makes a duplicate impossible.
- **Every organization is walled off.** The data layer adds the organization filter to every query by itself, so no endpoint can forget it.
- **Rules live in one place.** Roles, permissions and the work order lifecycle are defined once and shared by the API and the web app.
- **A logbook you can trust.** Every change writes an audit event in the same database transaction, so the history can't miss a step.
- **Tested for real.** 170+ unit and integration tests run against a real PostgreSQL database on every push.

## Tech stack

| Layer | Tools |
| --- | --- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Phosphor icons |
| **Backend** | NestJS 12, TypeScript, Zod validation |
| **Database** | PostgreSQL 18 with Prisma 7 |
| **Background jobs** | Redis 8 and BullMQ |
| **Auth** | Clerk for sign-in; organizations, memberships and roles are Inspectra's own data |
| **Tooling** | pnpm workspaces, Turborepo, Jest, Supertest, Docker Compose, GitHub Actions |

## Documentation

| # | Page | What you'll find |
| :-: | --- | --- |
| 1 | [Case study](./01-case-study.md) | The problem, the solution, and what I learned |
| 2 | [Screenshots](./02-screenshots.md) | A tour of every screen |
| 3 | [Features](./03-features.md) | What each page does, who can do what, and what runs in the background |
| 4 | [System design](./04-system-design.md) | How the web app, API, database and job queue work together |
| 5 | [Database design](./05-database-design.md) | The tables and how they connect |
| 6 | [API reference](./06-api-reference.md) | Every endpoint on one page |
| 7 | [Design system](./07-design-system.md) | Colours, type, shapes and components |
| 8 | [Getting started](./08-getting-started.md) | Run the project on your machine |
| 9 | [Engineering decisions](./09-engineering-decisions.md) | Key choices, trade-offs and next steps |

## Preview

<img src="./images/desktop-preview.jpg" alt="Inspectra overview on a desktop monitor" width="100%" />

<div align="center">

**[See all screenshots →](./02-screenshots.md)**

</div>

---

<div align="center">

Designed and built by [**@m0hkx**](https://github.com/m0hkx)

</div>
