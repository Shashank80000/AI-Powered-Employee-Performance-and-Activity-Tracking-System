import { LogOut, Sparkles, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABELS } from '../../utils/constants.js';
import Avatar from './Avatar.jsx';

function NavItems({ items, onClose }) {
  return items.map(({ label, to, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  ));
}

export default function Sidebar({ navItems, footerItems = [], user, open, hidden, onClose, onLogout }) {
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
        <NavItems items={navItems} onClose={onClose} />
        {footerItems.length > 0 && (
          <>
            <p className="nav-caption nav-caption-gap">Support</p>
            <NavItems items={footerItems} onClose={onClose} />
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <Avatar name={user.name} size="small" />
        <div>
          <strong>{user.name}</strong>
          <span>{ROLE_LABELS[user.role]}</span>
        </div>
        <button className="sidebar-logout" onClick={onLogout} title="Sign out of this website">
          <LogOut size={16} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
