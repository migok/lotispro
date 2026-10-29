import { lotFromFeature } from '../lotFromFeature'

const FEATURE = {
  type: 'Feature',
  geometry: null,
  properties: {
    db_id: 42,
    lot_id: 'LOT-7',
    parcelid: 'P-7',
    status: 'edl_programme',
    Shape_Area: 123.456,
    price: 450000,
    price_per_sqm: 3645,
    price_per_sqm_acte: 3000,
    zone: 'A',
    type_lot: 'Villa',
    emplacement: 'Angle',
    type_maison: 'R+1',
    client_id: 9,
    client_name: 'Samira B.',
    client_phone: '+212600000000',
    reservation_id: 11,
    reservation_date: '2026-10-01',
    expiration_date: '2026-10-08',
    deposit: 20000,
    days_in_status: 3,
    reserved_by: 'Karim',
    reserved_by_user_id: 5,
    reserved_until: '2026-10-08',
    sold_by_name: null,
    sale_date: null,
    deposit_paid_pct: 10,
    balance_paid_pct: 0,
    first_deposit_days: 2,
    edl_scheduled_at: '2026-11-02T10:00:00',
    edl_intervenant: 'Bureau Veritas',
    edl_open_actions_count: 2,
  },
}

describe('lotFromFeature', () => {
  it('builds the lot the detail modal expects from a full feature', () => {
    const lot = lotFromFeature(FEATURE, '7')

    expect(lot).toMatchObject({
      id: 42,
      project_id: 7,
      lot_id: 'LOT-7',
      numero: 'LOT-7',
      status: 'edl_programme',
      surface: 123.46,
      price: 450000,
      type_lot: 'Villa',
      emplacement: 'Angle',
      type_maison: 'R+1',
      client_id: 9,
      client_name: 'Samira B.',
      reservation_id: 11,
      reserved_by_name: 'Karim',
      reserved_by_user_id: 5,
      deposit: 20000,
      edl_scheduled_at: '2026-11-02T10:00:00',
      edl_intervenant: 'Bureau Veritas',
      edl_open_actions_count: 2,
    })
  })

  it('falls back to parcelid, available status and empty values', () => {
    const lot = lotFromFeature({ properties: { db_id: 3, parcelid: 12 } }, 7)

    expect(lot.numero).toBe('12')
    expect(lot.status).toBe('available')
    expect(lot.surface).toBeNull()
    expect(lot.type_lot).toBeNull()
    expect(lot.deposit).toBe(0)
    expect(lot.edl_open_actions_count).toBeNull()
  })
})
