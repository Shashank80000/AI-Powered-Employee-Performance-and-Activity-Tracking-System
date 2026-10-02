import { CalendarDays } from 'lucide-react';
import { PERIODS } from '../../utils/constants.js';

export default function PeriodSelect({ value, onChange, options = PERIODS }) {
  return (
    <label className="period-button">
      <CalendarDays size={16} aria-hidden="true" />
      <span className="visually-hidden">Period</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
