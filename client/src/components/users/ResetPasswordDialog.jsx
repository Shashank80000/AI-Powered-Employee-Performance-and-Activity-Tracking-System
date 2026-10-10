import { useState } from 'react';
import { resetPassword } from '../../services/userService.js';
import { errorMessage } from '../../utils/formatters.js';
import { passwordProblem, suggestPassword } from '../../utils/password.js';
import Modal from '../common/Modal.jsx';
import PasswordField from '../common/PasswordField.jsx';

/** Admin sets a temporary password for someone locked out; they must choose their own at next sign-in. */
export default function ResetPasswordDialog({ person, onClose, onDone }) {
  const [password, setPassword] = useState(() => suggestPassword());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await resetPassword(person.userId ?? person.id, password);
      onDone(`${person.name}'s password was reset. Give them the temporary password privately; they will be asked to choose a new one when they sign in.`);
    } catch (resetError) {
      setError(errorMessage(resetError));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset password for ${person.name}`} description="Use this when someone forgot their password. Their old password stops working at once." onClose={onClose}>
      <form className="form-grid single" onSubmit={handleSubmit}>
        <PasswordField
          label="Temporary password"
          value={password}
          onChange={setPassword}
          suggest
          help="Share it in person or through a private channel, never by group chat or email. They choose their own password at their next sign-in."
        />
        <div className="form-actions">
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="text-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving}>{saving ? 'Resetting…' : 'Reset password'}</button>
        </div>
      </form>
    </Modal>
  );
}
