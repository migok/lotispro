/**
 * Dashboard period helpers (E6-T2).
 *
 * A period is `{ dateFrom, dateTo }` with ISO `YYYY-MM-DD` strings, both bounds
 * inclusive. Dates are always built from their parts in local time: never
 * `new Date('YYYY-MM-DD')`, which is parsed as UTC midnight and drifts a day
 * in negative offsets.
 */

export const PERIOD_STORAGE_KEY = 'lotispro-dashboard-period';

export const PERIOD_SHORTCUTS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'quarter', label: 'Ce trimestre' },
  { key: 'year', label: 'Cette année' },
];

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const pad = (n) => String(n).padStart(2, '0');

/** Local `Date` → `YYYY-MM-DD`. */
export const toIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Same bounds as the API; also rejects the intermediate years (`0002`, `0202`)
// a native date input emits while the user types a year.
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * `YYYY-MM-DD` → local `Date`, or `null` if malformed, not a real calendar day
 * or outside the years 1900–2100.
 */
export const parseIsoDate = (value) => {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

/** True when both bounds are valid ISO dates and `dateFrom <= dateTo`. */
export const isValidPeriod = (period) =>
  Boolean(period)
  && parseIsoDate(period.dateFrom) !== null
  && parseIsoDate(period.dateTo) !== null
  && period.dateFrom <= period.dateTo;

/** The backend counts days in this zone, whatever the browser's zone. */
export const BUSINESS_TIME_ZONE = 'Africa/Casablanca';

/**
 * Business date of `now` as a local-midnight `Date`: its year/month/day are the
 * ones in `BUSINESS_TIME_ZONE`. Falls back to the browser's date if that zone
 * is unsupported.
 */
export const businessToday = (now = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type) => Number(parts.find((p) => p.type === type).value);
    return new Date(part('year'), part('month') - 1, part('day'));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
};

const range = (from, to) => ({ dateFrom: toIsoDate(from), dateTo: toIsoDate(to) });

/** Full calendar period containing `today` (the week runs Monday → Sunday). */
export const shortcutRange = (key, today) => {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (key) {
    case 'today':
      return range(new Date(y, m, d), new Date(y, m, d));
    case 'week': {
      const sinceMonday = (today.getDay() + 6) % 7;
      return range(new Date(y, m, d - sinceMonday), new Date(y, m, d - sinceMonday + 6));
    }
    case 'month':
      return range(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'quarter': {
      const first = Math.floor(m / 3) * 3;
      return range(new Date(y, first, 1), new Date(y, first + 3, 0));
    }
    case 'year':
      return range(new Date(y, 0, 1), new Date(y, 11, 31));
    default:
      throw new Error(`Unknown period shortcut: ${key}`);
  }
};

/** Key of the shortcut whose range equals `period` today, else `null`. */
export const matchingShortcut = (period, today) => {
  const found = PERIOD_SHORTCUTS.find(({ key }) => {
    const r = shortcutRange(key, today);
    return r.dateFrom === period.dateFrom && r.dateTo === period.dateTo;
  });
  return found ? found.key : null;
};

/** Period kept for the browser tab session, else the current month. */
export const loadPeriod = (today) => {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(PERIOD_STORAGE_KEY));
    if (isValidPeriod(stored)) return { dateFrom: stored.dateFrom, dateTo: stored.dateTo };
  } catch {
    // Storage unavailable (private mode, blocked site data) or bad JSON: use the default.
  }
  return shortcutRange('month', today);
};

export const savePeriod = (period) => {
  try {
    window.sessionStorage.setItem(
      PERIOD_STORAGE_KEY,
      JSON.stringify({ dateFrom: period.dateFrom, dateTo: period.dateTo }),
    );
  } catch {
    // Storage unavailable: the period only lives in memory.
  }
};

/** `YYYY-MM-DD` → `dd/mm/yyyy` (string-based, no time zone involved). */
export const formatIsoDate = (value) => {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

/** Notice shown instead of sales, CA and conversion before the status history starts. */
export const formatFlowUnavailableNotice = (historyStart) =>
  `Ventes, CA et conversion disponibles à partir du ${formatIsoDate(historyStart)}`;

export const formatPeriodLabel = (period) =>
  `Période : du ${formatIsoDate(period.dateFrom)} au ${formatIsoDate(period.dateTo)}`;

export const periodParams = (period) =>
  new URLSearchParams({ date_from: period.dateFrom, date_to: period.dateTo });

const percentFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** French percentage without unit: `12,5`, `1 234` (regular spaces). */
export const formatPercentNumber = (value) => percentFormat.format(value).replace(/[\u00a0\u202f]/g, ' ');

/** Variation vs the previous period: `▲ 12,5 %`, `▼ 3 %`, `= 0 %` or `—` when unknown. */
export const formatVariation = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return { text: '—', trend: null };
  }
  const n = Number(value);
  if (n === 0) return { text: '= 0 %', trend: 'flat' };
  return {
    text: `${n > 0 ? '▲' : '▼'} ${formatPercentNumber(Math.abs(n))} %`,
    trend: n > 0 ? 'up' : 'down',
  };
};

/** Chart label of a series bucket key: day `05/10`, ISO week `S41`, month `Oct 2026`. */
export const bucketLabel = (key) => {
  let match = ISO_DATE.exec(key);
  if (match) return `${match[3]}/${match[2]}`;
  match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (match) return `S${Number(match[2])}`;
  match = /^(\d{4})-(\d{2})$/.exec(key);
  if (match) return `${MONTH_NAMES[Number(match[2]) - 1] || match[2]} ${match[1]}`;
  return key;
};
