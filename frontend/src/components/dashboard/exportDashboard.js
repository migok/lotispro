import { apiFetch, buildApiError } from '../../utils/api';
import { periodParams } from './period';

/** File name of a `Content-Disposition` header, or `null`. */
const filenameFromDisposition = (header) => {
  const match = /filename="?([^";]+)"?/i.exec(header || '');
  return match ? match[1].trim() : null;
};

/**
 * Downloads the Excel export of the period dashboard (`/api/dashboard/export`)
 * for a project, an optional commercial and a period (E6-T3).
 * Throws the API error (message from the response) when the export is refused.
 */
export async function exportDashboard({ projectId, userId, period }) {
  const params = periodParams(period);
  params.append('project_id', projectId);
  if (userId) params.append('user_id', userId);

  const response = await apiFetch(`/api/dashboard/export?${params.toString()}`);
  if (!response.ok) {
    throw buildApiError(await response.json().catch(() => ({})), response.status);
  }
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition'))
    || `dashboard_${period.dateFrom}_${period.dateTo}.xlsx`;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
