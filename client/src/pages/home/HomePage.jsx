import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  Users
} from 'lucide-react';
import { Link } from 'react-router-dom';
import SiteHeader from '../../components/common/SiteHeader.jsx';
import DownloadButton from '../../components/download/DownloadButton.jsx';
import DownloadOptions from '../../components/download/DownloadOptions.jsx';
import { useAgentDownloads } from '../../hooks/useAgentDownloads.js';

const features = [
  { icon: Users, tone: 'teal', title: 'Role-based workspace', description: 'Separate views for administrators, managers and employees keep every person focused on the data they are allowed to use.' },
  { icon: Target, tone: 'coral', title: 'Task management', description: 'Create, assign and prioritize work, then follow progress from to-do through review and completion.' },
  { icon: Activity, tone: 'blue', title: 'Activity tracking', description: 'Collect active time, idle time, mouse events, keyboard counts and application usage without recording keystroke content.' },
  { icon: BarChart3, tone: 'amber', title: 'Performance analytics', description: 'Turn activity and task data into productivity scores, trends, focus distribution and team comparisons.' },
  { icon: Clock3, tone: 'teal', title: 'Expected vs actual time', description: 'Compare planned task duration with real completion time to improve estimates and workload planning.' },
  { icon: Sparkles, tone: 'coral', title: 'AI insights', description: 'Generate reports, recommendations and unusual-pattern alerts from aggregated performance data.' },
  { icon: FileText, tone: 'blue', title: 'Reports and analysis', description: 'Review daily, weekly and monthly summaries with a clear audit trail of how each insight was produced.' },
  { icon: Eye, tone: 'amber', title: 'Optional screenshots', description: 'Screenshots are off by default, permission-based, visible to the right people and automatically retained for only three days.' },
  { icon: ShieldCheck, tone: 'teal', title: 'Privacy by design', description: 'Consent, pause and resume controls, scoped access, data minimization and audit logging are part of the workflow.' }
];

const roles = [
  { role: 'Administrator', label: 'Set the system up', description: 'Manage employees, organization-wide tasks, reports and access controls.', tone: 'teal' },
  { role: 'Manager', label: 'Run the team', description: 'Assign work, monitor progress, compare performance and act on insights.', tone: 'coral' },
  { role: 'Employee', label: 'Own your workday', description: 'See your tasks, activity, reports, consent choices and tracking status.', tone: 'blue' }
];

export default function HomePage() {
  const downloads = useAgentDownloads();
  return (
    <div className="home-page">
      <SiteHeader />

      <main>
        <section className="home-hero">
          <div className="hero-copy">
            <p className="home-eyebrow"><span /> A clearer way to work together</p>
            <h1>See the work.<br /><em>Improve the way</em> it gets done.</h1>
            <p className="hero-description">WorkPlus brings tasks, privacy-conscious activity signals and meaningful performance insights into one calm workspace for modern teams.</p>
            <div className="hero-actions"><DownloadButton downloads={downloads} /><Link className="home-secondary-button" to="/login">Open your workspace <ChevronRight size={16} /></Link></div>
            <div className="hero-note"><ShieldCheck size={16} /><span>No raw keystrokes. No hidden tracking. Consent comes first.</span></div>
          </div>
          <div className="hero-visual" aria-label="Preview of the WorkPlus workspace">
            <div className="visual-glow" />
            <div className="mini-window">
              <div className="mini-window-top"><span><i /><i /><i /></span><small>team overview</small><span className="mini-live">● live</span></div>
              <div className="mini-window-heading"><div><small>THURSDAY, 01 OCTOBER</small><strong>Good morning, Sachin <span>✦</span></strong></div><span className="mini-date">This week⌄</span></div>
              <div className="mini-metrics"><MiniMetric value="84%" label="Productivity" tone="teal" /><MiniMetric value="186h" label="Tracked time" tone="amber" /><MiniMetric value="132" label="Tasks done" tone="coral" /></div>
              <div className="mini-chart"><div className="mini-chart-header"><strong>Team productivity</strong><span>+12.5%</span></div><svg viewBox="0 0 500 115" preserveAspectRatio="none" role="img" aria-label="Rising productivity chart"><path d="M0,91 C45,94 50,72 93,78 S139,62 180,68 S222,51 266,58 S305,48 350,38 S401,50 444,23 S471,28 500,10 V115 H0Z" fill="#daf2ed" /><path d="M0,91 C45,94 50,72 93,78 S139,62 180,68 S222,51 266,58 S305,48 350,38 S401,50 444,23 S471,28 500,10" fill="none" stroke="#168e82" strokeWidth="3" strokeLinecap="round" /></svg><div className="mini-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div>
              <div className="mini-team"><div className="mini-team-heading"><strong>Team performance</strong><span>View all →</span></div>{['Akash Yadav', 'Shashank Pandey', 'Riya Kapoor'].map((name, index) => <div className="mini-person" key={name}><span className={`mini-avatar mini-avatar-${index}`}>{name.split(' ').map((part) => part[0]).join('')}</span><strong>{name}</strong><span className="mini-progress"><i style={{ width: `${94 - index * 8}%` }} /></span><b>{94 - index * 8}%</b></div>)}</div>
            </div>
          </div>
        </section>

        <section className="home-section feature-section" id="features"><div className="section-intro"><p className="home-eyebrow"><span /> One connected workspace</p><h2>Everything your team needs<br /><em>to make work visible.</em></h2><p>Each feature has a clear job: help people plan better, understand the workday and make decisions with context.</p></div><div className="feature-grid">{features.map(({ icon: Icon, tone, title, description }) => <article className="feature-card" key={title}><div className={`feature-icon ${tone}`}><Icon size={19} /></div><h3>{title}</h3><p>{description}</p><span className="feature-arrow"><ArrowRight size={15} /></span></article>)}</div></section>

        <section className="home-section workflow-section" id="how-it-works"><div className="section-intro centered"><p className="home-eyebrow"><span /> A simple operating rhythm</p><h2>From first sign-in<br /><em>to useful insight.</em></h2><p>WorkPlus keeps the workflow understandable for everyone involved.</p></div><div className="workflow-steps"><WorkflowStep number="01" title="Choose your role" text="Sign in as an administrator, manager or employee. Your role determines the workspace and data you can access." /><WorkflowStep number="02" title="Plan the work" text="Managers create tasks, set priorities and expected time, then assign them to the right employee." /><WorkflowStep number="03" title="Install the agent" text="Each employee downloads the desktop agent from this website, signs in, chooses what to share, and can pause or resume at any time." /><WorkflowStep number="04" title="Learn and improve" text="The system turns approved activity and task data into dashboards, reports, AI recommendations and trends." /></div></section>

        <section className="home-section role-section" id="roles"><div className="section-intro"><p className="home-eyebrow"><span /> Designed around responsibility</p><h2>The right view<br /><em>for every role.</em></h2><p>One system, three focused experiences. No one has to navigate data that does not belong to them.</p></div><div className="role-grid">{roles.map(({ role, label, description, tone }) => <article className={`role-card role-${tone}`} key={role}><div className="role-number">0{roles.findIndex((item) => item.role === role) + 1}</div><div><span>{label}</span><h3>{role}</h3><p>{description}</p><Link to="/login">Explore workspace <ArrowRight size={14} /></Link></div></article>)}</div></section>

        <section className="home-section download-home" id="download">
          <div className="section-intro"><p className="home-eyebrow"><span /> Desktop agent</p><h2>Download for<br /><em>your computer.</em></h2><p>Every employee installs the agent once. It tracks only what they agree to share and sends it to the dashboard. Your system is detected automatically and shown first.</p></div>
          <DownloadOptions downloads={downloads} showTips={false} />
          <p className="download-guide-link"><Link to="/download">Setup guide and first-launch tips <ArrowRight size={14} /></Link></p>
        </section>

        <section className="privacy-section"><div className="privacy-badge"><LockKeyhole size={20} /></div><div><p className="home-eyebrow"><span /> Trust is a product feature</p><h2>Useful data.<br /><em>Respectful by default.</em></h2><p>Activity counts instead of content. Screenshots off by default. Scoped access, explicit consent and automatic retention limits built into the product.</p></div><Link className="privacy-link" to="/login">Read the workspace rules <ArrowRight size={15} /></Link></section>
      </main>
      <footer className="home-footer"><Link to="/" className="home-brand"><span className="brand-mark"><Sparkles size={16} /></span><span><strong>workplus</strong><small>performance OS</small></span></Link><span>AI-powered performance tracking for transparent teams.</span><Link to="/login">Sign in <ArrowRight size={14} /></Link></footer>
    </div>
  );
}

function MiniMetric({ value, label, tone }) { return <div className="mini-metric"><span className={`mini-metric-dot ${tone}`} /><strong>{value}</strong><small>{label}</small></div>; }
function WorkflowStep({ number, title, text }) { return <article className="workflow-step"><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>; }