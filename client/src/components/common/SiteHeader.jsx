import { ArrowRight, Menu, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const links = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#roles', label: 'For your role' },
  { href: '/#download', label: 'Download' }
];

/** Top navigation of the public pages (home and download). */
export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <header className="home-nav">
      <Link to="/" className="home-brand" aria-label="WorkPlus home">
        <span className="brand-mark"><Sparkles size={18} aria-hidden="true" /></span>
        <span><strong>workplus</strong><small>performance OS</small></span>
      </Link>
      <button className="home-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav className={`home-links ${menuOpen ? 'home-links-open' : ''}`} aria-label="Site navigation">
        {links.map(({ href, label }) => <a key={href} href={href} onClick={close}>{label}</a>)}
        <Link className="home-nav-cta" to="/login" onClick={close}>Open workspace <ArrowRight size={15} /></Link>
      </nav>
    </header>
  );
}
