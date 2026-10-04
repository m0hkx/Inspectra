[Docs](./README.md) › **Features**

# Features

What each page does, in plain words. Every page shares the same toolkit: **record numbers** like `INS-1048` and `WO-102`, **status labels**, **filters**, and a **search box** (`Ctrl K` / `⌘ K`) across every record your role can see.

## Who can do what

Every person in an organization has one of three roles. The navigation only shows the pages a role can use, and the API checks the same rules on every request.

| | Admin | Inspector | Technician |
| --- | :-: | :-: | :-: |
| Set up sites, assets, templates and schedules | ✅ | | |
| Invite members and change roles | ✅ | | |
| Fill in and submit inspections | | ✅ *(their own)* | |
| See issues | ✅ | ✅ | *Only behind their work orders* |
| Create and assign work orders | ✅ | | |
| Start, pause and complete work | | | ✅ *(their own)* |
| Verify or reject a fix | ✅ | ✅ | |
| Cancel a work order | ✅ | | |

## Pages

### 🔐 Sign in and onboarding

- Sign in or create an account with Clerk. A deep link survives sign-in, so you land where you were going.
- If an admin already invited your email, your first sign-in puts you straight into their organization. Your email must be verified first, so nobody can sign up as someone else's invitee.
- Not invited anywhere? Name a new organization and you become its admin.

### 📊 Overview

- **Needs attention:** overdue inspections, issues without a work order, and fixes awaiting verification. Each one links to the list behind it.
- **Inspection activity:** completed inspections per day, split into *all passed* and *with failed items*, with a 7-day average line. Switch between *Week*, *Month* and *Quarter*, or flip the chart into a table.
- Pass-first-time rate, failed items caught, and inspections completed per day.
- **Inspections due** with a 7-day strip, **open issues** by severity, and **work orders** by status.
- **Next inspections** and the **logbook** of recent activity.
- The main button changes with the role: *Review open issues* for admins, *Start next inspection* for inspectors, *Open my work orders* for technicians.

### 📋 Inspections

- Tabs for *Due*, *Overdue* and *Submitted*. Admins see every inspection; inspectors see the ones assigned to them.
- Due times are shown in the site's local time. An inspection is overdue as soon as its due time passes.
- **Filling one in:** each item gets *Pass*, *Fail* or *N/A*. A failed item asks what's wrong and how serious it is.
- A sticky footer counts *"6 of 8 checked"*. Submit only unlocks once every item has an answer.
- Before submitting with failures, a dialog lists each failed item, because each one will open an issue. Answers can't be changed after submitting.
- Anyone else opening the checklist sees it read-only.

### ⚠️ Issues

- One issue per failed item, with the inspector's note, the asset, the severity and the inspection it came from.
- Filter by status and severity.
- Admins turn an open issue into a work order: pick a technician and a due date.

### 🔧 Work orders

- A board with four columns: *Open*, *In progress*, *On hold* and *Awaiting verification*. Closed work orders are listed below.
- Technicians only see work orders assigned to them.
- **The detail page** shows the issue, the inspector's note, the asset and the due date, plus a *What you can do* panel with only the moves your role allows right now.
- **Rejecting** a fix asks *"What still needs fixing?"* and sends it back to the technician with that note.
- A **logbook** on every work order shows each step: who created it, who it was assigned to, every status change, and who verified it.

### 📦 Assets

- Every piece of equipment, with category, serial number, site, location, open issues and status (*Active*, *Out of service* or *Retired*).
- Filter by site and status.
- Open an asset to see its open issues, its inspection history and its schedules. Admins can edit it from there.

### 🏢 Sites

- Name, address and timezone for each place your equipment lives.
- The timezone matters: every schedule at that site runs in its local time.

### ✅ Templates

- Build a checklist: a name, a description and an ordered list of items. Move items up and down, or remove them.
- Each item has a default severity (*Low*, *Medium*, *High* or *Critical*) used when it fails. The inspector can change it.
- Editing a template only changes **future** inspections. Past ones keep the questions that were actually asked.

### 📅 Schedules

- Choose a template, an asset, how often (*daily*, *weekly* or *monthly*), a time in the site's timezone, and an inspector.
- See the next inspection in local time and in UTC.
- **Pause** or **resume** a schedule, or **delete** it. Deleting stops future inspections; the ones it already created stay in the records.
- **Create due inspections now** runs the hourly job on demand, safely.

### 👥 Members

- Invite someone by name, email and role. They join the organization the first time they sign in with that email.
- Change anyone's role. Each role shows a one-line description of what it can do.
- An organization always keeps at least one admin, so you can't lock yourself out.

## What happens automatically

These run without anyone clicking a button:

| Automation | What it does |
| --- | --- |
| **Hourly inspections** | Every hour, on the hour (and once when the API starts), each active schedule creates its current inspection. *Daily* → today, *Weekly* → Monday, *Monthly* → the 1st, at the schedule's time in the site's timezone. |
| **No duplicates** | A unique key on *(schedule, due time)* means each inspection is created exactly once, even if the job runs twice or on two servers at once. |
| **Overdue** | An inspection becomes overdue the moment its due time passes. It's worked out from the due time, not stored, so it's never out of date. |
| **Failed item → issue** | Submitting an inspection opens one issue per failed item, in the same transaction. A retried submit can't open a second issue. |
| **Issue status follows the work** | Creating a work order moves the issue to *In work*. Verifying the fix resolves it. Cancelling the work order reopens it. |
| **Record numbers** | Each organization gets its own `INS-`, `ISS-` and `WO-` sequence, handed out with a row lock so two people never get the same number. |
| **Audit trail** | Every create, assignment, status change, rejection and role change is written to the logbook in the same transaction as the change. |
| **Retries** | If the hourly job fails, it retries up to 3 times, waiting longer each time. |

## Built for everyone

- **Responsive:** the navigation scrolls on small screens and the search box moves below it. The inspection checklist is built for a phone on the shop floor, with large Pass / Fail / N/A buttons.
- **Accessible:** a *Skip to content* link, a visible focus ring, keyboard-friendly radio groups for answers, and every status shown with a text label (never colour alone).
- **Friendly errors:** the server's own message is shown, and unexpected errors include a request ID you can quote.

---

<div align="center">

[← Screenshots](./02-screenshots.md) · [Docs home](./README.md) · [System design →](./04-system-design.md)

</div>
