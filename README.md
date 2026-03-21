# Diffscope

A standalone web app for reviewing Playwright visual regression test reports — self-hosted and free.

Import a Playwright HTML report directly in your browser, review screenshot diffs side by side, approve or flag changes, and track your progress. No backend, no account, everything runs locally.

## Features

- **Import** a Playwright report folder or `.zip` archive via drag & drop or file picker (parses the embedded ZIP client-side)
- **Thumbnail grid** of all screenshot diffs, grouped by test suite, with pixel count and viewport metadata
- **Comparison view** with two modes:
  - **3-Panel** — Expected | Actual | Diff side by side with synchronized scroll
  - **Slider** — overlay with a draggable divider
- **Review actions** — Approve (`A`), Needs Changes (`X`), Skip — auto-advances to the next diff
- **Keyboard navigation** — `←` / `→` between diffs, `Esc` to close
- **Filters** — by suite, viewport, status (Pending / Approved / Needs Changes), diffs-only toggle, text search
- **Reviewed section** — reviewed items collapse into a separate section at the bottom
- **Persistent state** — review decisions saved in localStorage across sessions

## Tech stack

React · Vite · TypeScript · Tailwind CSS · shadcn/ui · Zustand

Pure SPA — no backend, everything runs in the browser.

## Getting started

```bash
# Clone the repo
git clone https://github.com/your-username/diffscope.git
cd diffscope

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open http://localhost:5173, then import your `playwright-report` folder or `.zip` archive.

## Build for production

```bash
npm run build
npm run preview   # preview the production build locally
```

The output is in `dist/` — deploy it to any static hosting (Vercel, Netlify, GitHub Pages, etc.).

## Generating a test report

A small fixture project in `test-fixture/` can generate a Playwright report with visual diffs — useful for testing Diffscope itself.

```bash
cd test-fixture
npm install
npx playwright install chromium
npm run report
```

This creates a `playwright-report/` folder you can import directly into Diffscope. The script takes baseline screenshots of a sample dashboard, then re-runs with injected CSS changes to produce intentional visual diffs.

## How it works

Playwright generates an HTML report (`index.html`) that embeds a ZIP archive containing `report.json` and all screenshot attachments. Diffscope parses this entirely in the browser:

1. Reads `index.html` from the imported folder or `.zip` and extracts the base64-encoded ZIP
2. Decompresses the ZIP (using pako) and parses `report.json`
3. Extracts diff, actual and expected PNG images as blob URLs
4. Counts changed pixels by decoding raw PNG data (pure JS, no canvas)

No files are uploaded anywhere — everything stays on your machine.

## License

MIT
