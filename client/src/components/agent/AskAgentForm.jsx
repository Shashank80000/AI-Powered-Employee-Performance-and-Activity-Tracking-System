import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { PERIODS } from '../../utils/constants.js';

const SUGGESTIONS = {
  manager: ['What should I follow up on?', 'Who has overdue tasks?', 'How has task completion changed since the last period?', 'Are any records missing or inconsistent?'],
  employee: ['What is due soon?', 'Which of my tasks are overdue?', 'How am I doing on deadlines?']
};

/** Who and what to analyse. Employees always ask about their own work, so they get no person selector. */
export default function AskAgentForm({ employees, personal, busy, onAsk }) {
  const [subject, setSubject] = useState(personal ? 'me' : 'team');
  const [period, setPeriod] = useState('week');
  const [question, setQuestion] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    onAsk({
      scope: subject === 'team' ? 'team' : 'employee',
      employeeId: subject === 'team' || subject === 'me' ? undefined : subject,
      period,
      question: question.trim()
    });
  }

  return (
    <form className="ask-form" onSubmit={handleSubmit}>
      <div className="inline-form">
        {!personal && (
          <label>
            About
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="team">Whole team</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Period
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="ask-question">
        Question <span className="muted">(optional: leave empty for a summary)</span>
        <textarea
          value={question}
          maxLength={500}
          rows={2}
          placeholder={personal ? 'For example: what is due this week?' : 'For example: who needs help with deadlines?'}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <div className="suggestions" aria-label="Example questions">
        {SUGGESTIONS[personal ? 'employee' : 'manager'].map((text) => (
          <button key={text} type="button" className="suggestion" onClick={() => setQuestion(text)}>
            {text}
          </button>
        ))}
      </div>

      <button className="primary-button" disabled={busy}>
        <Sparkles size={15} aria-hidden="true" /> {busy ? 'Analysing records…' : question.trim() ? 'Ask' : 'Summarise'}
      </button>
    </form>
  );
}
