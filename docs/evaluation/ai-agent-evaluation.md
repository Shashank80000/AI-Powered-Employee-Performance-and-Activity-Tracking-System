# AI agent evaluation

Generated 2026-10-19T11:31:07.851Z from commit 66e86f0 (with uncommitted changes) with `npm run evaluate:agent` in `server/`. Re-run it to refresh this file.

| Part | Result |
|---|---|
| A. Calculations and data quality | 77 of 77 checks pass |
| B. Authorization, sessions and API | 10 of 10 cases pass |
| C. AI model answers | not run |

## Part A: calculations and data quality

Fixed records with results worked out by hand (`server/evaluation/agentScenarios.js`). No database or AI model involved.

### S1. Task completion calculation

Four tasks this week: one done on time, one done late, one in progress, one overdue; plus one task finished before the week.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Workload (old completed task excluded) | 4 | 4 | PASS |
| Tasks completed | 2 | 2 | PASS |
| Completion rate % | 50 | 50 | PASS |
| Pending | 2 | 2 | PASS |
| Overdue | 1 | 1 | PASS |
| Completed on time | 1 | 1 | PASS |
| Completed late | 1 | 1 | PASS |
| On-time rate % | 50 | 50 | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S2. Overdue and pending tasks

Nothing done: two overdue (one waiting for review), one due in two days, one without a due date.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Pending | 4 | 4 | PASS |
| Overdue | 2 | 2 | PASS |
| Waiting for review | 1 | 1 | PASS |
| Due in the next 3 days | 1 | 1 | PASS |
| Completion rate % | 0 | 0 | PASS |
| Overdue evidence names the tasks | Prepare slides, Review contract | Prepare slides, Review contract | PASS |
| Rules flag the overdue tasks as a concern | true | true | PASS |
| Rules recommend reviewing the submitted task | true | true | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S3. Missing deadlines

Four tasks completed, but only one had a due date.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Completed | 4 | 4 | PASS |
| Workload without a due date | 3 | 3 | PASS |
| Completed with a due date | 1 | 1 | PASS |
| On-time rate % (1 task only) | 100 | 100 | PASS |
| Rules recommend adding due dates | true | true | PASS |
| Rules call 1 task too few to judge | true | true | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S4. Missing logout timestamps

One 8-hour session with a sign-out, one 5-day-old sign-in never signed out, one sign-in this morning still open.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Sign-ins in the period | 3 | 3 | PASS |
| Sessions with a sign-out | 1 | 1 | PASS |
| Missing sign-out (token expired) | 1 | 1 | PASS |
| Possibly still signed in | 1 | 1 | PASS |
| Recorded signed-in hours (closed only) | 8 | 8 | PASS |
| Days with a sign-in | 3 | 3 | PASS |
| Reported as a data-quality issue | 1 | 1 | PASS |
| Rules say presence is not productive work | true | true | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S5. Missing login timestamps and impossible sessions

A session record without a sign-in time and one whose sign-out is before its sign-in, plus one valid 2-hour session.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Missing sign-in time reported | 1 | 1 | PASS |
| Sign-out before sign-in reported | 1 | 1 | PASS |
| Only the valid session counted | 1 | 1 | PASS |
| Recorded hours | 2 | 2 | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S6. Duplicate and overlapping records

The same 4-hour sign-in stored twice, two overlapping browser sessions (9-13 and 11-15), and a task entered twice.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Duplicate session reported | 1 | 1 | PASS |
| Sessions counted | 3 | 3 | PASS |
| Overlapping sessions | 1 | 1 | PASS |
| Recorded hours (no double counting: 4 + 6) | 10 | 10 | PASS |
| Possible duplicate tasks reported | 2 | 2 | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S7. Incorrect task records

A done task without a completion time, a task completed before it was created, an open task carrying a completion time, and one normal done task.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Done without completion time reported | 1 | 1 | PASS |
| Completed before created reported | 1 | 1 | PASS |
| Completion time on open task reported | 1 | 1 | PASS |
| Left out of rates | 2 | 2 | PASS |
| Workload (measurable tasks only) | 2 | 2 | PASS |
| Completed | 1 | 1 | PASS |
| Completion rate % | 50 | 50 | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S8. Different workloads

A heavy week: 12 new tasks plus 4 carried over from last week, 13 of them done (12 on time), compared with the previous week (8 tasks, 4 done).

| Check | Expected | Actual | Result |
|---|---|---|---|
| Workload this week | 16 | 16 | PASS |
| Completed this week | 13 | 13 | PASS |
| Completion rate % | 81.3 | 81.3 | PASS |
| On-time rate % | 92.3 | 92.3 | PASS |
| Previous week workload | 8 | 8 | PASS |
| Previous week completion rate % | 50 | 50 | PASS |
| Completion-rate change is comparable | true | true | PASS |
| Completion-rate change (points) | 31.3 | 31.3 | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S9. Different workloads

A light workload: one task, done. A 100% rate on one task must not be presented as a trend or a strong result.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Completion rate % | 100 | 100 | PASS |
| Change not comparable (too few tasks) | false | false | PASS |
| Rules call it too few to judge | true | true | PASS |
| Rules make no strength claim | false | false | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S10. No records

An employee with no tasks, sign-ins or activity: the agent must say there is nothing to assess.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Completion rate is unknown, not 0 | null | null | PASS |
| Recorded hours | 0 | 0 | PASS |
| Rules say there is nothing to assess | true | true | PASS |
| Rules make no recommendations | 0 | 0 | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

### S11. Recorded time vs productive work

Five active and one idle hour of desktop activity: reported as presence, never as productivity.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Days tracked | 2 | 2 | PASS |
| Active hours | 5 | 5 | PASS |
| Idle hours | 1 | 1 | PASS |
| Active-hours fact carries the presence note | Recorded presence, not a measure of productive work. | Recorded presence, not a measure of productive work. | PASS |
| Rule-based answer passes the evidence check (rejected claims) | 0 | 0 | PASS |

## Part B: authorization, sessions and API behaviour

From `server/tests/agent.test.js`, run against a throwaway database. Each case lists what it asserts in its name; the assertions are in the test file.

| Case | Result |
|---|---|
| signing in records a session and signing out closes it | PASS |
| changing the password keeps the same session | PASS |
| unauthenticated requests are refused | PASS |
| employees only ever get their own data | PASS |
| managers only see their own team | PASS |
| invalid input is rejected with clear errors | PASS |
| metrics are calculated from the records and problems are reported | PASS |
| without an AI key the agent answers from rules and says so | PASS |
| only the asker can rate an answer, and history is private | PASS |
| requests are rate limited per person | PASS |

## Part C: AI model answers

Not run. Run `npm run evaluate:agent -- --llm` with `ANTHROPIC_API_KEY` set to include Claude's answers. It costs a few cents.

