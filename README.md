# Journal Memos

`Journal Memos` is an Obsidian plugin that stores memos directly in daily notes (`YYYY-MM-DD.md`) and renders them in a memos-style stream.

## Features

- Publish memo blocks into today's daily note:

```memos
created: 2026-02-07 09:45
Hello memo
```

- Stream view: reverse chronological memo cards from recent days.
- Heatmap: activity overview by day, click a date to open that daily note.
- No external database, no cloud dependency.

## Commands

- `Open memos view`
- `Append selection as memo`

## Settings

- `Daily notes folder`
- `Stream window (days)`
- `Heatmap window (days)`

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Architecture

- `src/main.ts`: plugin lifecycle and view registration.
- `src/settings.ts`: settings model + setting tab.
- `src/data/memo-parser.ts`: regex parser for ```memos``` blocks.
- `src/data/daily-note-repo.ts`: safe daily-note read/write operations.
- `src/features/memo-service.ts`: cache, stream/heatmap aggregation.
- `src/ui/`: `ItemView` + Svelte app.
