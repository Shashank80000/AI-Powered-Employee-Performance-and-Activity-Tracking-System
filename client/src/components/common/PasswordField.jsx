import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { suggestPassword } from '../../utils/password.js';

/** Password input with show/hide and, for temporary passwords an admin sets, a "Suggest" button. */
export default function PasswordField({ label, value, onChange, help, suggest = false, autoComplete = 'new-password', required = true }) {
  const [visible, setVisible] = useState(suggest);
  return (
    <label>
      {label}
      <span className="password-input">
        <input
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={8}
          autoComplete={autoComplete}
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="icon-button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        {suggest && (
          <button type="button" className="icon-button" onClick={() => onChange(suggestPassword())} aria-label="Suggest a strong password" title="Suggest a strong password">
            <Wand2 size={15} />
          </button>
        )}
      </span>
      {help && <small className="field-help">{help}</small>}
    </label>
  );
}
