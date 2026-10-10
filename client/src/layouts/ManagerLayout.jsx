import { BarChart3, CalendarCheck, CircleHelp, LayoutDashboard, ListChecks, UserRound, Users } from 'lucide-react';
import AppShell from '../components/common/AppShell.jsx';

const NAV_ITEMS = [
  { label: 'Overview', to: '/manager', icon: LayoutDashboard, end: true },
  { label: 'My team', to: '/manager/employees', icon: Users },
  { label: 'Tasks', to: '/manager/tasks', icon: ListChecks },
  { label: 'Reports', to: '/manager/reports', icon: BarChart3 },
  { label: 'Daily analysis', to: '/manager/analysis', icon: CalendarCheck }
];

const FOOTER_ITEMS = [
  { label: 'Help', to: '/manager/help', icon: CircleHelp },
  { label: 'My account', to: '/manager/account', icon: UserRound }
];

export default function ManagerLayout() {
  return <AppShell section="Workspace" navItems={NAV_ITEMS} footerItems={FOOTER_ITEMS} />;
}
