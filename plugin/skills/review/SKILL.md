---
name: review
description: Review the screenshot diffs of a Playwright visual regression report and write a Diffscope suggestions file (approve / reject verdict, category and explanation per diff), using the current branch's code changes as context. Use when the user wants help triaging a Playwright HTML report or its visual diffs.
argument-hint: "[playwright-report folder | index.html | report.zip]"
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/extract-report.mjs" *)
---

# Review a Playwright visual regression report

You pre-review every screenshot diff of a Playwright report so the user can go through them faster in Diffscope. You do not make the final decision: you write suggestions that Diffscope shows next to each diff.

## 1. Find the report

Report argument: `$ARGUMENTS`

If it is empty, look for `playwright-report/` (or a `playwright-report*.zip`) in the project, including one level of subfolders. If there are several candidates, or none, ask the user which one to use.

## 2. Extract the diffs

```bash
node "${CLAUDE_SKILL_DIR}/scripts/extract-report.mjs" "<report path>"
```

It prints a JSON summary with the path of `manifest.json`, the path where the suggestions file must be written (`suggestionsPath`), and the list of diffs. Read `manifest.json`: for each diff it gives the snapshot name, spec file, test title, viewport, image sizes, the number of changed pixels, and the paths of the images:

- `images.expected`, `images.actual`, `images.diff`: full screenshots. In the diff image, changed pixels are red (anti-aliasing differences are yellow) over a faded copy of the page.
- `regions[]`: bounding boxes of the changed areas, each with cropped close-ups (`images.expected`, `images.actual`, `images.diff`). Full screenshots get downscaled when you read them, so rely on the close-ups to see small changes.

If `expectedSize` and `actualSize` differ, the page or component changed size: say so, it often explains a diff that covers everything below a certain point.

## 3. Gather the code context

The point of running this in Claude Code is that you can relate each visual change to the code change that caused it.

- Find the base branch: `gh pr view --json baseRefName -q .baseRefName` if the branch has a PR, otherwise the default branch (`main` or `master`).
- Look at `git diff <base>...HEAD` (plus uncommitted changes), focusing on styles, components, templates, assets, fonts and design tokens.
- Read the spec files from the manifest (`specFile`) when you need to know which page or component a snapshot shows.

If there is no git repository or no relevant change, still review the diffs from the images alone, and say so in the summary.

## 4. Review each diff

For each diff, look at the diff close-ups first, then compare the expected and actual close-ups. Decide:

- **category**:
  - `intended`: the change is explained by the code changes (name the file and change in `relatedFiles` and `details`).
  - `regression`: something looks broken or unexplained: overlapping or clipped content, broken layout, missing elements, wrong colors, text overflow, a change in an area the code changes shouldn't affect.
  - `noise`: rendering noise with no visible meaning (anti-aliasing, sub-pixel font rendering, animation frame, dynamic data like dates or random values).
  - `unknown`: you can't tell.
- **verdict**: `approve` for intended changes that look correct and for noise, `reject` for regressions and for intended changes that look wrong (e.g. the intended CSS change also broke something), `unsure` otherwise.
- **confidence**: `high`, `medium` or `low`. Be honest: prefer `unsure` / `low` over a confident guess, the user relies on this to decide where to look closely.
- **group**: when several diffs share the same root cause (typically the same component on desktop and phone, or one CSS change that shows up in several snapshots), give them the same short group label, e.g. `"Header logo spacing"`.

With more than about 15 diffs, split the work: spawn subagents that each review a batch of diffs (give them the manifest path, their diff ids, the code context you gathered, and the output format below) and merge their results.

## 5. Write the suggestions file

Write it to the `suggestionsPath` printed by the extractor, as UTF-8 JSON:

```json
{
  "format": "diffscope-suggestions",
  "version": 1,
  "generatedAt": "<ISO 8601 timestamp>",
  "generator": "claude-code",
  "summary": "Two or three sentences: what changed overall, what looks intended, what needs a close look.",
  "suggestions": [
    {
      "id": "<id from the manifest, unchanged>",
      "snapshot": "<snapshot from the manifest>",
      "viewport": "desktop",
      "verdict": "approve",
      "category": "intended",
      "confidence": "high",
      "summary": "One short sentence describing the visual change.",
      "details": "Why you reached this verdict, including the related code change.",
      "relatedFiles": ["src/components/Header.css"],
      "group": "Header logo spacing"
    }
  ]
}
```

- Include one entry per diff in the manifest, and copy `id` exactly: Diffscope uses it to attach the suggestion to the right diff.
- `relatedFiles` and `group` are optional; `summary` and `details` must be plain text (no Markdown), in the user's language.

## 6. Report back

Tell the user, briefly:

- where the suggestions file is, and that they can import it in Diffscope with the **AI suggestions** button in the header once the report is loaded;
- how many diffs you suggest approving, rejecting, and are unsure about;
- the diffs that deserve a close look (regressions and low-confidence verdicts), one line each.
