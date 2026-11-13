import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Printer, ScrollText, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, StatusBadge } from '@/components/common/feedback';
import { PageHeader, StatCard } from '@/components/common/layout';
import { DataTable, SearchInput, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { useConsole, useTableState } from '@/hooks';
import { busTypeLabel, formatCurrency, formatDateTime, formatDay, formatNumber, formatTime, istDate, istDateOf, titleCase } from '@/lib/utils';
import { adminApi, bookingApi, reportApi, tripApi } from '@/services';
import type { AuditEntry, BookingSummary, ManagedTrip, RouteSummaryRow } from '@/types';
import { occupancyBar } from './NetworkPages';

// ── Bookings ───────────────────────────────────────────────────────────────

export function StaffBookingsPage() {
  const { base, isAdmin } = useConsole();
  const navigate = useNavigate();
  const table = useTableState({ status: '' });
  const query = useQuery({
    queryKey: ['staff-bookings', table.page, table.search, table.filters.status],
    queryFn: () => bookingApi.list({ page: table.page, limit: 10, search: table.search, status: table.filters.status }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<BookingSummary>[] = [
    { key: 'pnr', header: 'PNR', cell: (b) => <span className="font-mono font-bold text-ink-900">{b.pnr}</span> },
    { key: 'passenger', header: 'Passenger', cell: (b) => (<div><p className="font-medium text-ink-900">{b.leadPassenger || b.bookedBy?.name}</p><p className="text-xs text-ink-500">{b.contactPhone}</p></div>) },
    { key: 'trip', header: 'Journey', hideOnMobile: true, cell: (b) => (<div><p className="text-ink-800">{b.route ? `${b.route.sourceCity} → ${b.route.destinationCity}` : '—'}</p><p className="text-xs text-ink-500">{formatDay(b.trip?.departureTime)} · {formatTime(b.trip?.departureTime)}</p></div>) },
    ...(isAdmin ? [{ key: 'operator', header: 'Operator', hideOnMobile: true, cell: (b: BookingSummary) => b.operator?.name ?? '—' }] : []),
    { key: 'seats', header: 'Seats', hideOnMobile: true, cell: (b) => <span className="tabular">{b.seats.join(', ')}</span> },
    { key: 'total', header: 'Amount', align: 'right', cell: (b) => <span className="tabular font-semibold">{formatCurrency(b.total)}</span> },
    { key: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
    { key: 'booked', header: 'Booked', hideOnMobile: true, cell: (b) => <span className="text-xs">{formatDateTime(b.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader title="Bookings" description={isAdmin ? 'Every booking across the network.' : 'Bookings on your trips.'} />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(b) => b._id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        meta={query.data?.meta}
        onPageChange={table.setPage}
        onRowClick={(b) => navigate(`${base}/bookings/${b._id}`)}
        emptyIcon={Ticket}
        emptyTitle="No bookings found"
        toolbar={
          <>
            <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search PNR, email or phone" />
            <Select value={table.filters.status} onChange={(e) => table.setFilter('status', e.target.value)} aria-label="Filter by status" className="w-40">
              <option value="">All bookings</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </>
        }
      />
    </>
  );
}

// ── Passenger manifests ────────────────────────────────────────────────────

export function ManifestsPage() {
  const [params, setParams] = useSearchParams();
  const tripId = params.get('trip') ?? '';
  const [date, setDate] = useState(istDate());
  const trips = useQuery({ queryKey: ['trips', 'manifest-picker', date], queryFn: () => tripApi.list({ from: date, to: date, limit: 100 }) });
  const manifest = useQuery({ queryKey: ['manifest', tripId], queryFn: () => tripApi.manifest(tripId), enabled: !!tripId });
  const m = manifest.data;
  // Opening a manifest from a link: show that trip's date in the picker.
  useEffect(() => {
    if (m) setDate(istDateOf(m.trip.departureTime));
  }, [m]);

  return (
    <>
      <div className="no-print">
        <PageHeader title="Passenger manifests" description="Who is boarding, where, and in which seat." actions={m && <Button variant="outline" onClick={() => window.print()}><Printer /> Print manifest</Button>} />
        <Card className="mb-6">
          <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Field label="Departure date" htmlFor="m-date">
              <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Trip" htmlFor="m-trip">
              <Select id="m-trip" value={tripId} onChange={(e) => setParams(e.target.value ? { trip: e.target.value } : {})}>
                <option value="">{trips.isLoading ? 'Loading trips…' : trips.data?.items.length ? 'Select a trip' : 'No trips on this date'}</option>
                {trips.data?.items.map((t) => (
                  <option key={t._id} value={t._id}>
                    {formatTime(t.departureTime)} · {t.route.sourceCity} → {t.route.destinationCity} · {t.bus.name} ({t.bookedSeats}/{t.totalSeats})
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>

      {!tripId ? (
        <Card>
          <EmptyState icon={ClipboardList} title="Choose a trip" description="Pick a date and a trip to see its passenger manifest." />
        </Card>
      ) : manifest.isLoading ? (
        <Skeleton className="h-96 rounded-card" />
      ) : manifest.error || !m ? (
        <Card><ErrorState error={manifest.error} onRetry={() => manifest.refetch()} /></Card>
      ) : (
        <div className="print-area space-y-6">
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-semibold text-ink-500">{m.trip.route.code}</p>
                <h2 className="text-xl font-bold">{m.trip.route.sourceCity} → {m.trip.route.destinationCity}</h2>
                <p className="text-sm text-ink-600">
                  {formatDay(m.trip.departureTime)} · {formatTime(m.trip.departureTime)} – {formatTime(m.trip.arrivalTime)} · {m.trip.operator.name}
                </p>
                <p className="text-xs text-ink-500">{m.trip.bus.name} · {m.trip.bus.registrationNumber} · {busTypeLabel(m.trip.bus.busType, m.trip.bus.isAC)}</p>
              </div>
              <StatusBadge status={m.trip.status} />
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Passengers" value={m.summary.bookedSeats} icon={ClipboardList} />
            <StatCard label="Bookings" value={m.summary.bookings} icon={Ticket} tone="info" />
            <StatCard label="Seats free" value={m.summary.availableSeats} icon={ClipboardList} tone="neutral" />
            <StatCard label="Occupancy" value={`${m.summary.occupancyPercent}%`} icon={ClipboardList} tone="accent" hint={`${m.summary.bookedSeats} of ${m.summary.totalSeats} seats`} />
          </div>
          <DataTable
            columns={[
              { key: 'seat', header: 'Seat', cell: (p) => <span className="tabular font-bold text-ink-900">{p.seatNumber}</span> },
              { key: 'name', header: 'Passenger', cell: (p) => <span className="font-medium text-ink-900">{p.name}</span> },
              { key: 'age', header: 'Age / Gender', cell: (p) => `${p.age} · ${titleCase(p.gender)}` },
              { key: 'pnr', header: 'PNR', cell: (p) => <span className="font-mono text-xs font-semibold">{p.pnr}</span> },
              { key: 'phone', header: 'Contact', hideOnMobile: true, cell: (p) => p.contactPhone },
              { key: 'board', header: 'Boarding', hideOnMobile: true, cell: (p) => p.boardingPoint },
              { key: 'drop', header: 'Dropping', hideOnMobile: true, cell: (p) => p.droppingPoint },
            ]}
            rows={m.passengers}
            rowKey={(p) => `${p.pnr}-${p.seatNumber}`}
            emptyIcon={ClipboardList}
            emptyTitle="No passengers booked yet"
          />
        </div>
      )}
    </>
  );
}

// ── Reports ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { isAdmin } = useConsole();
  const [from, setFrom] = useState(istDate(-30));
  const [to, setTo] = useState(istDate(14));
  const [page, setPage] = useState(1);
  const summary = useQuery({ queryKey: ['report-bookings', from, to], queryFn: () => reportApi.bookings({ from, to }) });
  const occupancy = useQuery({ queryKey: ['report-occupancy', from, to, page], queryFn: () => reportApi.occupancy({ from, to, page, limit: 10 }), placeholderData: keepPreviousData });
  const t = summary.data?.totals;
  const occ = occupancy.data?.meta.summary as { capacity: number; sold: number; percent: number } | undefined;

  const routeColumns: Column<RouteSummaryRow>[] = [
    { key: 'route', header: 'Route', cell: (r) => (<div><p className="font-semibold text-ink-900">{r.route}</p><p className="font-mono text-xs text-ink-500">{r.code}</p></div>) },
    ...(isAdmin ? [{ key: 'op', header: 'Operator', hideOnMobile: true, cell: (r: RouteSummaryRow) => r.operator }] : []),
    { key: 'bookings', header: 'Bookings', align: 'right', cell: (r) => <span className="tabular">{r.bookings}</span> },
    { key: 'cancelled', header: 'Cancelled', align: 'right', hideOnMobile: true, cell: (r) => <span className="tabular">{r.cancelled}</span> },
    { key: 'seats', header: 'Seats sold', align: 'right', cell: (r) => <span className="tabular">{r.seats}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right', cell: (r) => <span className="tabular font-semibold">{formatCurrency(r.revenue)}</span> },
  ];
  const occColumns: Column<ManagedTrip>[] = [
    { key: 'when', header: 'Departure', cell: (x) => (<div><p className="font-medium text-ink-900">{formatDay(x.departureTime)}</p><p className="tabular text-xs text-ink-500">{formatTime(x.departureTime)}</p></div>) },
    { key: 'route', header: 'Route', cell: (x) => `${x.route.sourceCity} → ${x.route.destinationCity}` },
    { key: 'bus', header: 'Bus', hideOnMobile: true, cell: (x) => x.bus.name },
    { key: 'status', header: 'Status', hideOnMobile: true, cell: (x) => <StatusBadge status={x.status} /> },
    { key: 'occ', header: 'Seats', cell: occupancyBar },
    { key: 'pct', header: 'Occupancy', align: 'right', cell: (x) => <span className="tabular font-semibold">{x.occupancyPercent}%</span> },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Booking summaries and seat occupancy for the selected period."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-600">From <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></label>
            <label className="flex items-center gap-2 text-sm text-ink-600">To <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></label>
          </div>
        }
      />
      {summary.error ? (
        <Card><ErrorState error={summary.error} onRetry={() => summary.refetch()} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Bookings made" value={formatNumber(t?.totalBookings)} icon={Ticket} loading={summary.isLoading} hint={`${formatNumber(t?.confirmedBookings)} confirmed · ${formatNumber(t?.cancelledBookings)} cancelled`} />
          <StatCard label="Revenue" value={formatCurrency(t?.revenue)} icon={Ticket} tone="info" loading={summary.isLoading} hint={`incl. ${formatCurrency(t?.cancellationFees)} cancellation fees`} />
          <StatCard label="Refunds issued" value={formatCurrency(t?.refundsIssued)} icon={Ticket} tone="danger" loading={summary.isLoading} />
          <StatCard label="Seat occupancy" value={`${occ?.percent ?? 0}%`} icon={ClipboardList} tone="accent" loading={occupancy.isLoading} hint={`${formatNumber(occ?.sold)} of ${formatNumber(occ?.capacity)} seats (trips departing in period)`} />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Route-wise booking summary</CardTitle>
            <CardDescription>Bookings made in the selected period, grouped by route</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <DataTable columns={routeColumns} rows={summary.data?.routes} rowKey={(r) => r.routeId} loading={summary.isLoading} emptyTitle="No bookings in this period" />
        </CardContent>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Occupancy by trip</h2>
        <DataTable columns={occColumns} rows={occupancy.data?.items} rowKey={(x) => x._id} loading={occupancy.isLoading} error={occupancy.error} onRetry={() => occupancy.refetch()} meta={occupancy.data?.meta} onPageChange={setPage} emptyTitle="No trips in this period" />
      </div>
    </>
  );
}

// ── Audit log ──────────────────────────────────────────────────────────────

const ENTITY_TYPES = ['Booking', 'Trip', 'Bus', 'Seat', 'Route', 'Stop', 'Operator', 'User'];

export function AuditPage() {
  const table = useTableState({ entityType: '' });
  const query = useQuery({
    queryKey: ['audit', table.page, table.search, table.filters.entityType],
    queryFn: () => adminApi.audit({ page: table.page, limit: 15, search: table.search, entityType: table.filters.entityType }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'Time', cell: (a) => <span className="tabular text-xs">{formatDateTime(a.createdAt)}</span> },
    { key: 'action', header: 'Action', cell: (a) => <span className="font-mono text-xs font-semibold text-ink-900">{a.action}</span> },
    { key: 'actor', header: 'Actor', cell: (a) => (a.actorId ? (<div><p className="text-ink-900">{a.actorId.name}</p><p className="text-xs text-ink-500">{titleCase(a.actorRole ?? '')}</p></div>) : <span className="text-ink-400">System</span>) },
    { key: 'entity', header: 'Entity', hideOnMobile: true, cell: (a) => (<div><p>{a.entityType}</p><p className="font-mono text-[11px] text-ink-400">{a.entityId}</p></div>) },
    { key: 'meta', header: 'Details', hideOnMobile: true, className: 'max-w-72', cell: (a) => <code className="line-clamp-2 break-all text-[11px] text-ink-500">{a.metadata ? JSON.stringify(a.metadata) : '—'}</code> },
  ];
  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of logins, bookings, cancellations and configuration changes." />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(a) => a._id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        meta={query.data?.meta}
        onPageChange={table.setPage}
        emptyIcon={ScrollText}
        emptyTitle="No audit entries"
        toolbar={
          <>
            <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search action, e.g. BOOKING" />
            <Select value={table.filters.entityType} onChange={(e) => table.setFilter('entityType', e.target.value)} aria-label="Filter by entity" className="w-40">
              <option value="">All entities</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </>
        }
      />
    </>
  );
}
