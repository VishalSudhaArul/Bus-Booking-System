import { ChevronLeft, ChevronRight, Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { EmptyState, ErrorState } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import type { PageMeta } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens to keep the table readable on a phone. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
}

/** Table with built-in loading skeleton, empty state, error state and pagination. */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, meta, onPageChange, toolbar, emptyTitle = 'Nothing here yet', emptyDescription, emptyIcon, emptyAction, onRowClick }: DataTableProps<T>) {
  const hidden = (c: Column<T>) => (c.hideOnMobile ? 'hidden md:table-cell' : '');
  return (
    <Card className="overflow-hidden">
      {toolbar && <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">{toolbar}</div>}
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : !loading && rows && rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} action={emptyAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500', c.align === 'right' && 'text-right', hidden(c))}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading || !rows
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c.key} className={cn('px-4 py-3.5', hidden(c))}>
                          <Skeleton className="h-4 w-full max-w-32" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className={cn('transition-colors hover:bg-ink-50/70', onRowClick && 'cursor-pointer')}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={cn('px-4 py-3.5 align-middle text-ink-700', c.align === 'right' && 'text-right', hidden(c), c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && onPageChange && meta.total > 0 && <Pagination meta={meta} onPageChange={onPageChange} />}
    </Card>
  );
}

export function Pagination({ meta, onPageChange, className }: { meta: PageMeta; onPageChange: (page: number) => void; className?: string }) {
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3', className)} aria-label="Pagination">
      <p className="tabular text-xs text-ink-500">
        Showing <span className="font-semibold text-ink-800">{from}</span>–<span className="font-semibold text-ink-800">{to}</span> of{' '}
        <span className="font-semibold text-ink-800">{meta.total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          <ChevronLeft /> Previous
        </Button>
        <span className="tabular text-xs font-medium text-ink-600">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

/** Debounced search box for table toolbars. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 350);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className="pl-9 pr-9" aria-label={placeholder} />
      {draft && (
        <button type="button" onClick={() => setDraft('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Clear search">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
