/**
 * Lot object expected by `LotDetailModal`, built from a feature of
 * `GET /api/projects/{id}/lots.geojson` (map click and « Lots » tab).
 */
export function lotFromFeature(feature, projectId) {
  const props = feature?.properties || {};
  const lotId = props.lot_id ?? props.parcelid ?? 'N/A';
  const area = props.Shape_Area ? props.Shape_Area.toFixed(2) : null;
  const status = props.status ?? 'available';

  return {
    id: props.db_id || null,
    project_id: parseInt(projectId) || null,
    lot_id: String(lotId),
    numero: String(lotId),
    status: status,
    reserved_by_name: props.reserved_by ?? null,
    reserved_by_user_id: props.reserved_by_user_id ?? null,
    reserved_until: props.reserved_until ?? null,
    surface: area ? parseFloat(area) : null,
    price: props.price || null,
    price_per_sqm: props.price_per_sqm || null,
    price_per_sqm_acte: props.price_per_sqm_acte || null,
    zone: props.zone || null,
    client_id: props.client_id || null,
    client_name: props.client_name || null,
    client_phone: props.client_phone || null,
    reservation_id: props.reservation_id || null,
    reservation_date: props.reservation_date || null,
    expiration_date: props.expiration_date || null,
    deposit: props.deposit || 0,
    days_in_status: props.days_in_status || 0,
    sold_by_name: props.sold_by_name || null,
    sale_date: props.sale_date || null,
    type_lot: props.type_lot || null,
    emplacement: props.emplacement || null,
    type_maison: props.type_maison || null,
    deposit_paid_pct: props.deposit_paid_pct ?? null,
    balance_paid_pct: props.balance_paid_pct ?? null,
    first_deposit_days: props.first_deposit_days ?? null,
    edl_scheduled_at: props.edl_scheduled_at ?? null,
    edl_intervenant: props.edl_intervenant ?? null,
    edl_open_actions_count: props.edl_open_actions_count ?? null,
  };
}
