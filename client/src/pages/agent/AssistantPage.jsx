import { useState } from 'react';
import AgentResult from '../../components/agent/AgentResult.jsx';
import AskAgentForm from '../../components/agent/AskAgentForm.jsx';
import PageHeading from '../../components/common/PageHeading.jsx';
import PanelHeader from '../../components/common/PanelHeader.jsx';
import StatusMessage from '../../components/common/StatusMessage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { askAgent, getAgentStatus } from '../../services/agentService.js';
import { listEmployees } from '../../services/employeeService.js';

/** The AI assistant: managers and admins ask about their people, employees about their own work. */
export default function AssistantPage() {
  const { user } = useAuth();
  const personal = user.role === 'employee';
  const status = useApi((signal) => getAgentStatus({ signal }));
  const employees = useApi(
    async (signal) => (personal ? [] : (await listEmployees({ signal })).filter((employee) => employee.status !== 'inactive')),
    [personal]
  );
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleAsk(input) {
    setBusy(true);
    setError(null);
    try {
      setResult(await askAgent(input));
    } catch (askError) {
      setError(askError);
    } finally {
      setBusy(false);
    }
  }

  const engine = status.data ? (status.data.aiConfigured ? `Answers are written by ${status.data.model}` : 'No AI model is configured, so answers come from fixed rules') : null;

  return (
    <>
      <PageHeading eyebrow="Insights" title="AI assistant">
        {personal
          ? 'Ask about your tasks, deadlines and sign-ins. Every number is calculated from your records, and each statement shows its evidence.'
          : 'Ask about tasks, deadlines and sign-in activity. Every number is calculated from the records, and each statement shows its evidence.'}
      </PageHeading>

      <article className="panel section-gap">
        <PanelHeader title={personal ? 'Ask about your work' : 'Ask about your people'} subtitle={engine} />
        <StatusMessage loading={employees.loading} error={employees.error} onRetry={employees.reload} />
        {!employees.loading && !employees.error && <AskAgentForm employees={employees.data ?? []} personal={personal} busy={busy} onAsk={handleAsk} />}
      </article>

      {busy && <StatusMessage loading />}
      {error && <StatusMessage error={error} />}
      {!busy && result && <AgentResult result={result} />}
    </>
  );
}
