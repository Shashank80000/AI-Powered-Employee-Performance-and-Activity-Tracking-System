// No look-alike characters (0/O, 1/l/I), so a temporary password can be read out or copied by hand.
const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/** A random 12-character temporary password with letters and digits, which the server's rules accept. */
export function suggestPassword(length = 12) {
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(LETTERS), pick(DIGITS), ...Array.from({ length: length - 2 }, () => pick(LETTERS + DIGITS))];
  // Shuffle so the letter and digit aren't always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** The server's password rules, for a live checklist while typing. */
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { label: 'At least one letter', test: (password) => /[A-Za-z]/.test(password) },
  { label: 'At least one number', test: (password) => /\d/.test(password) }
];

/** The same rules the server enforces, checked before sending so the person sees the problem at once. */
export function passwordProblem(password) {
  if (password.length < 8) return 'Use at least 8 characters for the password';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter in the password';
  if (!/\d/.test(password)) return 'Include at least one number in the password';
  return null;
}
