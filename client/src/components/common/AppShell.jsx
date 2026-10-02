import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import DemoBanner from './DemoBanner.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

/** Sidebar + topbar frame shared by the admin, manager and employee layouts. */
export default function AppShell({ section, navItems }) {
  const { user, demo, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [menuOpen, setMenuOpen] = useState(false);

  const current = [...navItems].reverse().find((item) => location.pathname.startsWith(item.to)) ?? navItems[0];

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <Sidebar
        navItems={navItems}
        user={user}
        open={menuOpen}
        hidden={isMobile && !menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
      />
      {isMobile && menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <main className="main-content">
        <Topbar section={section} title={current.label} user={user} menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
        <div className="page-wrap">
          {demo && <DemoBanner />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
