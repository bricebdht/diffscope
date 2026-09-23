# Diffscope plugin for Claude Code

Pre-reviews the screenshot diffs of a Playwright visual regression report with Claude, then lets you import the suggestions into Diffscope. It runs in Claude Code, so it uses your Claude subscription (no API key) and can relate each visual change to the code change on your branch.

## Install

In Claude Code:

```shell
/plugin marketplace add bricebdht/diffscope
/plugin install diffscope@diffscope
```

## Use

From the repository whose Playwright report you want to review:

```shell
/diffscope:review playwright-report
```

The argument can be the `playwright-report/` folder, its `index.html`, or a `.zip` of it. Without an argument, Claude looks for a report in the project.

Claude:

1. extracts every diff with `scripts/extract-report.mjs` (expected, actual and diff images, plus close-ups of the changed regions);
2. reads the branch's code changes (`git diff` against the PR base branch);
3. reviews each diff and writes `diffscope-suggestions.json` next to the report;
4. builds `diffscope-review.html` next to it and opens it: a self-contained page with its summary and every diff (needs changes and unsure first), with its verdict, explanation and the expected / actual / diff close-ups. The images are embedded, so you can share the file as is.

Then, in Diffscope, load the report as usual and click **AI suggestions** in the header to import the file. Each card gets Claude's verdict, the comparison view shows its explanation and the related files, and the **AI** filter lets you look at one verdict at a time. You still make every decision.

## Suggestions file

```json
{
  "format": "diffscope-suggestions",
  "version": 1,
  "generatedAt": "2026-09-23T12:00:00.000Z",
  "generator": "claude-code",
  "summary": "Overall summary of the report.",
  "suggestions": [
    {
      "id": "0d190ac6",
      "snapshot": "buttons-row",
      "viewport": "desktop",
      "verdict": "approve | reject | unsure",
      "category": "intended | regression | noise | unknown",
      "confidence": "high | medium | low",
      "summary": "One-line description of the change.",
      "details": "Why, with the related code change.",
      "relatedFiles": ["src/components/Button.css"],
      "group": "Button border radius"
    }
  ]
}
```

`id` is computed the same way as in Diffscope (`src/lib/report-parser.ts`), from the snapshot name and viewport. Keep the two in sync if either changes.
