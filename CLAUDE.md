# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Watch mode (esbuild, outputs main.js + main.css)
npm run build      # Type-check (tsc --noEmit) + production bundle
npm run lint       # ESLint across all source files
npm run version    # Bump version and stage manifest.json + versions.json
```

There are no automated tests beyond the parser unit tests in `src/data/memo-parser.test.ts`. Run them with your test runner of choice (no test script is configured in package.json).

## Architecture Overview

This is an **Obsidian plugin** that provides a journal/memo capture UI backed by daily notes in the vault.

### Layer breakdown

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Plugin entry | `src/main.ts` | Lifecycle, command registration, vault event subscriptions, markdown code block processor |
| Settings | `src/settings.ts` | `JournalMemosSettings` interface + multi-tab settings UI |
| Types | `src/types.ts` | `MemoItem`, `MemoAttachment`, `HeatmapCell`, `MemoSnapshot` |
| Service | `src/features/memo-service.ts` | CRUD business logic, parse-cache (keyed by path+mtime), background cache warming |
| Attachment manager | `src/features/attachment-manager.ts` | Content-hash deduplication, index persistence (`attachment-index.json`) |
| Data / file I/O | `src/data/daily-note-repo.ts` | Build daily note paths, create files with Templater (or fallback), time-sorted memo block insertion/update/delete |
| Parser | `src/data/memo-parser.ts` | Regex-based extraction of ` ```memos ``` ` blocks, tags (`#hashtag`), wiki-link attachments (`![[...]]`) |
| UI (Svelte) | `src/ui/*.svelte` | All visual components; `JournalMemosApp.svelte` is the root |
| UI (TS) | `src/ui/*.ts` | Obsidian `ItemView` adapter (`journal-memos-view.ts`), modals, renderer |
| Commands | `src/commands/register-commands.ts` | Command palette registrations |
| Utils | `src/utils/` | Date formatting, path helpers, buffer hashing |

### Data flow

1. **Memo storage format:** each memo is a fenced code block (` ```memos ... ``` `) inside the day's daily note. The block body encodes creation timestamp, free-text content, `#tags`, and `![[attachments]]`.
2. **Parse cache:** `MemoService` caches parsed results by `(filepath, mtime)`. Vault `"changed"` events invalidate relevant cache entries and trigger view refresh.
3. **Cross-day moves:** editing a memo's date deletes its block from the old file and re-inserts it chronologically in the target file via `appendMemoBlock()` (time-sorted regex scan).
4. **Daily note creation:** `ensureDailyNoteFile()` tries Templater's `write_template_to_file` first; falls back to a static copy of the configured template when Templater is absent.
5. **Attachment deduplication:** SHA-256 content hash checked against `attachment-index.json` before writing; filename conflict resolved via `DuplicateFileModal`.

### Build output

esbuild bundles everything to `main.js` + `main.css` at the repo root. Obsidian loads these directly; no intermediate dist/ directory is used. The Svelte plugin for esbuild handles `.svelte` files at compile time.

### Key configuration

- **Plugin ID:** `com.zzkkyys.journalmemos` (in `manifest.json`)
- **Min Obsidian version:** 1.5.0
- **Daily note path template placeholders:** `{folder}`, `{yyyy}`, `{MM}`, `{dd}` (parsed in `daily-note-repo.ts`)
