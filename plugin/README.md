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
5. when the branch has a pull request, posts the review on it with `scripts/publish-review.mjs` (see below).

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

`branch`, `pullRequest`, `commit` (the reviewed commit) and `merge` (`ready | changes | unsure`, with a `reason`) are optional.

`id` is computed the same way as in Diffscope (`src/lib/report-parser.ts`), from the test (Playwright's `testId`) and the snapshot name. Keep the two in sync if either changes.

## Review comment on the pull request

`publish-review.mjs` pushes the review page and the close-ups to a `diffscope-review/pr-<number>` branch (one commit, force-pushed on every review), and posts a comment on the PR with Claude's merge recommendation, its summary and every diff with its images (approved ones folded). A new review updates the same comment. The images follow the repository's permissions, so on a private repository only its members see them.

To keep the repository small, each run deletes the review branches of closed PRs and the ones older than 7 days (`--retention-days` to change it). Their images then stop showing in the comments: run the review again to bring them back.

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
