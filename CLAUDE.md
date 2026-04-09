# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Diffscope is a client-only SPA for reviewing Playwright visual regression test reports. Users import Playwright HTML reports or ZIP archives via drag-drop, then review screenshot diffs with approval/rejection workflow. All state lives in the browser (localStorage + Zustand).

## Commands

- `npm run dev` — Vite dev server at localhost:5173
- `npm run build` — TypeScript check + Vite production build
- `npm run lint` — ESLint
- `npm run preview` — serve production build locally

Test fixture (in `test-fixture/`):
- `npm run test:baseline` — capture baseline screenshots
- `npm run test:diffs` — run with CSS changes to generate diffs
- `npm run report` — full pipeline (baseline → diffs → zip)

There is no automated test suite for the main app.

## Architecture

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, shadcn/ui (base-nova style), Pako (ZIP decompression).

**Report parsing pipeline** (`src/lib/report-parser.ts`):
1. User uploads HTML report or ZIP → `extractZipFromHtml()` extracts base64-encoded ZIP from `<script>` tag
2. `zipExtract()` (`src/lib/zip.ts`, pure JS using pako) → decompresses to `report.json`
3. `buildDiffs()` resolves attachment paths to blob URLs
4. `countDiffPixels()` (`src/lib/png.ts`) parses raw PNG bytes for pixel delta counts

**State** (`src/store/review-store.ts`): Single Zustand store holds diffs, filters, modal state, and review decisions. Review state persists to localStorage. Filter recomputation is derived in-store.

**Component flow:** `App` → `Header`, `FilterBar`, `DiffGrid`, `ComparisonModal`, `ImportDialog`. `DiffGrid` groups `DiffCard`s by suite, separating pending/reviewed. `ComparisonModal` hosts `SideBySideView` or `SliderView`.

**Keyboard shortcuts** live in `ComparisonModal`: A=Approve, X=Reject, ←/→=Navigate, Esc=Close.

**Image handling:** PNG files decompressed to blob URLs (no Canvas API). Blob URLs revoked on `clearReport()` to prevent memory leaks.

## Path Alias

`@/*` maps to `src/*` (configured in tsconfig and vite).

## UI Components

shadcn/ui components live in `src/components/ui/`. They use the base-nova style variant with Lucide icons. Add new ones via the shadcn CLI per `components.json`.
