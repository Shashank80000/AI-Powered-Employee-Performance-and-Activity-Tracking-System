import { LogOut, Sparkles, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABELS } from '../../utils/constants.js';
import Avatar from './Avatar.jsx';

export default function Sidebar({ navItems, user, open, hidden, onClose, onLogout }) {
  return (
    <aside id="primary-sidebar" className={`sidebar ${open ? 'sidebar-open' : ''}`} inert={hidden}>
      <div className="brand-row">
        <div className="brand-mark">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div>
          <strong>workplus</strong>
          <span>performance OS</span>
        </div>
        <button className="icon-button mobile-close" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>

      <nav className="primary-nav" aria-label="Primary navigation">
        <p className="nav-caption">Workspace</p>
        {navItems.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <Avatar name={user.name} size="small" />
        <div>
          <strong>{user.name}</strong>
          <span>{ROLE_LABELS[user.role]}</span>
        </div>
        <button className="icon-button sidebar-logout" onClick={onLogout} aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
