import snapshot from './lotWorkflow.snapshot.json'
import {
  ALL_STATUSES,
  DEFAULT_ENABLED_OPTIONAL,
  EDL_STATUSES,
  OPTIONAL_KEYS,
  TRANSITIONS,
  allowedTransitions,
  enabledStatuses,
} from '../lotWorkflow'

// The snapshot is written by the backend test
// app/tests/unit/test_domain/test_lot_workflow.py::test_export_snapshot.
describe('lotWorkflow mirrors the backend table', () => {
  it('has the same status groups', () => {
    expect(ALL_STATUSES).toEqual(snapshot.all_statuses)
    expect(OPTIONAL_KEYS).toEqual(snapshot.optional_keys)
    expect(EDL_STATUSES).toEqual(snapshot.edl_statuses)
    expect(DEFAULT_ENABLED_OPTIONAL).toEqual(snapshot.default_enabled_optional)
  })

  it('has the same transitions', () => {
    const mirrored = Object.fromEntries(
      Object.entries(TRANSITIONS).map(([name, t]) => [
        name,
        {
          from_statuses: [...t.from].sort(),
          to_status: t.to,
          requires_enabled: t.requiresEnabled,
          requires_disabled: t.requiresDisabled,
        },
      ])
    )
    expect(mirrored).toEqual(snapshot.transitions)
    expect(Object.keys(TRANSITIONS)).toEqual(Object.keys(snapshot.transitions))
  })
})

const DEFAULT = ['option', 'reservation_a_finaliser']
const WITHOUT_OPTION = ['reservation_a_finaliser']
const EDL_WITHOUT_RAF = ['option', 'edl']

const COMMON = {
  creation: ['activate', 'block', 'direct_update'],
  reservation_a_finaliser: ['extend_option', 'refund', 'engage', 'block'],
  reservation_engagee: ['solde', 'block'],
  edl_programme: ['set_notaire_intent', 'edl_reschedule', 'edl_done', 'block'],
  edl_realise: ['set_notaire_intent', 'edl_finalize', 'block'],
  chez_notaire: ['notaire_update', 'proprietaire', 'block'],
  chez_proprietaire: [],
  blocked: ['unblock', 'direct_update'],
}

const EXPECTED = {
  default: {
    ...COMMON,
    available: ['start_option', 'direct_reservation', 'direct_engage', 'block', 'direct_update'],
    option: ['cancel_option', 'extend_option', 'to_reservation', 'block'],
    reservation_soldee: ['set_notaire_intent', 'notaire', 'block'],
    edl_finalise: ['set_notaire_intent', 'block'],
  },
  withoutOption: {
    ...COMMON,
    available: ['direct_reservation', 'direct_engage', 'block', 'direct_update'],
    option: ['cancel_option', 'extend_option', 'to_reservation', 'block'],
    reservation_soldee: ['set_notaire_intent', 'notaire', 'block'],
    edl_finalise: ['set_notaire_intent', 'block'],
  },
  edlWithoutRaf: {
    ...COMMON,
    available: ['start_option', 'direct_engage', 'block', 'direct_update'],
    option: ['cancel_option', 'extend_option', 'option_engage', 'block'],
    reservation_soldee: ['set_notaire_intent', 'edl_schedule', 'block'],
    edl_finalise: ['set_notaire_intent', 'notaire', 'block'],
  },
}

describe('allowedTransitions', () => {
  it.each(ALL_STATUSES)('default settings — %s', (status) => {
    expect(allowedTransitions(status, DEFAULT)).toEqual(EXPECTED.default[status])
  })

  it.each(ALL_STATUSES)('without option — %s', (status) => {
    expect(allowedTransitions(status, WITHOUT_OPTION)).toEqual(EXPECTED.withoutOption[status])
  })

  it.each(ALL_STATUSES)('EDL enabled, without réservation à finaliser — %s', (status) => {
    expect(allowedTransitions(status, EDL_WITHOUT_RAF)).toEqual(EXPECTED.edlWithoutRaf[status])
  })

  it('uses the default settings when none are given', () => {
    expect(allowedTransitions('option')).toEqual(EXPECTED.default.option)
  })

  it('returns nothing for an unknown status', () => {
    expect(allowedTransitions('sold', DEFAULT)).toEqual([])
  })
})

describe('enabledStatuses', () => {
  it('drops disabled optional statuses and keeps pipeline order', () => {
    expect(enabledStatuses(DEFAULT)).toEqual([
      'creation', 'available', 'option', 'reservation_a_finaliser', 'reservation_engagee',
      'reservation_soldee', 'chez_notaire', 'chez_proprietaire', 'blocked',
    ])
    expect(enabledStatuses(EDL_WITHOUT_RAF)).toEqual([
      'creation', 'available', 'option', 'reservation_engagee', 'reservation_soldee',
      'edl_programme', 'edl_realise', 'edl_finalise', 'chez_notaire', 'chez_proprietaire', 'blocked',
    ])
  })

  it('uses the default settings when none are given', () => {
    expect(enabledStatuses()).toEqual(enabledStatuses(DEFAULT))
  })
})
