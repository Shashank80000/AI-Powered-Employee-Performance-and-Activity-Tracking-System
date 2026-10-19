import { DUE_SOON_DAYS, MIN_TASKS_FOR_RATE, percent } from './agentMetrics.js';

/**
 * Turns verified metrics into a fact sheet: a flat list of numbered facts the AI model must cite, and the
 * rule-based findings used when no model is configured (or its answer fails the evidence check).
 */

const PRESENCE_NOTE = 'Recorded presence, not a measure of productive work.';
const SMALL_SAMPLE_NOTE = `Based on fewer than ${MIN_TASKS_FOR_RATE} tasks: too few to draw a conclusion.`;

function fact(id, label, value, unit, extra = {}) {
  return { id, label, value: value ?? null, ...(unit && { unit }), ...extra };
}

const withEvidence = (items) => (items?.length ? { evidence: items } : {});

/** Facts for one employee. Ids are prefixed (e.g. "E-1/tasks.overdue") when several employees share a sheet. */
export function employeeFacts({ prefix = '', name, code, analysis }) {
  const { tasks, sessions, activity } = analysis.current;
  const id = (key) => `${prefix}${key}`;
  const smallWorkload = tasks.workload < MIN_TASKS_FOR_RATE ? { note: SMALL_SAMPLE_NOTE } : {};
  const smallDeadline = tasks.completedWithDeadline < MIN_TASKS_FOR_RATE ? { note: SMALL_SAMPLE_NOTE } : {};

  const facts = [
    fact(id('employee'), 'Employee', name, undefined, { code }),
    fact(id('tasks.workload'), 'Tasks in the workload during the period', tasks.workload, 'tasks'),
    fact(id('tasks.completed'), 'Tasks approved as done in the period', tasks.completed, 'tasks', withEvidence(tasks.evidence.completed)),
    fact(id('tasks.completionRate'), 'Completion rate (done / workload)', tasks.completionRate, '%', smallWorkload),
    fact(id('tasks.pending'), 'Tasks not done yet', tasks.pending, 'tasks', withEvidence(tasks.evidence.pending)),
    fact(id('tasks.overdue'), 'Pending tasks past their due date', tasks.overdue, 'tasks', withEvidence(tasks.evidence.overdue)),
    fact(id('tasks.noDeadline'), 'Workload tasks without a due date', tasks.noDeadline, 'tasks', withEvidence(tasks.evidence.noDeadline)),
    fact(id('tasks.completedWithDeadline'), 'Completed tasks that had a due date', tasks.completedWithDeadline, 'tasks'),
    fact(id('tasks.onTime'), 'Completed tasks finished on or before the due date', tasks.onTime, 'tasks'),
    fact(id('tasks.late'), 'Completed tasks finished after the due date', tasks.late, 'tasks', withEvidence(tasks.evidence.late)),
    fact(id('tasks.onTimeRate'), 'On-time rate (on time / completed with a due date)', tasks.onTimeRate, '%', smallDeadline),
    fact(id('sessions.total'), 'Website sign-ins in the period', sessions.total, 'sessions', { note: PRESENCE_NOTE }),
    fact(id('sessions.closed'), 'Sign-ins with a recorded sign-out', sessions.closed, 'sessions'),
    fact(id('sessions.missingLogout'), 'Sign-ins with no recorded sign-out (duration unknown)', sessions.missingLogout, 'sessions', withEvidence(sessions.evidence.missingLogout)),
    fact(id('sessions.recordedHours'), 'Signed-in time from sessions with a sign-out', sessions.recordedHours, 'hours', { note: PRESENCE_NOTE }),
    fact(id('sessions.averageSessionMinutes'), 'Average length of sessions with a sign-out', sessions.averageSessionMinutes, 'minutes'),
    fact(id('sessions.daysWithSignIn'), 'Days with at least one sign-in', sessions.daysWithSignIn, 'days'),
    fact(id('activity.daysTracked'), 'Days with desktop agent activity', activity.daysTracked, 'days', { note: PRESENCE_NOTE }),
    fact(id('activity.activeHours'), 'Desktop time with keyboard or mouse input', activity.activeHours, 'hours', { note: PRESENCE_NOTE }),
    fact(id('activity.idleHours'), 'Desktop time without input (idle)', activity.idleHours, 'hours')
  ];

  // Present-tense facts only describe a period that is still running.
  if (tasks.dueSoon !== null) {
    facts.push(
      fact(id('tasks.inReview'), 'Tasks submitted and waiting for manager review', tasks.inReview, 'tasks', withEvidence(tasks.evidence.inReview)),
      fact(id('tasks.dueSoon'), `Pending tasks due in the next ${DUE_SOON_DAYS} days`, tasks.dueSoon, 'tasks', withEvidence(tasks.evidence.dueSoon))
    );
  }
  if (sessions.stillOpen) facts.push(fact(id('sessions.stillOpen'), 'Recent sign-ins that may still be in use', sessions.stillOpen, 'sessions'));
  if (tasks.excludedFromRates) facts.push(fact(id('tasks.excludedFromRates'), 'Tasks left out of rates because of inconsistent dates', tasks.excludedFromRates, 'tasks'));

  const trendLabels = {
    completionRate: ['Change in completion rate vs the previous period', 'percentage points'],
    onTimeRate: ['Change in on-time rate vs the previous period', 'percentage points'],
    completed: ['Change in tasks completed vs the previous period', 'tasks'],
    overdue: ['Change in overdue tasks vs the previous period', 'tasks'],
    recordedSessionHours: ['Change in signed-in hours vs the previous period', 'hours']
  };
  for (const [key, trend] of Object.entries(analysis.trends)) {
    const [label, unit] = trendLabels[key];
    facts.push(
      fact(id(`trend.${key}`), label, trend.change, unit, {
        current: trend.current,
        previous: trend.previous,
        comparable: trend.comparable,
        ...(trend.reason && { note: trend.reason })
      })
    );
  }

  for (const issue of analysis.dataQuality) {
    facts.push(fact(id(`dataQuality.${issue.code}`), issue.message, issue.count, 'records', { severity: issue.severity, evidence: issue.records }));
  }
  return facts;
}

/** Team totals, recomputed from the summed counts (not averaged percentages). */
export function teamTotals(subjects) {
  const sum = (pick) => subjects.reduce((total, subject) => total + (pick(subject.analysis.current) ?? 0), 0);
  const workload = sum((c) => c.tasks.workload);
  const completed = sum((c) => c.tasks.completed);
  const withDeadline = sum((c) => c.tasks.completedWithDeadline);
  const onTime = sum((c) => c.tasks.onTime);
  return {
    employees: subjects.length,
    workload,
    completed,
    completionRate: percent(completed, workload),
    pending: sum((c) => c.tasks.pending),
    overdue: sum((c) => c.tasks.overdue),
    inReview: sum((c) => c.tasks.inReview),
    noDeadline: sum((c) => c.tasks.noDeadline),
    completedWithDeadline: withDeadline,
    onTimeRate: percent(onTime, withDeadline),
    missingLogout: sum((c) => c.sessions.missingLogout),
    withoutRecords: subjects.filter(({ analysis }) => !hasAnyRecord(analysis)).length,
    dataQualityIssues: subjects.reduce((total, subject) => total + subject.analysis.dataQuality.reduce((n, issue) => n + issue.count, 0), 0)
  };
}

export function teamFacts(totals) {
  return [
    fact('team.employees', 'Employees in scope', totals.employees, 'employees'),
    fact('team.tasks.workload', 'Team tasks in the workload during the period', totals.workload, 'tasks'),
    fact('team.tasks.completed', 'Team tasks approved as done in the period', totals.completed, 'tasks'),
    fact('team.tasks.completionRate', 'Team completion rate (done / workload)', totals.completionRate, '%'),
    fact('team.tasks.pending', 'Team tasks not done yet', totals.pending, 'tasks'),
    fact('team.tasks.overdue', 'Team tasks past their due date', totals.overdue, 'tasks'),
    fact('team.tasks.inReview', 'Team tasks waiting for manager review', totals.inReview, 'tasks'),
    fact('team.tasks.noDeadline', 'Team workload tasks without a due date', totals.noDeadline, 'tasks'),
    fact('team.tasks.onTimeRate', 'Team on-time rate', totals.onTimeRate, '%'),
    fact('team.sessions.missingLogout', 'Team sign-ins with no recorded sign-out', totals.missingLogout, 'sessions'),
    fact('team.withoutRecords', 'Employees with no tasks, sign-ins or desktop activity in the period', totals.withoutRecords, 'employees'),
    fact('team.dataQualityIssues', 'Records with data-quality problems', totals.dataQualityIssues, 'records')
  ];
}

export function hasAnyRecord(analysis) {
  const { tasks, sessions, activity } = analysis.current;
  return tasks.workload > 0 || tasks.pending > 0 || sessions.total > 0 || sessions.agentSignIns > 0 || activity.daysTracked > 0;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const titles = (items) => items.slice(0, 3).map((item) => `"${item.title}"`).join(', ');

/** Deterministic findings for one employee, each tied to the facts it rests on. */
function employeeFindings({ prefix = '', name, analysis }, audience, findings) {
  const { tasks, sessions, activity } = analysis.current;
  const id = (key) => `${prefix}${key}`;
  const who = audience === 'employee' ? 'You' : name;
  const { observations, recommendations } = findings;

  if (!hasAnyRecord(analysis)) {
    observations.push({
      statement: `No tasks, website sign-ins or desktop activity were recorded for ${name} in this period, so there is nothing to assess.`,
      factIds: [id('tasks.workload'), id('sessions.total'), id('activity.daysTracked')],
      kind: 'data-quality'
    });
    return;
  }

  if (tasks.workload > 0) {
    const caution = tasks.workload < MIN_TASKS_FOR_RATE ? ' That is too few tasks to judge.' : '';
    observations.push({
      statement: `${who} completed ${tasks.completed} of ${plural(tasks.workload, 'task')} in the period's workload (${tasks.completionRate}%).${caution}`,
      factIds: [id('tasks.completed'), id('tasks.workload'), id('tasks.completionRate')],
      kind: 'neutral'
    });
  }
  if (tasks.overdue > 0) {
    observations.push({
      statement: `${plural(tasks.overdue, 'pending task')} ${tasks.overdue === 1 ? 'is' : 'are'} past the due date: ${titles(tasks.evidence.overdue)}.`,
      factIds: [id('tasks.overdue')],
      kind: 'concern'
    });
    recommendations.push(
      audience === 'employee'
        ? { action: 'Work on the overdue tasks first, or tell your manager what is blocking them.', rationale: `${plural(tasks.overdue, 'task')} past the due date.`, factIds: [id('tasks.overdue')] }
        : { action: `Check in with ${name} about the overdue tasks and agree new dates or remove blockers.`, rationale: `${plural(tasks.overdue, 'task')} past the due date.`, factIds: [id('tasks.overdue')] }
    );
  }
  if (tasks.inReview > 0) {
    if (audience === 'employee') {
      observations.push({ statement: `${plural(tasks.inReview, 'task')} ${tasks.inReview === 1 ? 'is' : 'are'} waiting for your manager's review.`, factIds: [id('tasks.inReview')], kind: 'neutral' });
    } else {
      recommendations.push({ action: `Review the ${plural(tasks.inReview, 'task')} ${name} submitted.`, rationale: 'Submitted work waits for approval before it counts as done.', factIds: [id('tasks.inReview')] });
    }
  }
  if (tasks.dueSoon > 0) {
    observations.push({ statement: `${plural(tasks.dueSoon, 'pending task')} ${tasks.dueSoon === 1 ? 'is' : 'are'} due in the next ${DUE_SOON_DAYS} days: ${titles(tasks.evidence.dueSoon)}.`, factIds: [id('tasks.dueSoon')], kind: 'neutral' });
  }
  if (tasks.completedWithDeadline > 0) {
    const small = tasks.completedWithDeadline < MIN_TASKS_FOR_RATE;
    observations.push({
      statement: `${tasks.onTime} of ${plural(tasks.completedWithDeadline, 'completed task')} with a due date ${tasks.completedWithDeadline === 1 ? 'was' : 'were'} finished on time (${tasks.onTimeRate}%).${small ? ' Too few to judge.' : ''}`,
      factIds: [id('tasks.onTime'), id('tasks.completedWithDeadline'), id('tasks.onTimeRate')],
      kind: small ? 'neutral' : tasks.onTimeRate >= 80 ? 'strength' : tasks.onTimeRate < 60 ? 'concern' : 'neutral'
    });
  }
  if (tasks.noDeadline > 0 && audience !== 'employee') {
    recommendations.push({ action: `Add due dates to the ${plural(tasks.noDeadline, 'task')} without one, so deadline performance can be measured.`, rationale: 'On-time delivery can only be assessed for tasks with a due date.', factIds: [id('tasks.noDeadline')] });
  }
  if (sessions.total > 0) {
    observations.push({
      statement: `${who} signed in to the website ${plural(sessions.total, 'time')} on ${plural(sessions.daysWithSignIn, 'day')}; ${sessions.recordedHours} hours of signed-in time were recorded from ${plural(sessions.closed, 'session')} with a sign-out. This shows presence, not productive work.`,
      factIds: [id('sessions.total'), id('sessions.daysWithSignIn'), id('sessions.recordedHours'), id('sessions.closed')],
      kind: 'neutral'
    });
  }
  if (activity.daysTracked > 0) {
    observations.push({
      statement: `The desktop agent recorded ${activity.activeHours} hours with keyboard or mouse input and ${activity.idleHours} idle hours on ${plural(activity.daysTracked, 'day')}. This is input activity, not a measure of productive work.`,
      factIds: [id('activity.activeHours'), id('activity.idleHours'), id('activity.daysTracked')],
      kind: 'neutral'
    });
  }
  if (sessions.missingLogout > 0) {
    recommendations.push({
      action: audience === 'employee' ? 'Sign out of the website when you finish, so your sessions are recorded completely.' : `Ask ${name} to sign out at the end of the day; sessions without a sign-out have no duration.`,
      rationale: `${plural(sessions.missingLogout, 'sign-in')} without a recorded sign-out.`,
      factIds: [id('sessions.missingLogout')]
    });
  }
  for (const [key, label] of [['completionRate', 'Completion rate'], ['onTimeRate', 'On-time rate']]) {
    const trend = analysis.trends[key];
    if (trend.comparable && trend.change !== 0) {
      observations.push({
        statement: `${label} went from ${trend.previous}% to ${trend.current}% compared with the previous period.`,
        factIds: [id(`trend.${key}`)],
        kind: trend.change > 0 ? 'strength' : 'concern'
      });
    }
  }
  for (const issue of analysis.dataQuality) {
    observations.push({ statement: `${issue.message} (${plural(issue.count, 'record')}${prefix ? ` for ${name}` : ''})`, factIds: [id(`dataQuality.${issue.code}`)], kind: 'data-quality' });
  }
}

/** Rule-based insights: the fallback answer, and the baseline the evaluation compares the model against. */
export function ruleInsights({ audience, subjects, totals, question }) {
  const findings = { observations: [], recommendations: [], limitations: [] };

  if (totals) {
    if (totals.workload > 0) {
      findings.observations.push({
        statement: `Across ${plural(totals.employees, 'employee')}, ${totals.completed} of ${plural(totals.workload, 'task')} were completed (${totals.completionRate}%), and ${totals.overdue} ${totals.overdue === 1 ? 'is' : 'are'} overdue.`,
        factIds: ['team.employees', 'team.tasks.completed', 'team.tasks.workload', 'team.tasks.completionRate', 'team.tasks.overdue'],
        kind: 'neutral'
      });
    }
    const withOverdue = subjects.filter((s) => s.analysis.current.tasks.overdue > 0).sort((a, b) => b.analysis.current.tasks.overdue - a.analysis.current.tasks.overdue);
    for (const subject of withOverdue.slice(0, 5)) {
      const count = subject.analysis.current.tasks.overdue;
      findings.observations.push({ statement: `${subject.name} has ${plural(count, 'overdue task')}.`, factIds: [`${subject.prefix}tasks.overdue`], kind: 'concern' });
    }
    if (totals.inReview > 0) {
      findings.recommendations.push({ action: `Review the ${plural(totals.inReview, 'task')} waiting for approval.`, rationale: 'Submitted work only counts as done once it is approved.', factIds: ['team.tasks.inReview'] });
    }
    if (withOverdue.length) {
      findings.recommendations.push({
        action: `Talk to ${withOverdue.slice(0, 3).map((s) => s.name).join(', ')} about their overdue tasks and agree new dates or remove blockers.`,
        rationale: 'They have the most overdue tasks.',
        factIds: withOverdue.slice(0, 3).map((s) => `${s.prefix}tasks.overdue`)
      });
    }
    if (totals.noDeadline > 0) {
      findings.recommendations.push({ action: `Add due dates to the ${plural(totals.noDeadline, 'task')} without one.`, rationale: 'On-time delivery can only be measured with a due date.', factIds: ['team.tasks.noDeadline'] });
    }
    if (findings.observations.length === 0) {
      findings.observations.push({
        statement: `None of the ${plural(totals.employees, 'employee')} had tasks in the workload or overdue in this period.`,
        factIds: ['team.employees', 'team.tasks.workload', 'team.tasks.overdue'],
        kind: 'neutral'
      });
    }
    if (totals.withoutRecords > 0) {
      findings.limitations.push(`${plural(totals.withoutRecords, 'employee')} had no records in this period and could not be assessed.`);
    }
    if (totals.dataQualityIssues > 0) {
      findings.observations.push({ statement: `${plural(totals.dataQualityIssues, 'record')} had data-quality problems; see each employee's details.`, factIds: ['team.dataQualityIssues'], kind: 'data-quality' });
    }
  } else {
    employeeFindings(subjects[0], audience, findings);
  }

  findings.limitations.push('Signed-in time and desktop activity show presence, not how productive the work was.');
  const lead = findings.observations.slice(0, 2);
  const preface = question ? 'This answer comes from fixed rules, not an AI model, so it summarises the facts rather than answering your question directly. ' : '';
  findings.answer = {
    text: preface + (lead.length ? lead.map((item) => item.statement).join(' ') : 'There are no records to summarise for this period.'),
    factIds: lead.flatMap((item) => item.factIds)
  };
  return findings;
}
