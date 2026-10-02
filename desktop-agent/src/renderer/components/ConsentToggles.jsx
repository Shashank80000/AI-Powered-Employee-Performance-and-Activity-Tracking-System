/**
 * The person's data-sharing choices. Activity time is required (shown checked and locked);
 * keyboard count and app names default on; screenshots default OFF and carry a warning.
 */
export default function ConsentToggles({ value, onChange, disabled, intervalMinutes = 5, capabilities }) {
  const set = (key) => (e) =>
    onChange({
      ...value,
      [key]: e.target.checked,
      // Turning screenshots off (or on again) always needs a fresh, explicit manager agreement.
      ...(key === 'screenshots' && { managerViewScreenshots: false }),
    });
  // Options this computer can't support (e.g. on Linux Wayland) are shown, but locked off with the reason.
  const unsupported = (key) => capabilities?.[key] && !capabilities[key].supported;
  const Unavailable = ({ name }) =>
    unsupported(name) ? <span className="callout warning-box">Not available on this computer. {capabilities[name].reason}</span> : null;

  return (
    <div className="toggles">
      <label className="toggle">
        <input type="checkbox" checked readOnly disabled />
        <span>
          <span className="toggle-title">Activity time <span className="pill">Required</span></span>
          <span className="toggle-help">
            Active vs. idle minutes from the system idle timer, plus how many times the mouse moved (a count).
            WorkPlus cannot work without this, so if you do not want to share it, do not start tracking.
          </span>
          {capabilities?.idle?.limited && <span className="callout warning-box">{capabilities.idle.reason}</span>}
        </span>
      </label>

      <label className="toggle">
        <input type="checkbox" checked={Boolean(value.keyboard) && !unsupported('keyboard')} disabled={disabled || unsupported('keyboard')} onChange={set('keyboard')} />
        <span>
          <span className="toggle-title">Keyboard activity count</span>
          <span className="toggle-help">
            How many keys you pressed per minute. Never which keys, and never anything you type.
          </span>
          <Unavailable name="keyboard" />
        </span>
      </label>

      <label className="toggle">
        <input type="checkbox" checked={Boolean(value.apps) && !unsupported('apps')} disabled={disabled || unsupported('apps')} onChange={set('apps')} />
        <span>
          <span className="toggle-title">App names</span>
          <span className="toggle-help">
            The name of the app in front and for how long (e.g. "Code", 12 min). Never window titles, documents or URLs.
          </span>
          <Unavailable name="apps" />
        </span>
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={Boolean(value.screenshots) && !unsupported('screenshots')}
          disabled={disabled || unsupported('screenshots')}
          onChange={set('screenshots')}
        />
        <span>
          <span className="toggle-title">Screenshots every {intervalMinutes} minutes <span className="pill">Off by default</span></span>
          <span className="toggle-help">
            One picture of your main screen every {intervalMinutes} minutes while you are active (skipped when idle,
            locked or paused). <strong>Your manager and administrators can view them</strong>; you can see who viewed
            each one.
          </span>
          <Unavailable name="screenshots" />
        </span>
      </label>
      {value.screenshots && (
        <label className="toggle manager-consent">
          <input
            type="checkbox"
            checked={Boolean(value.managerViewScreenshots)}
            disabled={disabled}
            onChange={set('managerViewScreenshots')}
          />
          <span>
            <span className="toggle-title">
              I agree that my manager and administrators can view my screenshots <span className="pill">Required</span>
            </span>
            <span className="toggle-help">
              Every time they open one it is recorded, and you can see who viewed it and when in the web dashboard.
            </span>
          </span>
        </label>
      )}
      {value.screenshots && (
        <span className="callout warning-box">
          A screenshot may capture whatever is on your screen at that moment, including private messages or
          personal content, and your manager may see it. Pause tracking before anything private, delete any
          screenshot in the web dashboard, or turn screenshots off at any time (that deletes all of them). A
          notification appears every time one is taken.
        </span>
      )}
    </div>
  );
}
