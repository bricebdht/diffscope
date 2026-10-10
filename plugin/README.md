# Diffscope plugin for Claude Code

Pre-reviews the screenshot diffs of a Playwright visual regression report with Claude, then lets you import the suggestions into Diffscope. It runs in Claude Code, so it uses your Claude subscription (no API key) and can relate each visual change to the code change on your branch.

## Install

In Claude Code:

```shell
/plugin marketplace add bricebdht/diffscope
/plugin install diffscope@diffscope
```

## Use

From the repository whose Playwright report you want to review, on the branch to review:

```shell
/diffscope:review
```

Without an argument, Claude downloads the Playwright report of the branch's latest GitHub Actions run with the GitHub CLI (`gh`, logged in). It picks the most recent completed run that uploaded a report artifact (`playwright-report`, or a name containing `playwright-report` / `html-report`; sharded `blob-report` artifacts are skipped). Options:

```shell
/diffscope:review --run 1234567890          # a specific run
/diffscope:review --branch feature/header   # another branch
/diffscope:review --artifact e2e-report     # an artifact with a custom name
/diffscope:review --no-comment              # don't post the review on the PR
```

You can also review a local report: pass the `playwright-report/` folder, its `index.html`, or a `.zip` of it.

Claude:

1. extracts every diff with `scripts/extract-report.mjs` (expected, actual and diff images, plus close-ups of the changed regions);
2. reads the branch's code changes (`git diff` against the PR base branch);
3. reviews each diff and writes `diffscope-suggestions.json` next to the report;
4. builds `diffscope-review.html` next to it and opens it: a self-contained page with the reviewed branch, pull request and commit, its merge recommendation and summary and every diff (needs changes and unsure first), with its verdict, explanation and the expected / actual / diff close-ups. The images are embedded, so you can share the file as is;
5. when the report comes from CI and the branch has a pull request, posts the review on it with `scripts/publish-review.mjs` (see below).

Then, in Diffscope, load the report as usual and click **Claude review** in the header to import the file. Each card gets Claude's verdict, the comparison view shows its explanation and the related files, and the **Claude** filter lets you look at one verdict at a time. You still make every decision.

## Suggestions file

```json
{
  "format": "diffscope-suggestions",
  "version": 1,
  "generatedAt": "2026-09-23T12:00:00.000Z",
  "generator": "claude-code",
  "branch": "feature/header",
  "pullRequest": { "number": 42, "title": "Tighten the header spacing", "url": "https://github.com/owner/repo/pull/42" },
  "summary": "Overall summary of the report.",
  "suggestions": [
    {
      "id": "0d190ac6",
      "snapshot": "buttons-row",
      "project": "chromium",
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

`report` (every diff of the reviewed report with its changed pixel count, added by `build-html-report.mjs`: Diffscope warns when the suggestions are imported next to another report, since diff ids only depend on the test and snapshot), `branch`, `pullRequest`, `merge` (`ready | changes | unsure`, with a `reason`), and for a CI report `commit` (the run's head sha) and `run` (`url`, `artifact`, `artifactUrl`) are optional.

`id` is computed the same way as in Diffscope (`src/lib/report-parser.ts`), from the test (Playwright's `testId`) and the snapshot name. Keep the two in sync if either changes.

## Review comment on the pull request

When the report comes from CI, `publish-review.mjs` posts a comment on the PR with Claude's merge recommendation, its summary and the diffs that need changes or a human look, one line each (approved ones are only counted). A new review updates the same comment. It's an indication for whoever merges, with no images or per-diff explanations: to see the screenshots, download the report artifact linked in the comment and drop it into Diffscope. Claude's detailed explanations stay with whoever ran the review, in the suggestions file and the review page.

Reviews of a local report are not posted: nothing tells which commit its screenshots were taken on, and the PR's readers can't get it.

The comment starts with these two lines, so a project can check that its PRs were reviewed:

```
<!-- diffscope-review -->
<!-- diffscope-review-commit: <full sha of the reviewed commit> -->
```

For example, to fail when the PR's latest commit wasn't reviewed:

```bash
head=$(gh pr view "$PR" --json headRefOid -q .headRefOid)
reviewed=$(gh api --paginate "repos/$REPO/issues/$PR/comments"   --jq '.[] | select(.body | startswith("<!-- diffscope-review -->")) | .body'   | grep -o 'diffscope-review-commit: [0-9a-f]*' | tail -n 1 | cut -d' ' -f2)
[ "$reviewed" = "$head" ] || { echo "No Diffscope review of $head"; exit 1; }
```
