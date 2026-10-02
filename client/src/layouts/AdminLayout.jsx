import { BarChart3, CalendarCheck, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import AppShell from '../components/common/AppShell.jsx';

const NAV_ITEMS = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Employees', to: '/admin/employees', icon: Users },
  { label: 'Tasks', to: '/admin/tasks', icon: ListChecks },
  { label: 'Reports', to: '/admin/reports', icon: BarChart3 },
  { label: 'Daily analysis', to: '/admin/analysis', icon: CalendarCheck }
];

export default function AdminLayout() {
  return <AppShell section="Admin" navItems={NAV_ITEMS} />;
}
