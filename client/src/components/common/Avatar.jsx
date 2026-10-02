import { initials } from '../../utils/formatters.js';

const TONES = ['teal', 'amber', 'coral', 'blue'];

function toneFor(name) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return TONES[hash % TONES.length];
}

export default function Avatar({ name, size }) {
  return (
    <div className={`avatar ${size === 'small' ? 'avatar-small' : ''} ${toneFor(name)}`} aria-hidden="true">
      {initials(name)}
    </div>
  );
}
