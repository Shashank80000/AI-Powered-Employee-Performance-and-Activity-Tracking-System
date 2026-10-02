import { Menu } from 'lucide-react';
import Avatar from './Avatar.jsx';
import TrackingControl from './TrackingControl.jsx';

export default function Topbar({ section, title, user, menuOpen, onOpenMenu }) {
  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" onClick={onOpenMenu} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="primary-sidebar">
        <Menu size={20} />
      </button>
      <div className="breadcrumbs">
        <span>{section}</span>
        <b aria-hidden="true">/</b>
        <strong>{title}</strong>
      </div>
      <div className="topbar-actions">
        {user.role === 'employee' && <TrackingControl />}
        <Avatar name={user.name} size="small" />
      </div>
    </header>
  );
}
