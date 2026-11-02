import { useState } from 'react';
import {
  PERIOD_SHORTCUTS,
  businessToday,
  formatPeriodLabel,
  matchingShortcut,
  parseIsoDate,
  shortcutRange,
} from './period';

const INVERTED_RANGE_ERROR = 'La date de début doit être antérieure ou égale à la date de fin.';

/**
 * Period selector of the dashboard: « Du » / « Au » dates, calendar shortcuts and
 * the active period label. `children` is the right-hand actions slot.
 * Manual dates are applied as soon as the range is complete and valid; an
 * inverted range shows an error and keeps the active period.
 */
export default function PeriodPicker({ value, onChange, children }) {
  // Draft of the two inputs, reset whenever the active period changes.
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value.dateFrom !== syncedValue.dateFrom || value.dateTo !== syncedValue.dateTo) {
    setSyncedValue(value);
    setDraft(value);
  }

  const complete = parseIsoDate(draft.dateFrom) !== null && parseIsoDate(draft.dateTo) !== null;
  const inverted = complete && draft.dateFrom > draft.dateTo;
  const activeShortcut = matchingShortcut(value, businessToday());

  const handleDateChange = (field) => (event) => {
    const next = { ...draft, [field]: event.target.value };
    setDraft(next);
    const valid = parseIsoDate(next.dateFrom) !== null && parseIsoDate(next.dateTo) !== null;
    if (valid && next.dateFrom <= next.dateTo
      && (next.dateFrom !== value.dateFrom || next.dateTo !== value.dateTo)) {
      onChange(next);
    }
  };

  return (
    <section className="period-picker" aria-label="Période">
      <div className="period-picker-row">
        <div className="period-picker-fields">
          <label className="period-picker-field">
            <span>Du</span>
            <input
              type="date"
              className="form-input"
              value={draft.dateFrom}
              onChange={handleDateChange('dateFrom')}
              aria-invalid={inverted || undefined}
            />
          </label>
          <label className="period-picker-field">
            <span>Au</span>
            <input
              type="date"
              className="form-input"
              value={draft.dateTo}
              onChange={handleDateChange('dateTo')}
              aria-invalid={inverted || undefined}
            />
          </label>
        </div>

        <div className="period-picker-shortcuts">
          {PERIOD_SHORTCUTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`period-shortcut${activeShortcut === key ? ' active' : ''}`}
              aria-pressed={activeShortcut === key}
              onClick={() => {
                const next = shortcutRange(key, businessToday());
                setDraft(next);
                onChange(next);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {children && <div className="period-picker-actions">{children}</div>}
      </div>

      <p className="period-picker-label">{formatPeriodLabel(value)}</p>
      {inverted && (
        <p className="period-picker-error" role="alert">{INVERTED_RANGE_ERROR}</p>
      )}
    </section>
  );
}
