import { useQuery } from '@tanstack/react-query';
import { Armchair, BarChart3, Bus, CalendarClock, CheckCircle2, IndianRupee, Plus, Ticket, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, StatusBadge } from '@/components/common/feedback';
import { PageHeader, StatCard } from '@/components/common/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { useConsole } from '@/hooks';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { reportApi } from '@/services';

const BRAND = '#15705f';
const ACCENT = '#f2a93b';
const DANGER = '#dc2626';
const axis = { fontSize: 11, fill: '#667284' };
const tooltipStyle = { borderRadius: 12, border: '1px solid #eceef2', boxShadow: '0 16px 40px -12px rgb(19 27 39 / 0.18)', fontSize: 12 };

const shortDay = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
const compact = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

export function DashboardPage() {
  const { user } = useAuth();
  const { base, isAdmin } = useConsole();
  // Refreshes on an interval so new bookings appear without a manual reload.
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: reportApi.dashboard, refetchInterval: 60_000 });

  if (error) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => refetch()} />
      </Card>
    );
  }
  const s = data?.stats;
  const statusData = s
    ? [
        { name: 'Confirmed', value: s.confirmedBookings, color: BRAND },
        { name: 'Cancelled', value: s.cancelledBookings, color: DANGER },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Network overview' : 'Operator dashboard'}
        description={`Welcome back, ${user?.name.split(' ')[0]}. Figures are calculated live from bookings and trips.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`${base}/manifests`}>Passenger manifests</Link>
            </Button>
            <Button asChild>
              <Link to={`${base}/trips`}>
                <Plus /> Schedule trip
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Booking revenue" value={formatCurrency(s?.revenue)} icon={IndianRupee} loading={isLoading} hint={`${formatCurrency(s?.refundsIssued)} refunded`} />
        <StatCard label="Total bookings" value={formatNumber(s?.totalBookings)} icon={Ticket} tone="info" loading={isLoading} hint={`${formatNumber(s?.seatsSold)} seats sold`} />
        <StatCard label="Seat occupancy" value={`${s?.occupancyPercent ?? 0}%`} icon={Armchair} tone="accent" loading={isLoading} hint={`${formatNumber(s?.seatsFilled)} of ${formatNumber(s?.seatsOffered)} seats, ±30 days`} />
        <StatCard label="Scheduled trips" value={formatNumber(s?.scheduledTrips)} icon={CalendarClock} tone="neutral" loading={isLoading} hint={`${formatNumber(s?.totalTrips)} trips in total`} />
        <StatCard label="Confirmed bookings" value={formatNumber(s?.confirmedBookings)} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Cancelled bookings" value={formatNumber(s?.cancelledBookings)} icon={XCircle} tone="danger" loading={isLoading} hint={`${formatCurrency(s?.cancellationFees)} in fees retained`} />
        <StatCard label="Active buses" value={formatNumber(s?.totalBuses)} icon={Bus} tone="info" loading={isLoading} />
        {isAdmin ? (
          <StatCard label="Active operators" value={formatNumber(s?.activeOperators)} icon={BarChart3} tone="neutral" loading={isLoading} hint={`${formatNumber(s?.passengers)} registered passengers`} />
        ) : (
          <StatCard label="Refunds issued" value={formatCurrency(s?.refundsIssued)} icon={IndianRupee} tone="neutral" loading={isLoading} />
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Bookings & revenue</CardTitle>
              <CardDescription>Last 14 days, by booking date</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64" role="img" aria-label="Area chart of daily revenue for the last 14 days">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BRAND} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDay} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickFormatter={compact} tick={axis} tickLine={false} axisLine={false} width={44} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => shortDay(String(l))} formatter={(value, name) => (name === 'revenue' ? [formatCurrency(Number(value)), 'Revenue'] : [value, 'Bookings'])} />
                    <Area type="monotone" dataKey="revenue" stroke={BRAND} strokeWidth={2.5} fill="url(#revenueFill)" />
                    <Area type="monotone" dataKey="bookings" stroke={ACCENT} strokeWidth={2} fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Booking status</CardTitle>
              <CardDescription>All time</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !s?.totalBookings ? (
              <EmptyState title="No bookings yet" className="py-16" />
            ) : (
              <>
                <div className="relative h-48" role="img" aria-label={`${s.confirmedBookings} confirmed and ${s.cancelledBookings} cancelled bookings`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                        {statusData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="tabular text-2xl font-extrabold text-ink-950">{formatNumber(s.totalBookings)}</span>
                    <span className="text-xs text-ink-500">bookings</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {statusData.map((d) => (
                    <li key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-ink-600">
                        <span className="size-2.5 rounded-full" style={{ background: d.color }} aria-hidden /> {d.name}
                      </span>
                      <span className="tabular font-semibold text-ink-900">
                        {formatNumber(d.value)} <span className="font-normal text-ink-400">({Math.round((d.value / s.totalBookings) * 100)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Route-wise bookings</CardTitle>
              <CardDescription>Top routes by number of bookings</CardDescription>
            </div>
            <Button variant="link" asChild>
              <Link to={`${base}/reports`}>Full report</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data?.routeSummary.length ? (
              <EmptyState title="No route data yet" description="Bookings will be summarised here by route." className="py-12" />
            ) : (
              <div className="h-64" role="img" aria-label="Bar chart of bookings per route">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.routeSummary} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" horizontal={false} />
                    <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="route" tick={axis} tickLine={false} axisLine={false} width={132} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f6f7f9' }} />
                    <Bar dataKey="confirmed" name="Confirmed" stackId="a" fill={BRAND} radius={[0, 0, 0, 0]} barSize={16} />
                    <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#f3b4b4" radius={[0, 6, 6, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent booking activity</CardTitle>
              <CardDescription>Latest bookings across {isAdmin ? 'all operators' : 'your trips'}</CardDescription>
            </div>
            <Button variant="link" asChild>
              <Link to={`${base}/bookings`}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-3">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !data?.recentBookings.length ? (
              <EmptyState title="No bookings yet" className="py-12" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.recentBookings.map((b) => (
                  <li key={b._id}>
                    <Link to={`${base}/bookings/${b._id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-ink-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">
                          {b.route ? `${b.route.sourceCity} → ${b.route.destinationCity}` : '—'}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          <span className="font-mono font-semibold text-ink-700">{b.pnr}</span> · {b.passenger} · {formatDateTime(b.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular hidden text-sm font-semibold text-ink-900 sm:block">{formatCurrency(b.total)}</span>
                        <StatusBadge status={b.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
