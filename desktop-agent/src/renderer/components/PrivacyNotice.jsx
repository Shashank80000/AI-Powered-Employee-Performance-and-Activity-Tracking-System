/**
 * Plain-language list of what the agent collects and never collects. With `consent` it
 * reflects the person's actual choices; without it (login screen) it explains the options.
 */
export default function PrivacyNotice({ capabilities, consent, intervalMinutes = 5 }) {
  const accepted = Boolean(consent?.acceptedAt);
  const unavailable = (flag) => capabilities && !flag && <span className="muted"> - currently unavailable</span>;

  const keyboardItem = <li key="kb">Number of key presses (count only){accepted && unavailable(capabilities?.keyboard)}</li>;
  const appsItem = (
    <li key="apps">
      Name of the app in front and how long (e.g. "Code", 12 min){accepted && unavailable(capabilities?.applications)}
    </li>
  );
  const shotsItem = (
    <li key="shots">
      A screenshot of your main screen every {intervalMinutes} minutes while active (your manager can view it; you can see
      who did, and delete it)
    </li>
  );

  if (!accepted) {
    return (
      <section className="card privacy">
        <h2>What this agent can collect</h2>
        <p className="muted small">After you sign in you choose what to share. Nothing starts before that.</p>
        <ul className="yes">
          <li>Active and idle time, and number of mouse movements (required)</li>
          <li>Number of key presses (count only) - optional</li>
          <li>Name of the app in front and how long - optional</li>
          <li>Screenshots every {intervalMinutes} minutes - optional, off unless you turn them on</li>
          <li>Time spent on the task you select</li>
        </ul>
        <h2>What it never collects</h2>
        <ul className="no">
          <li>Which keys you press or anything you type</li>
          <li>Window titles, document names or website URLs</li>
          <li>Screen recordings, camera or microphone</li>
        </ul>
      </section>
    );
  }

  return (
    <section className="card privacy">
      <h2>What you chose to share</h2>
      <ul className="yes">
        <li>Active and idle time (from the system idle timer)</li>
        <li>Number of mouse movements (count only)</li>
        {consent.keyboard && keyboardItem}
        {consent.apps && appsItem}
        {consent.screenshots && shotsItem}
        <li>Time spent on the task you select</li>
      </ul>
      <h2>Not collected</h2>
      <ul className="no">
        {!consent.keyboard && <li>Key press counts (you turned this off)</li>}
        {!consent.apps && <li>App names (you turned this off)</li>}
        {!consent.screenshots && <li>Screenshots (off)</li>}
        <li>Which keys you press or anything you type</li>
        <li>Window titles, document names or website URLs</li>
        <li>Screen recordings, camera or microphone</li>
      </ul>
      <p className="muted small">
        Nothing is collected while tracking is paused or you are signed out. Change this any time in Settings.
      </p>
    </section>
  );
}
