import { BarChart3, CalendarCheck, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import AppShell from '../components/common/AppShell.jsx';

const NAV_ITEMS = [
  { label: 'Overview', to: '/manager', icon: LayoutDashboard, end: true },
  { label: 'My team', to: '/manager/employees', icon: Users },
  { label: 'Tasks', to: '/manager/tasks', icon: ListChecks },
  { label: 'Reports', to: '/manager/reports', icon: BarChart3 },
  { label: 'Daily analysis', to: '/manager/analysis', icon: CalendarCheck }
];

export default function ManagerLayout() {
  return <AppShell section="Workspace" navItems={NAV_ITEMS} />;
}
