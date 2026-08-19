# Repo Role

This repository is the participant-facing DraftKings fantasy football league app.

## Purpose

- Public league-facing football experience
- Weekly rankings, scores, and standings
- Participant-visible stats and season tracking
- Presentation of league results, not private operator controls

## Scope Boundary

- This repo is not the private Dashboard control plane.
- Do not add owner-only admin workflows, AI lineup selection tooling, cron controls, or monitoring UI here unless explicitly requested.

## Related Apps

- Private Dashboard control plane: Dashboard repo in `/Users/tjmmacmini/.openclaw/workspace/Cabinet/Dev Projects`
- Golf league app: `https://2026-draftkings-golf-league.vercel.app/`

## Shared-System Rule

- This app should consume or present shared season data for participants.
- Keep participant UX and league transparency primary.

## Engineering Quality Gate

- Identify the source of truth before editing UI.
- State the API and storage contract before patching behavior.
- Reconcile frontend, ingestion, parsing, and persistence paths in one pass when data flow changes.
- Verify the real bug path, not just that the build passes.
- Add lightweight diagnostics or audit visibility for imports and derived standings when useful.

## Non-Negotiable Rules

- Do not patch display symptoms before identifying ingest and persistence ownership.
- Do not assume DraftKings exports are stable without validating headers and mixed row types.
- Do not ship parser changes without checking downstream standings and presentation behavior.
- Do not claim a data fix is complete without verifying reload and deployed behavior.

## DraftKings Import Rule

- Football import work should reuse the shared adapter-based ingestion framework proven in golf.
- Do not assume DraftKings exports are clean rectangular CSVs; support mixed row types, header aliases, validation thresholds, and audit logging.
- Keep football-specific parsing in adapters while reusing the same normalized import and review pipeline.
