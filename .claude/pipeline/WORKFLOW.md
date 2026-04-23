# Pipeline Workflow

## Flow

```
/research → /plan → /implement → /test → /finalize
                ^       ↑ /abort     ↓ (fail)
                +— /diagnose ←———————+
```

## Phases

### 1. Research → research-agent
**Writes:** `.claude/features/<feature>/YYYY-MM-DDTHH:MM:SS_research.md`

Six phases: gather context → extract requirements → analyze code → identify risks → resolve questions → recommend approach. Includes "Patterns to Follow" and "Code Examples from Spec" in output.

**Exit gate:** FRs/TRs listed, affected files identified, risks assessed, approach recommended.

### 2. Plan → plan-agent
**Writes:** `.claude/features/<feature>/YYYY-MM-DDTHH:MM:SS_plan.md` (includes tasks)

Architecture + task breakdown in ONE file. Tasks organized by streams with [P] markers. Each task has "Accepts when" criteria. Includes handoff checklist for test agent.

**Exit gate:** Architecture described, files listed, every task has acceptance criteria, non-goals stated.

### 3. Implement → execute-agent (delegates to frontend-agent / backend-agent)
**Writes:** `.claude/active-work/<feature>/progress.md`, checks off tasks in plan doc

Execute-agent is a **conductor**. It reads the plan, routes tasks by component:
- `viewer/` tasks → **frontend-agent** (viewer specialist)
- `crawler/` tasks → **backend-agent** (crawler specialist)
- `graph.json` schema → foundation task, done first before viewer/crawler streams
- Cross-cutting (root config, docs, fixtures, CI) → execute-agent handles directly

**Error handling:** Max 2 retries per task. If still failing, mark BLOCKED, continue with non-dependent tasks.

**Exit gate:** All tasks checked off (or BLOCKED with documented reason), lint clean, tests pass.

### 4. Test → test-agent
**Writes:** `.claude/active-work/<feature>/test-pass.md` or `test-fail.md`

Runs: pytest (crawler) + Vitest (viewer) + Playwright (E2E) + lint + typecheck + build. Regenerates a fresh `graph.json` against the fixture tree before E2E so tests run against current crawler output. Walks handoff checklist.

**Playwright rules:** Save failure screenshots to Playwright's default output under `viewer/test-results/`. Reference by path. Don't embed. Don't clean up failures — they're evidence for /diagnose.

**Exit gate (pass):** All suites pass, build succeeds, lint/typecheck clean, checklist verified.

### 5.0 Visual Review (auto-gated, between Test PASS and Finalize)
**Writes:** `.claude/active-work/<feature>/visual-review.md`

**Trigger:** the `/test` PASS report lists at least one modified file matching `viewer/src/components/graph/**` OR `viewer/src/components/views/**`. Backend-only / crawler-only / pipeline-doc-only changes auto-skip this phase.

**What happens:**
1. Test-agent copies `.claude/templates/visual-review.md` to `.claude/active-work/<feature>/visual-review.md` and fills the screenshot manifest table with paths to every PNG it captured during E2E.
2. Orchestrator surfaces that file path to the user. Does NOT auto-suggest `/finalize`.
3. User opens each screenshot, walks the 10-item checklist, and either approves ("looks good") or rejects (loops back to `/diagnose` or `/quickfix`).

**Why this exists:** programmatic visual checks (`visual-verify*.mjs`, FPS percentiles, bbox overlap) cannot detect labels-on-borders, edges-under-fills, or unexplained color palettes — exactly the regression class that motivated `tree-layout-redesign`. A human eyeball is the only reliable detector for that class. Reference: `.claude/templates/visual-review.md` and the human checklist at `viewer/scripts/visual-review-checklist.md`.

**Exit gate:** literal "looks good" (or explicit equivalent) from the user.

### 5a. Finalize → finalize-agent
**Writes:** `.claude/features/<feature>/SUMMARY.md` (includes retrospective)

Cleanup → commit → PR → update STATUS.md → clean active-work/. Security + offline-guarantee checklist: no secrets, no debug code, no external network calls, no TODO hacks. Only 3 committed files per feature (research, plan, summary).

### 5b. Diagnose → diagnose-agent
**Writes:** `.claude/active-work/<feature>/diagnosis.md` (versioned: v2, v3...)

Root causes with evidence. Fix plan with effort estimates. Loops back to /plan.

## Alternative Paths

### Quick Fix (`/quickfix`)
< 3 files, obvious cause, low risk. Agent fixes + tests. No docs. If complex → recommends full pipeline.

### Hotfix (`/hotfix`)
Urgent fix with clear requirements:
- **Skip** `/research` (requirements provided inline)
- **Abbreviated** `/plan` (can be a single task, inline in command)
- `/implement` → `/test` → `/finalize` still required
- Creates a hotfix branch: `hotfix/<name>`

### Park (`/park`)
Saves current state to STATUS.md. Active-work/ preserved. New feature can start.

### Resume (`/resume <feature>`)
Reads STATUS.md for last phase. Resumes from there. Re-reads docs (may be stale).

### Abort (`/abort`)
If `/implement` produced broken state and you want to start over:
1. `git stash` (preserves work, recoverable)
2. Cleans active-work/, unchecks tasks in plan
3. Resets to `plan-complete` — run `/implement` again or `/rework` for new approach

### Rework
Archives current plan as `*_abandoned.md`. Resets to /research. Old research kept.

## Infrastructure Rules

### Feature Names
Kebab-case, normalized. `yaml-parser` not `yaml_parsing`. The orchestrator normalizes before passing to agents.

### "Latest File" Resolution
Sort `*_plan.md` or `*_research.md` lexicographically (ISO 8601 timestamps with zero-padded hours). Last entry = latest.

### Branch Naming
`feat/<feature-name>`, `fix/<feature-name>`, `hotfix/<feature-name>`, `refactor/<feature-name>`.

### CLAUDE.md Growth Strategy
When CLAUDE.md exceeds 150 lines, move architecture details to `.claude/ARCHITECTURE.md` and reference it from CLAUDE.md. Keep CLAUDE.md focused on pipeline rules + essential project context.

### Commit Messages
`feat(viewer): add file detail panel`
`fix(crawler): normalize Windows path separators`
`test(crawler): add INI parser fixtures`
`docs: document graph.json schema`

## File Lifecycle

### Per Feature (committed) — 3 files max
```
.claude/features/<feature>/
  YYYY-MM-DDTHH:MM:SS_research.md
  YYYY-MM-DDTHH:MM:SS_plan.md
  SUMMARY.md
```

### Working Files (gitignored, cleaned after finalize)
```
.claude/active-work/<feature>/
  progress.md, test-pass.md, test-fail.md, diagnosis.md
```

## Worktree Safety
- Max 2 parallel worktrees
- Never branch from HEAD with uncommitted changes
- Use git merge, not file copying
- Run full tests after merge
- Parallel streams must not touch the same files (check the Task Index)

## Agent Output Rules
1. Concise — summaries under 500 words
2. Reference by path — don't paste code blocks
3. Signal over noise — only info that helps the next phase
4. Screenshots by path — never inline
5. Omit empty sections
6. Each agent writes ONE output file (plus checking off tasks)
