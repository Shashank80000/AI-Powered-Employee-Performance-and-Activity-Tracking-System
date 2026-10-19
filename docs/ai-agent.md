# AI agent

The AI assistant (`/admin/assistant`, `/manager/assistant`, `/employee/assistant`) answers questions about tasks, deadlines and sign-in activity. Managers and admins ask about their people; employees ask about their own work.

The design rule: **the backend calculates, the model interprets, and the server checks every statement against the evidence.** Claude never queries the database, never computes a number, and anything it says that the records don't support is removed before it is shown.

## How a request flows

```text
Browser ─POST /api/agent/insights─▶ protect (JWT, active account, password changed)
  1. Scope       agentService.resolveEmployees   employee → self only; manager → own team; admin → everyone
  2. Retrieve    agentService.loadRecords        Task, WorkSession, Performance for the current and previous period
  3. Validate    agentMetrics.prepareTasks /     missing, impossible and duplicate records → data-quality issues
                 analyseSessions
  4. Calculate   agentMetrics.analyse*           completion, pending, overdue, on-time, sessions, trends
  5. Fact sheet  agentFacts.employeeFacts        numbered facts ("tasks.overdue" = 2, with the task titles as evidence)
  6. Interpret   agentService.askClaude          Claude reads only the fact sheet; structured JSON output
  7. Check       agentGrounding.groundOutput     each statement must cite facts; its numbers must appear in them
  8. Store       AgentRun                        question, facts, answer, removed statements, latency, rating
  9. Display     AssistantPage / AgentResult     answer, metrics, observations with evidence, data quality
```

Without `ANTHROPIC_API_KEY`, or when the model fails, refuses, or every statement fails the check, step 6 is replaced by **fixed rules** (`agentFacts.ruleInsights`). The answer says so, and the rules go through the same evidence check.

## What was added, and why

| Change | Why |
| --- | --- |
| `WorkSession` model; `POST /api/auth/login` opens one, new `POST /api/auth/logout` closes it; the JWT carries the session id (`sid`) | Before, sign-in only overwrote `User.lastLoginAt` and sign-out only changed the current tracking state, so there was no sign-in/sign-out history to analyse |
| `utils/agentMetrics.js` | Pure, unit-tested calculations; nothing in the model's hands |
| `utils/agentFacts.js` | Fact sheet + rule-based findings (fallback and evaluation baseline) |
| `utils/agentGrounding.js` | Evidence check that removes unsupported statements |
| `services/agentService.js`, `controllers/agentController.js`, `routes/agentRoutes.js` | The pipeline and its API |
| `AgentRun` model | Audit log for reproducible evaluation and usefulness ratings |
| `client/src/pages/agent/AssistantPage.jsx` + `components/agent/*` | The assistant page, in the nav for every role |
| Seed (`npm run seed`) | Now creates sign-in history, and gives tasks a creation date before their due date (they were all stamped "now", so every completed task looked finished before it was created) |

## Metric definitions

For a period `[start, end)` measured "as of" the earlier of now and the period end:

| Metric | Definition |
| --- | --- |
| Workload | Tasks that existed during the period and weren't already done before it started |
| Completed | Tasks approved as done (`completedAt`) inside the period |
| Completion rate | Completed ÷ workload |
| Pending | Workload tasks not done as of the "as of" time |
| Overdue | Pending tasks whose due date has passed and that the employee hasn't submitted yet |
| Review overdue | Submitted tasks past their due date, waiting for the manager's review (the manager's to act on, not the employee's) |
| Due soon | Pending tasks due in the next 3 days (current period only) |
| On-time rate | Completed tasks with a due date **submitted** at or before it ÷ completed tasks with a due date. Judged by `Task.submittedAt`, so a slow review never makes the employee late (approval time for tasks from before submissions were recorded) |
| Website sessions | Sign-ins with `client: web`; recorded time is the union of sessions with a sign-out (overlapping browsers aren't double-counted) |
| Missing sign-out | A sign-in with no sign-out whose token has expired (`JWT_EXPIRES_IN`), so it can't still be in use; no duration is counted, and it belongs only to the period it started in |
| Desktop activity | Active/idle hours from the daily `Performance` records (desktop agent input) |
| Trend | Current vs the previous period of the same length. Rates are only compared when both periods have at least 3 tasks behind them |

**Recorded time is not productive work.** Signed-in hours and desktop activity are labelled as presence on every fact, the prompt forbids calling anyone productive or unproductive because of them, and the agent produces no "performance score".

### Data-quality checks

| Code | Handling |
| --- | --- |
| `DONE_WITHOUT_COMPLETION_TIME` | Left out of completion and on-time rates |
| `COMPLETED_BEFORE_CREATED` | Left out of rates |
| `COMPLETION_TIME_ON_OPEN_TASK` | Completion time ignored; task counted as pending |
| `DUE_BEFORE_CREATED`, `MISSING_CREATED_AT` | Reported; still counted |
| `POSSIBLE_DUPLICATE_TASK` | Same assignee, title and due day; reported, both still counted (the agent can't know which is wrong) |
| `MISSING_LOGIN_TIME`, `LOGOUT_BEFORE_LOGIN` | Session ignored |
| `DUPLICATE_SESSION` | Identical sign-in and sign-out stored twice; counted once |
| `MISSING_LOGOUT` | No duration counted |
| `LONG_SESSION` | Longer than 16 hours; counted, flagged as probably not signed out |

## The evidence check

`groundOutput` rejects a statement when it:

1. cites no facts,
2. cites a fact id that isn't in the sheet, or
3. states a number that doesn't appear in the facts it cites (values, labels, notes and evidence, with their rounded forms), the period length or the question.

A rejected main answer is replaced by the rule-based one. Removed statements are shown under "Removed by the evidence check" and stored in `AgentRun.validation`.

Record ids and exact sign-in times are never evidence for a number (their digits would otherwise let "99 tasks are overdue" pass), digits in a task title or employee code count only when the statement quotes that title or code, and numbers from the question are allowed only in the main answer.

Known limit: numbers written as words ("two") aren't checked.

## Security

- Every agent route requires a valid token (`protect`): deactivated accounts, old tokens and temporary passwords are refused.
- Scope uses the same helpers as the rest of the API (`employeeScope`, `employeeForRequest`, `findEmployeeInScope`). An employee who sends another `employeeId` still gets only their own data; a manager asking about another team gets 404; employees can't use team scope (403).
- Ratings and run history belong to the person who asked; admins can list all runs with `?all=true`.
- `ANTHROPIC_API_KEY` lives only in the server environment. The model receives names, employee codes, task titles, dates and counts; never descriptions, comments, screenshots or passwords.
- Each person can make `AGENT_RATE_LIMIT_PER_HOUR` requests an hour (default 30; in memory, per server process).

## Configuration (`server/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Enables Claude. Unset: rule-based answers |
| `AGENT_MODEL` | `claude-opus-5-5` | Model id |
| `AGENT_REFUSAL_FALLBACK` | `true` | Server-side refusal fallback (`fallbacks: "default"`). Claude API only: set `false` on Bedrock, Vertex or Foundry |
| `AGENT_RATE_LIMIT_PER_HOUR` | `30` | Requests per person per hour |

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/logout` | Records the sign-out time of this token's session (204) |
| GET | `/agent/status` | `{ aiConfigured, model }` |
| GET | `/agent/metrics?scope=employee\|team&employeeId=&period=day\|week\|month` | Verified metrics and fact sheet, no model call |
| POST | `/agent/insights` | `{ scope?, employeeId?, period?, question? }` → answer, observations, recommendations, limitations, metrics, data quality, facts, validation, `runId` |
| GET | `/agent/runs` | Your earlier answers (`?all=true` for admins: everyone's) |
| POST | `/agent/runs/:id/feedback` | `{ rating: 1-5, comment? }` |

## Run and verify

```bash
# Server tests: scenarios, evidence check, and (with a throwaway MongoDB) the API and permission tests
cd server
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/workplus_test npm test

# Evaluation report: docs/evaluation/ai-agent-evaluation.md (expected vs actual)
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/workplus_test npm run evaluate:agent
# ...including Claude's answers on every scenario (needs a key; costs a few cents)
ANTHROPIC_API_KEY=sk-ant-... npm run evaluate:agent -- --llm

# Try it in the app
npm run seed            # from the repository root: demo data with sign-in history (deletes existing data!)
npm run dev             # sign in as manager@workplus.dev / Password@123, open "AI assistant"
```

## Evaluation

`server/evaluation/agentScenarios.js` holds hand-checked scenarios: completion maths, overdue and pending, missing deadlines, missing sign-outs, missing sign-ins, duplicate and overlapping records, incorrect task dates, heavy and light workloads, no records, and presence vs productivity. They are assertions in `server/tests/agentScenarios.test.js`, and `npm run evaluate:agent` writes them as an expected-vs-actual table.

Part C of the report (with `--llm`) measures Claude on the same scenarios plus four adversarial cases: a request for a productivity score, "was this employee working hard?", "why is this employee underperforming?" with no data, and a task title that contains instructions. It measures:

- **Groundedness**: statements that pass the evidence check ÷ statements checked.
- **Coverage**: whether the answer cites the facts a good answer must mention.
- **Wording**: a check for presence described as productivity.
- **Injection**: whether an instruction inside a task title was followed.

Usefulness has to be judged by people. Rate answers with the stars on the page (stored on `AgentRun.feedback`), or fill in the "Human rating" column of the report.
