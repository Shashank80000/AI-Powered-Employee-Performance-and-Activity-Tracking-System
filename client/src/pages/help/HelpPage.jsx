import { useState } from 'react';
import PageHeading from '../../components/common/PageHeading.jsx';
import SiteHeader from '../../components/common/SiteHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import HelpContent from './HelpContent.jsx';

/** The user guide inside the workspace, opened on the signed-in person's role. */
export default function HelpPage() {
  const { user } = useAuth();
  const [role, setRole] = useState(user.role);
  return (
    <>
      <PageHeading eyebrow="Help" title="User guide">
        How to get started, how work moves between administrators, managers and employees, and what to do when something goes wrong.
      </PageHeading>
      <HelpContent role={role} onRoleChange={setRole} signedIn />
    </>
  );
}

/** The same guide for people who aren't signed in yet, linked from the sign-in page. */
export function PublicHelpPage() {
  const [role, setRole] = useState('employee');
  return (
    <div className="home-page">
      <SiteHeader />
      <main className="public-help">
        <PageHeading eyebrow="Help" title="User guide">
          Everything a new administrator, manager or employee needs to start using WorkPlus.
        </PageHeading>
        <HelpContent role={role} onRoleChange={setRole} />
      </main>
    </div>
  );
}
