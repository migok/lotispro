/**
 * Lot workflow — mirror of backend/app/domain/lot_workflow.py.
 *
 * The backend test `test_export_snapshot` writes
 * `__tests__/lotWorkflow.snapshot.json` from the backend table and
 * `__tests__/lotWorkflow.test.js` compares this mirror to it, so a change on
 * one side without the other fails CI.
 */

// Pipeline order, `blocked` last.
export const ALL_STATUSES = [
  'creation',
  'available',
  'option',
  'reservation_a_finaliser',
  'reservation_engagee',
  'reservation_soldee',
  'edl_programme',
  'edl_realise',
  'edl_finalise',
  'chez_notaire',
  'chez_proprietaire',
  'blocked',
];

// Keys a project can enable; "edl" covers the three EDL statuses.
export const OPTIONAL_KEYS = ['option', 'reservation_a_finaliser', 'edl'];
export const EDL_STATUSES = ['edl_programme', 'edl_realise', 'edl_finalise'];
export const DEFAULT_ENABLED_OPTIONAL = ['option', 'reservation_a_finaliser'];

const t = (from, to, { requiresEnabled = null, requiresDisabled = null } = {}) => ({
  from,
  to,
  requiresEnabled,
  requiresDisabled,
});

// `to: null` = status unchanged. Same order as the backend table.
export const TRANSITIONS = {
  activate: t(['creation'], 'available'),
  start_option: t(['available'], 'option', { requiresEnabled: 'option' }),
  cancel_option: t(['option'], 'available'),
  extend_option: t(['option', 'reservation_a_finaliser'], null),
  direct_reservation: t(['available'], 'reservation_a_finaliser', { requiresEnabled: 'reservation_a_finaliser' }),
  to_reservation: t(['option'], 'reservation_a_finaliser', { requiresEnabled: 'reservation_a_finaliser' }),
  refund: t(['reservation_a_finaliser'], 'available'),
  direct_engage: t(['available'], 'reservation_engagee'),
  engage: t(['reservation_a_finaliser'], 'reservation_engagee'),
  option_engage: t(['option'], 'reservation_engagee', { requiresDisabled: 'reservation_a_finaliser' }),
  solde: t(['reservation_engagee'], 'reservation_soldee'),
  set_notaire_intent: t(['reservation_soldee', ...EDL_STATUSES], null),
  edl_schedule: t(['reservation_soldee'], 'edl_programme', { requiresEnabled: 'edl' }),
  edl_reschedule: t(['edl_programme'], null),
  edl_done: t(['edl_programme'], 'edl_realise'),
  edl_finalize: t(['edl_realise'], 'edl_finalise'),
  // Conditions depend on the departure status: see notairePathAllowed.
  notaire: t(['reservation_soldee', 'edl_finalise'], 'chez_notaire'),
  notaire_update: t(['chez_notaire'], null),
  proprietaire: t(['chez_notaire'], 'chez_proprietaire'),
  block: t(ALL_STATUSES.filter((s) => s !== 'blocked' && s !== 'chez_proprietaire'), 'blocked'),
  unblock: t(['blocked'], 'available'),
  direct_update: t(['creation', 'available', 'blocked'], null),
};

/** `notaire`: from soldée without EDL, from edl_finalise with EDL. */
function notairePathAllowed(enabled, fromStatus) {
  const edlEnabled = enabled.has('edl');
  if (fromStatus === 'reservation_soldee') return !edlEnabled;
  if (fromStatus === 'edl_finalise') return edlEnabled;
  return true;
}

function optionalKey(status) {
  if (EDL_STATUSES.includes(status)) return 'edl';
  if (status === 'option' || status === 'reservation_a_finaliser') return status;
  return null;
}

/**
 * Names of the transitions allowed from `status` for a project with these
 * optional statuses (same checks as the backend `assert_transition_allowed`).
 */
export function allowedTransitions(status, enabledOptional = DEFAULT_ENABLED_OPTIONAL) {
  const enabled = new Set(enabledOptional);
  return Object.entries(TRANSITIONS)
    .filter(([name, rule]) => {
      if (!rule.from.includes(status)) return false;
      if (rule.requiresEnabled && !enabled.has(rule.requiresEnabled)) return false;
      if (rule.requiresDisabled && enabled.has(rule.requiresDisabled)) return false;
      if (name === 'notaire') return notairePathAllowed(enabled, status);
      return true;
    })
    .map(([name]) => name);
}

/** Statuses usable by the project, in pipeline order. */
export function enabledStatuses(enabledOptional = DEFAULT_ENABLED_OPTIONAL) {
  const enabled = new Set(enabledOptional);
  return ALL_STATUSES.filter((status) => {
    const key = optionalKey(status);
    return key === null || enabled.has(key);
  });
}

/** « 1 action ouverte » / « 3 actions ouvertes ». */
export function openEdlActionsLabel(count) {
  return `${count} action${count > 1 ? 's' : ''} ouverte${count > 1 ? 's' : ''}`;
}
