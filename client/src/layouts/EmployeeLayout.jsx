import { Activity, CalendarCheck, CircleHelp, Images, LayoutDashboard, ListChecks, UserRound } from 'lucide-react';
import AppShell from '../components/common/AppShell.jsx';

const NAV_ITEMS = [
  { label: 'Overview', to: '/employee', icon: LayoutDashboard, end: true },
  { label: 'My tasks', to: '/employee/tasks', icon: ListChecks },
  { label: 'My activity', to: '/employee/activity', icon: Activity },
  { label: 'Daily analysis', to: '/employee/analysis', icon: CalendarCheck },
  { label: 'My screenshots', to: '/employee/screenshots', icon: Images }
];

const FOOTER_ITEMS = [
  { label: 'Help', to: '/employee/help', icon: CircleHelp },
  { label: 'My account', to: '/employee/account', icon: UserRound }
];

export default function EmployeeLayout() {
  return <AppShell section="My workspace" navItems={NAV_ITEMS} footerItems={FOOTER_ITEMS} />;
}
