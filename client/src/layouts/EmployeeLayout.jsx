import { Activity, CalendarCheck, Images, LayoutDashboard, ListChecks } from 'lucide-react';
import AppShell from '../components/common/AppShell.jsx';

const NAV_ITEMS = [
  { label: 'Overview', to: '/employee', icon: LayoutDashboard, end: true },
  { label: 'My tasks', to: '/employee/tasks', icon: ListChecks },
  { label: 'My activity', to: '/employee/activity', icon: Activity },
  { label: 'Daily analysis', to: '/employee/analysis', icon: CalendarCheck },
  { label: 'My screenshots', to: '/employee/screenshots', icon: Images }
];

export default function EmployeeLayout() {
  return <AppShell section="My workspace" navItems={NAV_ITEMS} />;
}
