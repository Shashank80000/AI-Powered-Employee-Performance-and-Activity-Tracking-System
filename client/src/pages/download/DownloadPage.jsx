import { ArrowRight, Check, Copy, Download, Laptop, LayoutDashboard, LogIn, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '../../components/common/SiteHeader.jsx';
import DownloadButton from '../../components/download/DownloadButton.jsx';
import DownloadOptions from '../../components/download/DownloadOptions.jsx';
import { useAgentDownloads } from '../../hooks/useAgentDownloads.js';
import { API_BASE_URL } from '../../services/api.js';
import { FIRST_LAUNCH, PLATFORM_LABELS } from '../../utils/platform.js';

const steps = [
  { icon: Download, title: 'Download and install', text: 'Open the installer and read the monitoring notice. Installing means you agree to it.' },
  { icon: LogIn, title: 'Sign in', text: 'Use the same work email and password as this website. The agent already knows which server to use.' },
  { icon: SlidersHorizontal, title: 'Choose what to share', text: 'Activity time is required. Keyboard counts, app names and screenshots are optional and off until you turn them on.' },
  { icon: LayoutDashboard, title: 'See it on your dashboard', text: 'The agent sends activity every minute. It appears on your dashboard here and on your manager’s.' }
];


export default function DownloadPage() {
  const downloads = useAgentDownloads();
  const { data, installers, platform } = downloads;
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(API_BASE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the address is visible to copy by hand.
    }
  }

  return (
    <div className="home-page">
      <SiteHeader />
      <main>
        <section className="download-hero">
          <p className="home-eyebrow"><span /> Desktop agent{data?.version ? ` · version ${data.version}` : ''}</p>
          <h1>Install WorkPlus<br /><em>on your work computer.</em></h1>
          <p className="hero-description">The desktop agent records only what you agree to share and sends it to your organisation’s WorkPlus server, where it appears on your dashboard. You can pause it at any time.</p>

          {data && installers.length === 0 && (
            <div className="download-empty">
              <strong>No installers have been published yet.</strong>
              <span>Ask your administrator to publish them. (Administrators: run <code>npm run agent:publish -- --server &lt;this server’s address&gt;</code>.)</span>
            </div>
          )}
          <div className="hero-actions">
            <DownloadButton downloads={downloads} listHref="#all-downloads" />
            <a className="home-secondary-button" href="#all-downloads">Other systems and formats <ArrowRight size={15} /></a>
          </div>
          <div className="hero-note"><ShieldCheck size={16} /><span>No keystroke content, window titles or websites, ever. Screenshots are off unless you turn them on.</span></div>
        </section>

        <section className="home-section download-steps-section">
          <div className="section-intro"><p className="home-eyebrow"><span /> Four steps</p><h2>From download<br /><em>to your dashboard.</em></h2></div>
          <ol className="download-steps">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title}>
                <span className="feature-icon teal"><Icon size={18} aria-hidden="true" /></span>
                <small>Step {index + 1}</small>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          {platform && <p className="download-tip"><Laptop size={15} aria-hidden="true" /> <span><strong>First launch on {PLATFORM_LABELS[platform]}:</strong> {FIRST_LAUNCH[platform]}</span></p>}
        </section>

        <section className="home-section download-all" id="all-downloads">
          <div className="section-intro"><p className="home-eyebrow"><span /> Every system</p><h2>All downloads</h2></div>
          <DownloadOptions downloads={downloads} />
        </section>

        <section className="home-section download-server">
          <div>
            <h3>Server address</h3>
            <p>The agent connects to this server on its own. If it ever asks for a server address, enter:</p>
          </div>
          <div className="download-address">
            <code>{API_BASE_URL}</code>
            <button type="button" onClick={copyAddress} aria-label="Copy server address">
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <Link className="home-primary-button" to="/login">Open your dashboard <ArrowRight size={15} /></Link>
        </section>
      </main>
    </div>
  );
}
