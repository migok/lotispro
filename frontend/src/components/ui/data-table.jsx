import { useMemo, useState } from 'react';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { LoadingSkeleton } from './skeleton';

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/** Display-only sorting and pagination; source rows are never mutated. A changed `resetKey` returns to page 1. */
export function DataTable({ columns, data = [], caption, pageSize = 10, loading = false, error, onRetry, getRowKey = (row) => row.id, resetKey }) {
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) { setSeenKey(resetKey); setPage(0); }
  const ordered = useMemo(() => {
    if (!sort) return data;
    return [...data].sort((a, b) => {
      const left = a[sort.key], right = b[sort.key];
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const compared = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
      return sort.direction === 'asc' ? compared : -compared;
    });
  }, [data, sort]);
  const size = Math.max(1, Math.floor(pageSize) || 10);
  const pages = Math.max(1, Math.ceil(ordered.length / size));
  const current = Math.min(page, pages - 1);
  if (loading) return <LoadingSkeleton label={`Chargement : ${caption}`} rows={size} />;
  if (error) return <div role="alert" className="ui-empty-state"><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Réessayer</Button>}</div>;
  if (!ordered.length) return <EmptyState title="Aucun résultat" />;
  const changeSort = (key) => { setSort({ key, direction: sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc' }); setPage(0); };
  return <div className="ui-data-table">
    <div className="ui-table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="ui-sr-only">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col" data-align={column.align}
          aria-sort={column.sortable ? sort?.key === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none' : undefined}>
          {column.sortable ? <button type="button" onClick={() => changeSort(column.key)}>{column.header}<span aria-hidden="true">{sort?.key === column.key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ' ↕'}</span></button> : column.header}
        </th>)}</tr></thead>
        <tbody>{ordered.slice(current * size, (current + 1) * size).map((row) => <tr key={getRowKey(row)}>
          {columns.map((column) => <td key={column.key} data-align={column.align}>{column.render ? column.render(row[column.key], row) : row[column.key] ?? '—'}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <nav className="ui-table-pagination" aria-label="Pagination">
      <span aria-live="polite">Page {current + 1} sur {pages} · {ordered.length} résultat{ordered.length > 1 ? 's' : ''}</span>
      <Button variant="ghost" size="sm" aria-label="Page précédente" disabled={current === 0} onClick={() => setPage(current - 1)}>Précédente</Button>
      <Button variant="ghost" size="sm" aria-label="Page suivante" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Suivante</Button>
    </nav>
  </div>;
}
