[Docs](./README.md) › **Engineering decisions**

# Engineering decisions

The main choices behind Inspectra: what I picked, why, and what it costs. Good engineering is mostly trade-offs, so the costs are listed too.

## Key decisions

### One monorepo with a shared package

- **Why:** The web app and the API live in one repository with pnpm workspaces and Turborepo. Types, request schemas, permissions and the work order lifecycle live once in `@inspectra/shared`, so a change there breaks the build on both sides instead of breaking production.
- **Trade-off:** The shared package must be built before anything that uses it. Turborepo handles the order, but it's one more moving part than two separate repositories.

### Tenancy enforced in the data layer

- **Why:** Every table has an `organization_id`, and a Prisma extension adds it to every query and every insert, read from the current request. Services never filter by hand, so nobody can forget to. Without an organization in context, data access throws instead of returning everything.
- **Trade-off:** Nested writes skip Prisma's query extensions, so child rows are created with their own `createMany` calls. And one shared database means one noisy customer can slow down the others. Separate schemas or databases would isolate them further, at a much higher operating cost.

### Clerk for identity, our own data for everything else

- **Why:** Sign-up, passwords, email verification and sessions are a solved problem, and getting them wrong is expensive. Clerk answers *"who is this person?"*. Organizations, memberships and roles stay in our database, so permissions and the audit trail never depend on an outside service.
- **Trade-off:** Sign-in needs Clerk to be reachable, and running the project needs a Clerk account. One file (`clerk.service.ts`) talks to Clerk, so the tests replace it with a fake and swapping providers stays contained.

### Hourly generation, safe by design

- **Why:** A single midnight job would be "midnight" in only one timezone. Running every hour lets each site reach its own *today*. The job runs on BullMQ, so it retries on failure and only one schedule exists however many servers start.
- **How it stays correct:** The due-time maths is a pure function that takes *now* as an input, so it's easy to test across timezones and daylight saving changes. A unique key on *(schedule, due time)* blocks duplicates, even if two runs overlap.
- **Trade-off:** The worker runs inside the API process. That's fine at this size; heavy traffic would call for a separate worker process.

### The work order lifecycle as data

- **Why:** The allowed moves are one table: from, to, which roles, assignee only or not, reason required or not. The API enforces it, and the web app reads the same table to show only the buttons you can use. There's no list of `if` statements to keep in sync.
- **Trade-off:** Rules that don't fit a table, like *"verify only after a re-inspection"*, would need the table to grow, or code alongside it.

### Let the database guarantee correctness

- **Why:** Double clicks, retries and two people acting at once are normal. Unique keys stop duplicate inspections and issues. A conditional update (*"move to SUBMITTED only if still PENDING"*) means a second submit finds nothing to claim. Record numbers come from a locked counter row, so they never collide.
- **Trade-off:** Some failures surface as database errors that must be translated into friendly messages. One exception filter does that for the whole API.

### Audit events in the same transaction

- **Why:** The logbook is the product's proof of *"what was fixed, by whom, and when"*. Writing each event inside the same transaction as the change means a change can't happen without its record, and a record can't exist for a change that rolled back.
- **Trade-off:** Every write does a little more work. That's a cheap price for a history that can be trusted.

### Snapshot templates into inspections

- **Why:** When an inspection is created, it copies the template's name and each item's prompt. Templates can then be edited freely, and past inspections still show exactly what was asked.
- **Trade-off:** The same text is stored many times. Text is cheap; a history that changes under you isn't.

### The server is the source of truth

- **Why:** The web app never invents ids or saves locally. After every write it reloads the organization's data from the API, so every page shows what's really in the database.
- **Trade-off:** Reloading everything is simple and correct, but it does more work than needed. Large organizations would need paging and targeted refreshes.

### Hand-drawn SVG charts

- **Why:** The overview needs one chart and a few bar lists. Drawing them in SVG keeps the bundle small and gives full control over the look, including a table view of the same data.

## Known limitations

| Limitation | Why it matters |
| --- | --- |
| No photos on inspections | Inspectors can describe a failure, but can't attach a picture of it yet |
| No notifications | Nobody is emailed when an inspection is due or a work order is assigned; people have to open the app |
| Invites don't send an email | The invitee is added right away, but has to be told to sign up with that email |
| No organization switcher | The data model allows one person in several organizations, but the web app always opens the first one they joined |
| Sites, assets and templates can't be deleted | Only schedules can. Retiring an asset is the workaround. |
| Locations are free text | *"Floor 2, Server Room"* is a text field; there's no building → floor → room structure yet |
| The worker shares the API process | A busy API and the hourly job compete for the same resources |
| No frontend or end-to-end tests | The API and shared rules are well tested; the web app and the full browser flow aren't yet |

## What's next

1. **Photo evidence** on failed items and completed work orders, stored in object storage.
2. **Email notifications** for due inspections, new assignments and fixes awaiting verification.
3. **An offline-friendly inspection mode**, for basements and plant rooms with no signal.
4. **A separate worker process** for the job queue.
5. **Browser end-to-end tests** with Playwright, driving the web app against the real API.
6. **An organization switcher** and a building → floor → room hierarchy for assets.

---

<div align="center">

[← Getting started](./08-getting-started.md) · [Docs home](./README.md)

</div>
