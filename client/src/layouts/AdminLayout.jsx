import { BarChart3, CalendarCheck, CircleHelp, LayoutDashboard, ListChecks, UserCog, UserRound, Users } from 'lucide-react';
import AppShell from '../components/common/AppShell.jsx';

const NAV_ITEMS = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Managers', to: '/admin/managers', icon: UserCog },
  { label: 'Employees', to: '/admin/employees', icon: Users },
  { label: 'Tasks', to: '/admin/tasks', icon: ListChecks },
  { label: 'Reports', to: '/admin/reports', icon: BarChart3 },
  { label: 'Daily analysis', to: '/admin/analysis', icon: CalendarCheck }
];

const FOOTER_ITEMS = [
  { label: 'Help', to: '/admin/help', icon: CircleHelp },
  { label: 'My account', to: '/admin/account', icon: UserRound }
];

export default function AdminLayout() {
  return <AppShell section="Admin" navItems={NAV_ITEMS} footerItems={FOOTER_ITEMS} />;
}
