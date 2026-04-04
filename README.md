# Document Production Specialist Legal

Document Production Specialist Legal is a Vite + React prototype for automating the repetitive parts of legal Word document production.

It is designed to:

- process one or many `.docx` files in a batch
- clean common Word formatting mess automatically
- apply house-style checks for legal document production
- flag stale footer/header details and structural risks
- persist profiles, batch history, and generated artifacts in Supabase

## What It Does

The app currently supports:

- `.docx` batch upload
- cleanup of double spaces, trailing whitespace, repeated blank paragraphs, and tab normalization
- inspection of multiple Word content parts, including:
  - `document.xml`
  - headers
  - footers
  - comments
  - footnotes
  - endnotes
- house-style profiles with preferred fonts, preferred sizes, and default watch terms
- watchlist detection for stale client or matter details hiding in headers and footers
- structural legal-document checks, including:
  - clause numbering drift
  - cross-reference mismatches
  - schedule / appendix reference mismatches
  - missing signature-block signals
  - likely orphaned defined terms
- Supabase-backed:
  - profile persistence
  - batch history
  - stored cleaned documents
  - stored reports
  - stored batch zip artifacts

## Tech Stack

- React 19
- TypeScript
- Vite
- JSZip
- Supabase Auth
- Supabase Postgres
- Supabase Storage

## Local Setup

From the project directory:

```powershell
npm install
```

Create a local `.env` file in the project root. Do not commit it.

Use this shape:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

You can use [.env.example](./.env.example) as the template.

The app will still run without Supabase, but remote profile saving, auth, history, and artifact storage will be disabled.

## Supabase Setup

### 1. API keys

In Supabase:

- `Project Settings -> API`

Copy:

- `Project URL` into `VITE_SUPABASE_URL`
- `anon public` key into `VITE_SUPABASE_ANON_KEY`

Do not use the `service_role` key in the frontend app.

### 2. Run migrations

Run these SQL files in Supabase SQL Editor in this order:

1. [supabase/migrations/20260330_document_production.sql](./supabase/migrations/20260330_document_production.sql)
2. [supabase/migrations/20260330_document_production_storage.sql](./supabase/migrations/20260330_document_production_storage.sql)
3. [supabase/migrations/20260330_document_production_auth_lockdown.sql](./supabase/migrations/20260330_document_production_auth_lockdown.sql)

These create:

- the `style_profiles` table
- the `batch_runs` table
- the `batch_documents` table
- the `document-production` storage bucket
- row-level security policies
- signed-in-only access rules for data and stored files

### 3. Enable auth

In Supabase:

- `Authentication -> Providers -> Email`

Enable email auth and magic-link sign-in.

### 4. URL configuration

In Supabase:

- `Authentication -> URL Configuration`

Add:

```text
http://localhost:5173
http://localhost:5173/
```

if needed for local sign-in redirects.

## Run The App

Start the dev server:

```powershell
npm run dev
```

Then open the local URL shown by Vite, usually:

[http://localhost:5173](http://localhost:5173)

## Recommended Demo Flow

For a safe demo, use this order:

1. Sign in with your email via magic link.
2. Save a custom house-style profile to Supabase.
3. Upload one small `.docx` first.
4. Confirm the app:
   - processes it
   - saves the batch run
   - stores the cleaned document
   - stores the report
   - stores the batch zip
5. Open the saved artifact links from batch history.
6. Upload 2-3 documents together as a second batch.
7. Sign out and confirm Supabase-backed history is no longer exposed.
8. Sign back in and confirm it returns.

## Demo Runbook

Use this if you come back later and cannot remember how to run the thing.

### Before the demo

Check these first:

1. `.env` exists locally and contains the Supabase URL and anon key.
2. Supabase email auth is enabled.
3. You still have access to the email address used for magic-link sign-in.
4. The app builds locally:

```powershell
npm run build
```

### Start the app

From the project folder:

```powershell
npm install
npm run dev
```

Open the local URL shown in PowerShell, usually:

[http://localhost:5173](http://localhost:5173)

### Demo checklist

Use this click order:

1. Confirm the top banner says Supabase is configured.
2. Enter your email and sign in via magic link if needed.
3. Show the saved house-style profile area.
4. Upload one `.docx` first.
5. Show:
   - the processing status
   - the issue summary
   - the generated report / cleaned doc buttons
6. Open the Supabase batch history panel.
7. Open one stored report or cleaned file from history.
8. If you want the stronger version, upload 2-3 `.docx` files together and show the batch zip flow.
9. Sign out to show the remote data is protected.

### What to say in plain English

Use this script if you want a calm explanation:

- "This automates the repetitive cleanup layer of legal document production instead of making someone fix Word formatting by hand."
- "It processes one or many `.docx` files, checks multiple internal Word parts, and applies house-style rules."
- "It flags things that are easy to miss late at night, like stale footer details, numbering drift, and structural inconsistencies."
- "It stores profiles, reports, and batch history in Supabase so the workflow is reusable rather than one-off."

### Best demo files

Good choices:

- a short NDA
- a simple letter template
- a document with obvious stale footer text
- a batch of 2-3 small legal docs

Avoid for the first demo:

- giant files
- corrupted `.docx`
- anything confidential
- anything that is not actually a real `.docx`

### If something goes wrong

Quick recovery order:

1. Refresh the browser.
2. Make sure you are still signed in.
3. Check the error banner text in the app.
4. Run:

```powershell
npm run build
```

5. Restart the dev server:

```powershell
npm run dev
```

6. If Supabase-backed actions fail, confirm:
   - the storage bucket exists
   - the migration SQL has been applied
   - your email auth session is active

### Fast memory jog

If you only remember three things, remember these:

1. `npm run dev`
2. sign in with magic link
3. upload a real `.docx`

## Build

```powershell
npm run build
```

## Known Notes

- The app expects real `.docx` files, not `.doc` or renamed files.
- Supabase-backed features require a signed-in session.
- Stored files are scoped to the signed-in user via private storage paths and signed URLs.
- The prototype is intentionally frontend-heavy for speed of iteration; production hardening would likely move parts of the storage / persistence flow server-side.

## License

This project is proprietary. You may not use, copy, modify, redistribute, deploy, or install it for commercial or client use without prior written permission.

