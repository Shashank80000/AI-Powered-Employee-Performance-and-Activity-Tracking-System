import GettingStarted from '../../components/dashboard/GettingStarted.jsx';
import ManagerDashboard from '../manager/ManagerDashboard.jsx';

/** Organisation-wide overview: the same dashboard, scoped to every employee, plus the setup checklist. */
export default function AdminDashboard() {
  return <ManagerDashboard basePath="/admin" intro={<GettingStarted />} />;
}
