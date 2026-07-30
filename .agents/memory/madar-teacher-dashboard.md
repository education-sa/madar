---
name: Madar teacher dashboard
description: How the مدار (Madar) teacher-dashboard feature was built and verified — constraints, staging approval process, and a verification trick for session-authenticated SPAs.
---

## Constraints from the user (still apply to future work on this feature)
- Never touch, remove, or restructure the existing public static site pages — the teacher dashboard is purely additive (`/teacher/*`, `/api/teacher/*`).
- Free services only (Replit built-in Postgres, no paid APIs).
- No `git push` / no publish without explicit approval each time.
- Must pause for explicit approval before enabling any database/auth/paid service, and before each major stage of a large feature.

**Why:** stated explicitly by the user before work began; violating any of these would require rework and erodes trust on a large multi-stage feature.

## Verifying a session-cookie-authenticated SPA with the Screenshot tool
The Screenshot tool's browser has no access to cookies obtained via curl or fetch in another context, so you cannot screenshot pages that require a login session by first logging in via curl.

**How to apply:** create a temporary throwaway HTML page (e.g. `_dev_autologin.html`) that calls the login API via `fetch` client-side and then redirects to the real page (optionally forwarding a `?route=` param into a `location.hash` for SPA deep-linking). Take the screenshots needed, then delete the temp file immediately afterward — never leave a credential-bypassing page in the repo.

## Architecture decision
Built as a single SPA (`teacher/dashboard.js`, hash-routed sections) backed by a full REST API under `/api/teacher/*`, rather than many separate multi-page HTML files — chosen for feasibility given the very large feature scope (roster mgmt, 3 test categories with question builder + auto-grading, multi-level analysis, Excel/PDF export, notifications, classes, activity log).

**Why:** keeps state/auth handling in one place and made it possible to deliver the full scope in one pass instead of duplicating nav/layout per page.

## Toggling `<form hidden>` inside a card that also styles `form` by element+class
If a stylesheet has a rule like `.card form { display: flex; }`, that author rule overrides the browser's built-in `[hidden] { display: none }` UA style (author styles win over UA styles regardless of selector specificity), so toggling the `hidden` attribute silently fails to hide the element — both forms render stacked.

**How to apply:** whenever you rely on the `hidden` attribute for an element that also has an element+class (or class) display rule in your CSS, add an explicit `selector[hidden] { display: none !important; }` override, or hide via a class toggle instead of the bare attribute.
