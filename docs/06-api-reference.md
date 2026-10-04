[Docs](./README.md) › **API reference**

# API reference

The Inspectra API is a JSON REST API with **30 endpoints**. Every request body and response shape is defined once in [`packages/shared`](../packages/shared/src), and the web app uses the same definitions.

- **Base URL (local):** `http://localhost:3001/api`. The web app calls it through its own `/api/*` proxy at `http://localhost:3000/api`.
- **Format:** JSON. Dates are ISO 8601 strings in UTC.
- **Auth:** a Clerk session token in the `Authorization: Bearer <token>` header.
- **Access:** every route needs a signed-in member of an organization, except `GET /health` (public) and `POST /organizations` (signed in, no organization yet).
- **Permissions:** routes marked with a role below return `403` for everyone else.

## Basics

**Responses** are the resource itself, or a list of them:

```json
{ "id": "3f0c…", "name": "North Warehouse", "address": "Unit 4, Trafford Park, Manchester", "timezone": "Europe/London" }
[ { "id": "3f0c…", "name": "North Warehouse", … } ]
```

**Errors** always have the same shape:

```json
{
  "error": {
    "code": "WORK_ORDER_REASON_REQUIRED",
    "message": "Give a reason when sending work back to the technician.",
    "requestId": "req_8c1d2e3f4a5b"
  }
}
```

Validation errors also include `details`: one `{ path, message }` per failed field.

| Status | Codes | Meaning |
| --- | --- | --- |
| `200` / `201` / `204` | | Success / created / deleted |
| `400` | `VALIDATION_FAILED` | The body, query or id is invalid |
| `401` | `UNAUTHENTICATED` | No token, or the session has expired |
| `403` | `FORBIDDEN`, `NO_ORGANIZATION` | Your role can't do this, or you're not in an organization yet |
| `404` | `NOT_FOUND` | Not found, or it belongs to another organization (the API never says which) |
| `409` | `CONFLICT`, `INSPECTION_ALREADY_SUBMITTED`, `ISSUE_NOT_OPEN`, `LAST_ADMIN` | The record already exists or has changed |
| `422` | `INSPECTION_INCOMPLETE`, `WORK_ORDER_INVALID_TRANSITION`, `WORK_ORDER_REASON_REQUIRED`, `VALIDATION_FAILED` | Valid input that breaks a business rule |
| `500` | `INTERNAL` | Something went wrong on the server. Quote the request ID. |

**Headers:** every response carries an `x-request-id`. You can send your own (8–64 letters, digits, `-` or `_`) to trace a request end to end.

---

## Account

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/me` | Any member | The signed-in user, their role and their organization |
| `POST` | `/organizations` | Signed in, no organization | Create an organization and become its admin |
| `GET` | `/health` | Public | Service status, version and uptime |

```json
{ "user": { "id": "…", "name": "Mohammad Khalid", "email": "…" }, "role": "ADMIN", "organization": { "id": "…", "name": "Northwind Facilities" } }
```

## Members `/members`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/members` | Any member | List members with their role |
| `POST` | `/members` | Admin | Invite someone (`name`, `email`, `role`) |
| `PATCH` | `/members/:userId` | Admin | Change a member's role |

Demoting the last admin fails with `LAST_ADMIN`.

## Sites `/sites`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/sites` | Any member | List sites |
| `POST` | `/sites` | Admin | Create a site (`name`, `address`, `timezone`) |
| `PATCH` | `/sites/:id` | Admin | Update a site |

`timezone` must be a real IANA timezone, like `Asia/Riyadh`.

## Assets `/assets`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/assets` | Any member | List assets |
| `GET` | `/assets/:id` | Any member | Get one asset |
| `POST` | `/assets` | Admin | Create an asset (`siteId`, `name`, `category`, `serial`, `location`, `status`) |
| `PATCH` | `/assets/:id` | Admin | Update an asset |

## Templates `/templates`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/templates` | Any member | List templates with their items |
| `POST` | `/templates` | Admin | Create a template |
| `PUT` | `/templates/:id` | Admin | Replace a template's name, description and items |

Items are saved in the order they're sent. Each needs a `prompt` and a `defaultSeverity` (`LOW`, `MEDIUM`, `HIGH` or `CRITICAL`). Between 1 and 100 items.

## Schedules `/schedules`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/schedules` | Any member | List schedules |
| `POST` | `/schedules` | Admin | Create a schedule |
| `PATCH` | `/schedules/:id` | Admin | Pause or resume (`{ "active": false }`) |
| `POST` | `/schedules/generate` | Admin | Run inspection generation now. Safe to repeat. |
| `DELETE` | `/schedules/:id` | Admin | Delete a schedule. Inspections it created stay. |

```json
{ "templateId": "…", "assetId": "…", "frequency": "WEEKLY", "timeOfDay": "08:30", "assigneeId": "…" }
```

`frequency` is `DAILY`, `WEEKLY` or `MONTHLY`. `timeOfDay` is `HH:mm` in the site's timezone. The assignee must be an inspector. `POST /schedules/generate` returns `{ "created": 2 }`.

## Inspections `/inspections`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/inspections` | Admin, Inspector | List inspections with their responses. Inspectors see their own. |
| `GET` | `/inspections/:id` | Admin, Inspector | Get one inspection |
| `POST` | `/inspections/:id/submit` | The assigned inspector | Submit every answer at once |

```json
{ "responses": [ { "id": "…", "result": "FAIL", "notes": "Gauge in the red.", "severity": "HIGH" } ] }
```

Every item must be answered (`PASS`, `FAIL` or `NA`), or it fails with `INSPECTION_INCOMPLETE`. Submitting opens one issue per `FAIL`, in the same transaction. A second submit fails with `INSPECTION_ALREADY_SUBMITTED`.

## Issues `/issues`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/issues` | Any member | List issues. Technicians see the ones behind their work orders. |
| `POST` | `/issues/:id/work-orders` | Admin | Create a work order (`assigneeId`, `dueAt`) |

The assignee must be a technician. Only `OPEN` issues can get a work order (otherwise `ISSUE_NOT_OPEN`); the issue moves to `IN_WORK`.

## Work orders `/work-orders`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/work-orders` | Any member | List work orders. Technicians see their own. |
| `GET` | `/work-orders/:id` | Any member | Get one work order |
| `POST` | `/work-orders/:id/transitions` | Depends on the move | Move it to a new status (`to`, optional `reason`) |

The allowed moves:

| From | To | Who | Notes |
| --- | --- | --- | --- |
| `OPEN` | `IN_PROGRESS` | The assigned technician | *Start work* |
| `IN_PROGRESS` | `ON_HOLD` | The assigned technician | *Put on hold* |
| `ON_HOLD` | `IN_PROGRESS` | The assigned technician | *Resume* |
| `IN_PROGRESS` | `COMPLETED` | The assigned technician | *Mark completed* |
| `COMPLETED` | `VERIFIED` | Inspector, Admin | *Verify*. Resolves the issue. |
| `COMPLETED` | `IN_PROGRESS` | Inspector, Admin | *Reject*. Needs a `reason`. |
| `OPEN` / `IN_PROGRESS` / `ON_HOLD` | `CANCELLED` | Admin | *Cancel*. Reopens the issue. |

Any other move fails with `WORK_ORDER_INVALID_TRANSITION`. If the work order changed since you loaded it, the move fails with `CONFLICT`.

## Audit log `/audit-events`

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `GET` | `/audit-events?entityType=&entityId=&limit=200` | Any member | The logbook, newest first. Technicians see the history of their own work orders and issues. |

`entityType` is one of `site`, `asset`, `template`, `schedule`, `inspection`, `issue`, `work_order` or `membership`. `limit` is 1–500.

```json
{ "id": "…", "actorId": "…", "entityType": "work_order", "entityId": "…", "action": "ASSIGNED", "message": "assigned WO-103 to Ahmed Nasser", "createdAt": "2026-10-02T19:34:00.000Z" }
```

---

<div align="center">

[← Database design](./05-database-design.md) · [Docs home](./README.md) · [Design system →](./07-design-system.md)

</div>
