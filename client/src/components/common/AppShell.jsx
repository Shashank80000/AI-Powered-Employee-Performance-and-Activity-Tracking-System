import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import DemoBanner from './DemoBanner.jsx';
import Notice from './Notice.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

/** Sidebar + topbar frame shared by the admin, manager and employee layouts. */
export default function AppShell({ section, navItems, footerItems = [] }) {
  const { user, demo, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 720px)');
  const [menuOpen, setMenuOpen] = useState(false);
  // Shown once after a new account chose its own password (AccountPage navigates here with this state).
  const [welcome, setWelcome] = useState(Boolean(location.state?.welcome));
  const dismissWelcome = useCallback(() => setWelcome(false), []);
  // The layout stays mounted when the account page navigates home, so pick the flag up on navigation too.
  // It only belongs on the page reached right after: moving on clears it, so it never hides an action's own message.
  useEffect(() => {
    setWelcome(Boolean(location.state?.welcome));
  }, [location.key, location.state]);

  const current = [...navItems, ...footerItems].reverse().find((item) => location.pathname.startsWith(item.to)) ?? navItems[0];

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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        navItems={navItems}
        footerItems={footerItems}
        user={user}
        open={menuOpen}
        hidden={isMobile && !menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
      />
      {isMobile && menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <main className="main-content" id="main-content" tabIndex={-1}>
        <Topbar section={section} title={current.label} user={user} menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
        <div className="page-wrap">
          {demo && <DemoBanner />}
          <Notice onDismiss={dismissWelcome}>
            {welcome && (
              <>Your password is saved. Welcome to WorkPlus! New here? The <Link to={`${navItems[0].to}/help`}>user guide</Link> shows what to do first.</>
            )}
          </Notice>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
