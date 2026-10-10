---
name: review
description: Review the screenshot diffs of a Playwright visual regression report and write a Diffscope suggestions file (approve / reject verdict, category and explanation per diff), using the current branch's code changes as context. Use when the user wants help triaging a Playwright HTML report or its visual diffs.
argument-hint: "[report folder | index.html | report.zip | --run <id> | --branch <name>] [--no-comment]"
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/fetch-ci-report.mjs" *) Bash(node "${CLAUDE_SKILL_DIR}/scripts/extract-report.mjs" *) Bash(node "${CLAUDE_SKILL_DIR}/scripts/build-html-report.mjs" *) Bash(node "${CLAUDE_SKILL_DIR}/scripts/publish-review.mjs" *)
---

# Review a Playwright visual regression report

You pre-review every screenshot diff of a Playwright report so the user can go through them faster in Diffscope. You do not make the final decision: you write suggestions that Diffscope shows next to each diff.

## 1. Get the report

Arguments: `$ARGUMENTS`

**A local path** (a `playwright-report/` folder, its `index.html`, or a `.zip`): use it and go to step 2.

`--no-comment` is not passed to the scripts: it only skips step 7.

**Nothing, or only options** (`--run <id>`, `--branch <name>`, `--artifact <name>`): download the report of the branch's latest GitHub Actions run, passing the options through:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/fetch-ci-report.mjs" <options>
```

It uses the GitHub CLI (`gh`), looks through the branch's recent completed runs for a Playwright report artifact, downloads it, and prints a JSON summary: `reportDir` (the local report folder to use from now on), the `branch` the run tested and its `pullRequest` (`number`, `title`, `url`, or null), the run (workflow, conclusion, date, URL, `headSha`), the `artifact` name and its download link (`artifactUrl`), and `matchesLocalHead`.

- Tell the user in one line which run you're reviewing (workflow, date, conclusion, URL).
- If `matchesLocalHead` is false, the CI tested another commit than the local checkout (new local commits, or a branch you haven't pulled). Say so, and use `headSha` as the code reference in step 3.
- If `runsInProgress` is above 0, mention that a newer run is still in progress.
- If the script fails (no `gh`, not logged in, no run or no report artifact), explain why, then look for a local `playwright-report/` (or `playwright-report*.zip`) in the project, including one level of subfolders. If there are several candidates, or none, ask the user.

## 2. Extract the diffs

```bash
node "${CLAUDE_SKILL_DIR}/scripts/extract-report.mjs" "<report path>"
```

It prints a JSON summary with the path of `manifest.json`, the path where the suggestions file must be written (`suggestionsPath`), and the list of diffs. Read `manifest.json`: for each diff it gives the snapshot name, spec file, test title, Playwright project, image sizes, the number of changed pixels, and the paths of the images:

- `images.expected`, `images.actual`, `images.diff`: full screenshots. In the diff image, changed pixels are red (anti-aliasing differences are yellow) over a faded copy of the page.
- `regions[]`: bounding boxes of the changed areas, each with cropped close-ups (`images.expected`, `images.actual`, `images.diff`). Full screenshots get downscaled when you read them, so rely on the close-ups to see small changes.

If `expectedSize` and `actualSize` differ, the page or component changed size: say so, it often explains a diff that covers everything below a certain point.

## 3. Gather the code context

The point of running this in Claude Code is that you can relate each visual change to the code change that caused it.

- Find the base branch: `gh pr view --json baseRefName -q .baseRefName` if the branch has a PR, otherwise the default branch (`main` or `master`).
- With a CI report, the suggestions file gets the `branch` and `pullRequest` printed by `fetch-ci-report.mjs`, the run's `headSha` as the commit, and the run. With a local report, note the current branch (`git rev-parse --abbrev-ref HEAD`) and its pull request (`gh pr view --json number,title,url`, none if it fails), but no commit: nothing tells which commit the screenshots were taken on.
- Look at `git diff <base>...HEAD` (plus uncommitted changes), focusing on styles, components, templates, assets, fonts and design tokens. When the report comes from CI, diff against the run's `headSha` instead of `HEAD` (and skip uncommitted changes), fetching it first if it isn't available locally.
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
  "branch": "feature/header",
  "pullRequest": { "number": 42, "title": "Tighten the header spacing", "url": "https://github.com/owner/repo/pull/42" },
  "commit": "<headSha of the CI run>",
  "run": {
    "url": "https://github.com/owner/repo/actions/runs/1234567890",
    "artifact": "playwright-report",
    "artifactUrl": "https://github.com/owner/repo/actions/runs/1234567890/artifacts/987654"
  },
  "summary": "Two or three sentences: what changed overall, what looks intended, what needs a close look.",
  "merge": {
    "verdict": "changes",
    "reason": "One or two sentences: can this PR be merged as far as the screenshots go, and what blocks it if not."
  },
  "suggestions": [
    {
      "id": "<id from the manifest, unchanged>",
      "snapshot": "<snapshot from the manifest>",
      "project": "chromium",
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
- `branch` is the reviewed branch and `pullRequest` its pull request: leave `pullRequest` out when there is none, and both out when the report isn't tied to a branch. The review page shows them in its header.
- `commit` and `run` only for a CI report: `commit` is the run's `headSha`, `run` its `url` with the `artifact` and `artifactUrl` printed by `fetch-ci-report.mjs`. The PR comment records the commit, so projects can check that the review covers the PR's latest commit, and links the artifact.
- `merge.verdict` is your merge recommendation: `ready` (every diff is approved), `changes` (at least one diff needs changes) or `unsure` (nothing clearly wrong, but some diffs need a human look). `merge.reason` says why, naming the diffs that block it.
- `relatedFiles` and `group` are optional; `summary` and `details` must be plain text (no Markdown), in the user's language.

## 6. Build the review page

Build a self-contained HTML page of your conclusions and open it in the browser:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/build-html-report.mjs" "<manifest.json path>" --open
```

It writes `diffscope-review.html` next to the suggestions file: the reviewed branch, pull request and commit, your merge recommendation and summary, then every diff (needs changes and unsure first) with your verdict, explanation and the expected / actual / diff close-ups. The images are embedded, so the file can be shared as is. It also adds a `report` field to the suggestions file (every diff's changed pixel count), which Diffscope uses to warn when the suggestions are imported next to another report: run it again if you rewrite the suggestions file afterwards.

## 7. Post the review on the pull request

Skip this step when `--no-comment` was passed, when the branch has no pull request, or when the report is local (say that only CI reports are posted, since the PR's readers can't get a local report and its commit is unknown). Otherwise run:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/publish-review.mjs" "<manifest.json path>"
```

It posts a comment on the PR, or updates the comment of the previous review, with your merge recommendation and summary, the diffs that need changes or a human look (one line each, approved ones are only counted), a link to download the report artifact, and the suggestions file, to paste into Diffscope's **Claude review** dialog once the report is loaded. It prints the comment URL and `stale` (true when the PR got commits after the reviewed one).

If it fails (no `gh`, no access to the repository), say why and give the review page path instead.

## 8. Report back

Tell the user, briefly:

- where the review page and the suggestions file are, and that they can import the suggestions in Diffscope with the **Claude review** button in the header once the report is loaded (when the report was downloaded from CI, give the report folder path too: that's the folder to drop into Diffscope);
- the link to the PR comment, if you posted one (and that it's out of date when `stale` is true);
- your merge recommendation, and how many diffs you suggest approving, rejecting, and are unsure about;
- the diffs that deserve a close look (regressions and low-confidence verdicts), one line each.
