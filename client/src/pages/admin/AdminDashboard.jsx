import ManagerDashboard from '../manager/ManagerDashboard.jsx';

/** Organisation-wide overview: the same dashboard, scoped to every employee. */
export default function AdminDashboard() {
  return <ManagerDashboard basePath="/admin" />;
}
