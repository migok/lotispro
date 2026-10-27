import { ACTIVE_LOT_STATUSES, STATUS_COLORS, STATUS_HEX_COLORS, STATUS_LABELS } from '../constants'
import { ALL_STATUSES, EDL_STATUSES } from '../lotWorkflow'

describe('status constants', () => {
  it.each(ALL_STATUSES)('%s has a label, a CSS colour and a hex colour', (status) => {
    expect(STATUS_LABELS[status]).toEqual(expect.any(String))
    expect(STATUS_COLORS[status]).toMatch(/^var\(--color-[a-z-]+\)$/)
    expect(STATUS_HEX_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('has no colour or label for an unknown status', () => {
    const known = new Set(ALL_STATUSES)
    for (const map of [STATUS_LABELS, STATUS_COLORS, STATUS_HEX_COLORS]) {
      expect(Object.keys(map).filter((s) => !known.has(s))).toEqual([])
    }
  })

  it('counts the EDL statuses as active', () => {
    expect(ACTIVE_LOT_STATUSES).toEqual(expect.arrayContaining(EDL_STATUSES))
  })
})
