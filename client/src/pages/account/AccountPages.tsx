import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CheckCircle2, History, Printer, Search, Ticket as TicketIcon, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, StatusBadge } from '@/components/common/feedback';
import { PageHeader, StatCard } from '@/components/common/layout';
import { DataTable, Pagination, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/AuthContext';
import { Ticket } from '@/features/bookings/Ticket';
import { CancelBookingDialog } from '@/features/cancellations/CancelBookingDialog';
import { formatCurrency, formatDateTime, formatDay, formatTime } from '@/lib/utils';
import { bookingApi } from '@/services';
import type { BookingSummary, Cancellation } from '@/types';

function BookingRow({ booking, to }: { booking: BookingSummary; to: string }) {
  return (
    <Link to={to} className="group flex flex-wrap items-center justify-between gap-4 rounded-card border border-ink-100 bg-white p-4 shadow-card transition-all hover:border-brand-200 hover:shadow-raised sm:p-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="tabular flex w-14 shrink-0 flex-col items-center rounded-xl bg-ink-50 py-2 text-center">
          <span className="text-[11px] font-semibold uppercase text-ink-500">{formatDay(booking.trip?.departureTime).split(',')[0]}</span>
          <span className="text-lg font-extrabold leading-tight text-ink-950">{formatDay(booking.trip?.departureTime).split(' ')[1]}</span>
          <span className="text-[11px] font-semibold uppercase text-ink-500">{formatDay(booking.trip?.departureTime).split(' ')[2]}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold text-ink-950">
            {booking.route?.sourceCity} <span className="text-ink-300">→</span> {booking.route?.destinationCity}
          </p>
          <p className="mt-0.5 text-sm text-ink-600">
            {formatTime(booking.trip?.departureTime)} · {booking.operator?.name}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            <span className="font-mono font-bold text-ink-700">{booking.pnr}</span> · Seats {booking.seats.join(', ')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="tabular font-bold text-ink-950">{formatCurrency(booking.total)}</p>
          <StatusBadge status={booking.status} className="mt-1" />
        </div>
        <ArrowRight className="size-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" aria-hidden />
      </div>
    </Link>
  );
}

export function AccountOverviewPage() {
  const { user } = useAuth();
  const upcoming = useQuery({ queryKey: ['my-bookings', 'upcoming-overview'], queryFn: () => bookingApi.mine({ when: 'upcoming', status: 'CONFIRMED', limit: 3 }) });
  const all = useQuery({ queryKey: ['my-bookings', 'count-all'], queryFn: () => bookingApi.mine({ limit: 1 }) });
  const cancelled = useQuery({ queryKey: ['my-bookings', 'count-cancelled'], queryFn: () => bookingApi.mine({ status: 'CANCELLED', limit: 1 }) });

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0]}`}
        description="Here's what's coming up on your travel calendar."
        actions={
          <Button asChild>
            <Link to="/">
              <Search /> Book a trip
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming trips" value={upcoming.data?.meta.total ?? 0} icon={CalendarClock} loading={upcoming.isLoading} />
        <StatCard label="Total bookings" value={all.data?.meta.total ?? 0} icon={TicketIcon} tone="info" loading={all.isLoading} />
        <StatCard label="Cancelled" value={cancelled.data?.meta.total ?? 0} icon={XCircle} tone="neutral" loading={cancelled.isLoading} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold">Upcoming trips</h2>
        <Button variant="link" asChild>
          <Link to="/account/bookings">View all bookings</Link>
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        {upcoming.isLoading ? (
          Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-24 rounded-card" />)
        ) : upcoming.error ? (
          <Card>
            <ErrorState error={upcoming.error} onRetry={() => upcoming.refetch()} />
          </Card>
        ) : upcoming.data?.items.length ? (
          upcoming.data.items.map((b) => <BookingRow key={b._id} booking={b} to={`/account/bookings/${b._id}`} />)
        ) : (
          <Card>
            <EmptyState icon={CalendarClock} title="No upcoming trips" description="When you book a bus, your ticket will show up here." action={<Button asChild><Link to="/">Search buses</Link></Button>} />
          </Card>
        )}
      </div>
    </>
  );
}

export function MyBookingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'upcoming';
  const page = Number(params.get('page') ?? '1') || 1;
  const filter = tab === 'upcoming' ? { when: 'upcoming', status: 'CONFIRMED' } : tab === 'past' ? { when: 'past', status: 'CONFIRMED' } : tab === 'cancelled' ? { status: 'CANCELLED' } : {};
  const query = useQuery({ queryKey: ['my-bookings', tab, page], queryFn: () => bookingApi.mine({ ...filter, page, limit: 6 }), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="My bookings" description="Every ticket you've booked, with its current status." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-5 space-y-3">
        {query.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-card" />)
        ) : query.error ? (
          <Card>
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </Card>
        ) : query.data?.items.length ? (
          <>
            {query.data.items.map((b) => (
              <BookingRow key={b._id} booking={b} to={`/account/bookings/${b._id}`} />
            ))}
            {query.data.meta.totalPages > 1 && (
              <Card>
                <Pagination meta={query.data.meta} onPageChange={(p) => setParams({ tab, page: String(p) })} className="border-t-0" />
              </Card>
            )}
          </>
        ) : (
          <Card>
            <EmptyState icon={TicketIcon} title={`No ${tab === 'all' ? '' : tab === 'past' ? 'completed ' : `${tab} `}bookings`} description="Bookings you make will be listed here." action={<Button asChild><Link to="/">Search buses</Link></Button>} />
          </Card>
        )}
      </div>
    </>
  );
}

/** Ticket view. Shared by passengers (own bookings) and staff (read-only, or admin cancel). */
export function BookingDetailsPage({ backTo }: { backTo: string }) {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [cancelOpen, setCancelOpen] = useState(false);
  const query = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.get(id) });

  if (query.isLoading) return <Skeleton className="h-[36rem] rounded-panel" />;
  if (query.error || !query.data) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Card>
    );
  }
  const booking = query.data;
  const canCancel = booking.status === 'CONFIRMED' && booking.trip?.status === 'SCHEDULED' && user?.role !== 'OPERATOR';

  return (
    <>
      <div className="no-print">
        {params.get('confirmed') && (
          <div className="mb-5 flex items-center gap-3 rounded-card border border-green-200 bg-green-50 p-4 text-green-900" role="status">
            <CheckCircle2 className="size-6 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Booking confirmed — have a great trip!</p>
              <p className="text-sm">Your seats are reserved. Keep this ticket handy when you board.</p>
            </div>
          </div>
        )}
        <PageHeader
          title="Your ticket"
          description={`PNR ${booking.pnr}`}
          actions={
            <>
              <Button variant="outline" onClick={() => navigate(backTo)}>
                All bookings
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer /> Print ticket
              </Button>
              {canCancel && (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  Cancel booking
                </Button>
              )}
            </>
          }
        />
      </div>
      <Ticket booking={booking} />
      {canCancel && <CancelBookingDialog bookingId={booking._id} pnr={booking.pnr} open={cancelOpen} onOpenChange={setCancelOpen} />}
    </>
  );
}

/** Cancellations and simulated refunds — the API scopes rows to the signed-in role. */
export function CancellationsPage({ title = 'Cancellation history', description = 'Bookings you cancelled and what was refunded.' }: { title?: string; description?: string }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['cancellations', page], queryFn: () => bookingApi.cancellations({ page, limit: 10 }), placeholderData: keepPreviousData });
  const staff = user?.role !== 'PASSENGER';

  const columns: Column<Cancellation>[] = [
    { key: 'pnr', header: 'PNR', cell: (c) => <span className="font-mono font-bold text-ink-900">{c.booking?.pnr ?? '—'}</span> },
    { key: 'route', header: 'Route', cell: (c) => (c.booking?.routeId ? `${c.booking.routeId.sourceCity} → ${c.booking.routeId.destinationCity}` : '—') },
    ...(staff ? [{ key: 'operator', header: 'Operator', hideOnMobile: true, cell: (c: Cancellation) => c.operator?.name ?? '—' }] : []),
    { key: 'when', header: 'Cancelled on', hideOnMobile: true, cell: (c) => formatDateTime(c.cancelledAt) },
    { key: 'reason', header: 'Reason', hideOnMobile: true, className: 'max-w-56 truncate', cell: (c) => <span title={c.reason}>{c.reason}</span> },
    { key: 'paid', header: 'Paid', align: 'right', hideOnMobile: true, cell: (c) => <span className="tabular">{formatCurrency(c.booking?.fare.total)}</span> },
    { key: 'fee', header: 'Fee', align: 'right', hideOnMobile: true, cell: (c) => <span className="tabular">{formatCurrency(c.cancellationFee)}</span> },
    {
      key: 'refund',
      header: 'Refund',
      align: 'right',
      cell: (c) => (
        <span className="tabular font-semibold text-ink-900">
          {formatCurrency(c.refundAmount)} <span className="font-normal text-ink-400">({c.refundPercent}%)</span>
        </span>
      ),
    },
    { key: 'status', header: 'Refund status', cell: (c) => <StatusBadge status={c.refundStatus} /> },
  ];

  return (
    <>
      <PageHeader title={title} description={description} />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(c) => c._id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        meta={query.data?.meta}
        onPageChange={setPage}
        emptyIcon={History}
        emptyTitle="No cancellations"
        emptyDescription="Cancelled bookings and their refunds will appear here."
      />
    </>
  );
}
