import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { StatusBadge } from '@/components/common/feedback';
import { ConfirmDialog, PageHeader } from '@/components/common/layout';
import { DataTable, SearchInput, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useConsole, useSave, useTableState } from '@/hooks';
import { cn, formatCurrency, formatDay, formatDuration, formatTime, istDate, istLocalToIso } from '@/lib/utils';
import { adminApi, tripApi } from '@/services';
import type { BusRoute, ManagedTrip } from '@/types';
import { useOperatorOptions } from './MasterDataPages';

// ── Routes ─────────────────────────────────────────────────────────────────

const routeSchema = z.object({
  operatorId: z.string().min(1, 'Choose an operator'),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,16}$/, '3-16 letters, digits or dashes'),
  sourceCity: z.string().trim().min(2, 'Enter the source city'),
  destinationCity: z.string().trim().min(2, 'Enter the destination city'),
  distanceKm: z.coerce.number().min(1, 'Enter the distance'),
  durationMinutes: z.coerce.number().int().min(10, 'At least 10 minutes'),
  stops: z
    .array(z.object({ stopId: z.string().min(1, 'Choose a stop'), type: z.enum(['BOARDING', 'DROPPING']), offsetMinutes: z.coerce.number().int().min(0, 'Must be ≥ 0') }))
    .min(2, 'Add at least one boarding and one dropping point'),
});
type RouteValues = z.infer<typeof routeSchema>;

function RouteDialog({ route, open, onOpenChange }: { route: BusRoute | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const operators = useOperatorOptions(open);
  const stops = useQuery({ queryKey: ['stops', 'options'], queryFn: () => adminApi.stops({ limit: 200 }), enabled: open, select: (d) => d.items.filter((s) => s.isActive) });
  const form = useForm<z.input<typeof routeSchema>, unknown, RouteValues>({ resolver: zodResolver(routeSchema) });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'stops' });
  useEffect(() => {
    if (!open) return;
    form.reset({
      operatorId: route?.operatorId._id ?? '',
      code: route?.code ?? '',
      sourceCity: route?.sourceCity ?? '',
      destinationCity: route?.destinationCity ?? '',
      distanceKm: route?.distanceKm ?? ('' as unknown as number),
      durationMinutes: route?.durationMinutes ?? ('' as unknown as number),
      stops: route?.stops.map((s) => ({ stopId: s.stopId._id, type: s.type, offsetMinutes: s.offsetMinutes })) ?? [
        { stopId: '', type: 'BOARDING', offsetMinutes: 0 },
        { stopId: '', type: 'DROPPING', offsetMinutes: 0 },
      ],
    });
  }, [open, route, form]);

  const save = useSave<RouteValues>({
    mutationFn: (v) => (route ? adminApi.updateRoute(route._id, { distanceKm: v.distanceKm, durationMinutes: v.durationMinutes, stops: v.stops }) : adminApi.createRoute(v)),
    success: route ? 'Route updated' : 'Route created',
    onDone: () => onOpenChange(false),
    setError: form.setError,
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={route ? `Edit route ${route.code}` : 'Add route'} description="A route is the reusable template trips are scheduled from. Stop times are offsets from departure.">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Operator" htmlFor="r-op" error={e.operatorId?.message} required>
              <Select id="r-op" disabled={!!route} aria-invalid={!!e.operatorId} {...form.register('operatorId')}>
                <option value="">Select operator</option>
                {operators.data?.map((o) => (
                  <option key={o._id} value={o._id}>{o.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Route code" htmlFor="r-code" error={e.code?.message} required>
              <Input id="r-code" className="uppercase" disabled={!!route} placeholder="DSL-BLR-HYD" aria-invalid={!!e.code} {...form.register('code')} />
            </Field>
            <Field label="From city" htmlFor="r-from" error={e.sourceCity?.message} required>
              <Input id="r-from" disabled={!!route} aria-invalid={!!e.sourceCity} {...form.register('sourceCity')} />
            </Field>
            <Field label="To city" htmlFor="r-to" error={e.destinationCity?.message} required>
              <Input id="r-to" disabled={!!route} aria-invalid={!!e.destinationCity} {...form.register('destinationCity')} />
            </Field>
            <Field label="Distance (km)" htmlFor="r-km" error={e.distanceKm?.message} required>
              <Input id="r-km" type="number" min={1} aria-invalid={!!e.distanceKm} {...form.register('distanceKm')} />
            </Field>
            <Field label="Duration (minutes)" htmlFor="r-dur" error={e.durationMinutes?.message} required>
              <Input id="r-dur" type="number" min={10} aria-invalid={!!e.durationMinutes} {...form.register('durationMinutes')} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-900">Stops</h3>
              <Button variant="subtle" size="sm" onClick={() => append({ stopId: '', type: 'DROPPING', offsetMinutes: 0 })}>
                <Plus /> Add stop
              </Button>
            </div>
            {e.stops?.message && <p className="mb-2 text-xs font-medium text-danger" role="alert">{e.stops.message}</p>}
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_8rem_6.5rem_auto] items-start gap-2">
                  <Select aria-label={`Stop ${i + 1}`} aria-invalid={!!e.stops?.[i]?.stopId} {...form.register(`stops.${i}.stopId`)}>
                    <option value="">Choose stop</option>
                    {stops.data?.map((s) => (
                      <option key={s._id} value={s._id}>{s.city} — {s.name}</option>
                    ))}
                  </Select>
                  <Select aria-label={`Stop ${i + 1} type`} {...form.register(`stops.${i}.type`)}>
                    <option value="BOARDING">Boarding</option>
                    <option value="DROPPING">Dropping</option>
                  </Select>
                  <Input type="number" min={0} aria-label={`Stop ${i + 1} minutes after departure`} placeholder="+min" aria-invalid={!!e.stops?.[i]?.offsetMinutes} {...form.register(`stops.${i}.offsetMinutes`)} />
                  <Button variant="ghost" size="icon" aria-label={`Remove stop ${i + 1}`} disabled={fields.length <= 2} onClick={() => remove(i)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">Boarding points must come before dropping points. Existing trips keep their own stop times.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{route ? 'Save changes' : 'Create route'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoutesPage() {
  const { isAdmin } = useConsole();
  const table = useTableState({});
  const [editing, setEditing] = useState<BusRoute | null>(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['routes', table.page, table.search], queryFn: () => adminApi.routes({ page: table.page, limit: 10, search: table.search }), placeholderData: keepPreviousData });
  const openDialog = (r: BusRoute | null) => {
    setEditing(r);
    setOpen(true);
  };

  const columns: Column<BusRoute>[] = [
    { key: 'route', header: 'Route', cell: (r) => (<div><p className="font-semibold text-ink-900">{r.sourceCity} → {r.destinationCity}</p><p className="font-mono text-xs text-ink-500">{r.code}</p></div>) },
    ...(isAdmin ? [{ key: 'operator', header: 'Operator', hideOnMobile: true, cell: (r: BusRoute) => r.operatorId?.name }] : []),
    { key: 'distance', header: 'Distance', hideOnMobile: true, cell: (r) => <span className="tabular">{r.distanceKm} km</span> },
    { key: 'duration', header: 'Duration', cell: (r) => formatDuration(r.durationMinutes) },
    { key: 'stops', header: 'Stops', hideOnMobile: true, cell: (r) => <span className="text-xs text-ink-600">{r.stops.filter((s) => s.type === 'BOARDING').length} boarding · {r.stops.filter((s) => s.type === 'DROPPING').length} dropping</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    ...(isAdmin ? [{ key: 'actions', header: '', align: 'right' as const, cell: (r: BusRoute) => <Button variant="ghost" size="sm" onClick={() => openDialog(r)}>Edit</Button> }] : []),
  ];
  return (
    <>
      <PageHeader title={isAdmin ? 'Routes' : 'My routes'} description="City pairs, distances and the ordered stops each trip follows." actions={isAdmin && <Button onClick={() => openDialog(null)}><Plus /> Add route</Button>} />
      <DataTable columns={columns} rows={query.data?.items} rowKey={(r) => r._id} loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} meta={query.data?.meta} onPageChange={table.setPage} toolbar={<SearchInput value={table.search} onChange={table.setSearch} placeholder="Search by city or code" />} emptyIcon={RouteIcon} emptyTitle="No routes found" />
      {isAdmin && <RouteDialog route={editing} open={open} onOpenChange={setOpen} />}
    </>
  );
}

// ── Trips & fares ──────────────────────────────────────────────────────────

const tripSchema = z.object({
  routeId: z.string().min(1, 'Choose a route'),
  busId: z.string().min(1, 'Choose a bus'),
  departure: z.string().min(1, 'Choose the departure date and time'),
  baseFare: z.coerce.number().min(1, 'Enter a fare').max(20000),
  repeatDays: z.coerce.number().int().min(1).max(30),
});
type TripValues = z.infer<typeof tripSchema>;

function ScheduleTripDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const routes = useQuery({ queryKey: ['routes', 'options'], queryFn: () => adminApi.routes({ limit: 100, isActive: 'true' }), enabled: open, select: (d) => d.items });
  const buses = useQuery({ queryKey: ['buses', 'options'], queryFn: () => adminApi.buses({ limit: 100, isActive: 'true' }), enabled: open, select: (d) => d.items });
  const form = useForm<z.input<typeof tripSchema>, unknown, TripValues>({ resolver: zodResolver(tripSchema), defaultValues: { routeId: '', busId: '', departure: `${istDate(1)}T21:00`, baseFare: 800, repeatDays: 1 } });
  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);
  const routeId = form.watch('routeId');
  const route = routes.data?.find((r) => r._id === routeId);
  // A trip's bus must belong to the same operator as its route.
  const busOptions = (buses.data ?? []).filter((b) => !route || b.operatorId._id === route.operatorId._id);

  const save = useSave<TripValues, { created: number }>({
    mutationFn: (v) => tripApi.create({ routeId: v.routeId, busId: v.busId, departureTime: istLocalToIso(v.departure), baseFare: v.baseFare, repeatDays: v.repeatDays }),
    success: (r) => `${r.created} trip${r.created === 1 ? '' : 's'} scheduled`,
    onDone: () => onOpenChange(false),
    setError: form.setError,
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Schedule trips" description="Create a single departure, or the same departure every day for up to 30 days.">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Route" htmlFor="t-route" error={e.routeId?.message} required className="sm:col-span-2">
            <Select id="t-route" aria-invalid={!!e.routeId} {...form.register('routeId')}>
              <option value="">Select route</option>
              {routes.data?.map((r) => (
                <option key={r._id} value={r._id}>{r.sourceCity} → {r.destinationCity} ({r.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Bus" htmlFor="t-bus" error={e.busId?.message} required className="sm:col-span-2" hint={route ? `Showing ${route.operatorId.name} buses` : undefined}>
            <Select id="t-bus" aria-invalid={!!e.busId} {...form.register('busId')}>
              <option value="">Select bus</option>
              {busOptions.map((b) => (
                <option key={b._id} value={b._id}>{b.name} · {b.registrationNumber}</option>
              ))}
            </Select>
          </Field>
          <Field label="First departure (IST)" htmlFor="t-dep" error={e.departure?.message} required>
            <Input id="t-dep" type="datetime-local" aria-invalid={!!e.departure} {...form.register('departure')} />
          </Field>
          <Field label="Base fare per seat (₹)" htmlFor="t-fare" error={e.baseFare?.message} required>
            <Input id="t-fare" type="number" min={1} aria-invalid={!!e.baseFare} {...form.register('baseFare')} />
          </Field>
          <Field label="Repeat daily for" htmlFor="t-repeat" error={e.repeatDays?.message} hint="1 = a single trip" className="sm:col-span-2">
            <Select id="t-repeat" {...form.register('repeatDays')}>
              {[1, 3, 7, 14, 21, 30].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}</option>
              ))}
            </Select>
          </Field>
          {route && <p className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600 sm:col-span-2">Arrival is set automatically: {formatDuration(route.durationMinutes)} after departure. Stop times come from the route.</p>}
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFareDialog({ trip, onOpenChange }: { trip: ManagedTrip | null; onOpenChange: (o: boolean) => void }) {
  const [fare, setFare] = useState('');
  useEffect(() => setFare(String(trip?.baseFare ?? '')), [trip]);
  const save = useSave<{ id: string; fare: number }>({ mutationFn: ({ id, fare: f }) => tripApi.update(id, { baseFare: f }), success: 'Fare updated', onDone: () => onOpenChange(false) });
  const value = Number(fare);
  return (
    <Dialog open={!!trip} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Change fare" description={trip ? `${trip.route.sourceCity} → ${trip.route.destinationCity}, ${formatDay(trip.departureTime)} ${formatTime(trip.departureTime)}` : undefined}>
        <Field label="Base fare per seat (₹)" htmlFor="fare-input" hint="Applies to new bookings only — existing tickets keep the fare they paid." error={fare && (value < 1 || value > 20000) ? 'Enter a fare between 1 and 20,000' : undefined}>
          <Input id="fare-input" type="number" min={1} max={20000} value={fare} onChange={(e) => setFare(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!trip || value < 1 || value > 20000 || value === trip.baseFare} onClick={() => trip && save.mutate({ id: trip._id, fare: value })}>Save fare</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const occupancyBar = (t: ManagedTrip) => (
  <div className="flex min-w-28 items-center gap-2">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${t.occupancyPercent}% occupied`}>
      <div className={cn('h-full rounded-full', t.occupancyPercent >= 80 ? 'bg-accent-500' : 'bg-brand-600')} style={{ width: `${Math.min(100, t.occupancyPercent)}%` }} />
    </div>
    <span className="tabular w-16 text-right text-xs text-ink-600">{t.bookedSeats}/{t.totalSeats}</span>
  </div>
);

export function TripsPage() {
  const { base, isAdmin } = useConsole();
  const table = useTableState({ status: 'SCHEDULED', from: istDate(), to: '' });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [fareTrip, setFareTrip] = useState<ManagedTrip | null>(null);
  const [action, setAction] = useState<{ trip: ManagedTrip; status: 'DEPARTED' | 'COMPLETED' | 'CANCELLED' } | null>(null);
  const f = table.filters;
  const query = useQuery({ queryKey: ['trips', table.page, f], queryFn: () => tripApi.list({ page: table.page, limit: 10, status: f.status, from: f.from, to: f.to }), placeholderData: keepPreviousData });
  const changeStatus = useSave<{ trip: ManagedTrip; status: string }, ManagedTrip & { cancelledBookings: number }>({
    mutationFn: ({ trip, status }) => tripApi.update(trip._id, { status }),
    success: (r) => (r.status === 'CANCELLED' ? `Trip cancelled — ${r.cancelledBookings} booking(s) refunded in full` : `Trip marked ${r.status.toLowerCase()}`),
    onDone: () => setAction(null),
  });

  const columns: Column<ManagedTrip>[] = [
    { key: 'when', header: 'Departure', cell: (t) => (<div><p className="font-semibold text-ink-900">{formatDay(t.departureTime)}</p><p className="tabular text-xs text-ink-500">{formatTime(t.departureTime)} → {formatTime(t.arrivalTime)}</p></div>) },
    { key: 'route', header: 'Route', cell: (t) => (<div><p className="font-medium text-ink-900">{t.route.sourceCity} → {t.route.destinationCity}</p><p className="font-mono text-xs text-ink-500">{t.route.code}</p></div>) },
    { key: 'bus', header: 'Bus', hideOnMobile: true, cell: (t) => (<div><p className="text-ink-800">{t.bus.name}</p>{isAdmin && <p className="text-xs text-ink-500">{t.operator.name}</p>}</div>) },
    { key: 'fare', header: 'Base fare', align: 'right', cell: (t) => <span className="tabular font-semibold">{formatCurrency(t.baseFare)}</span> },
    { key: 'occupancy', header: 'Occupancy', hideOnMobile: true, cell: occupancyBar },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (t) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" asChild><Link to={`${base}/manifests?trip=${t._id}`}>Manifest</Link></Button>
          {t.status === 'SCHEDULED' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setFareTrip(t)}>Fare</Button>
              <Button variant="ghost" size="sm" onClick={() => setAction({ trip: t, status: 'DEPARTED' })}>Depart</Button>
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => setAction({ trip: t, status: 'CANCELLED' })}>Cancel</Button>
            </>
          )}
          {t.status === 'DEPARTED' && <Button variant="ghost" size="sm" onClick={() => setAction({ trip: t, status: 'COMPLETED' })}>Complete</Button>}
        </div>
      ),
    },
  ];

  const confirmCopy = action && {
    CANCELLED: { title: 'Cancel this trip?', description: `All ${action.trip.bookedSeats} booked seat(s) will be cancelled and every passenger refunded in full. This cannot be undone.`, label: 'Cancel trip' },
    DEPARTED: { title: 'Mark trip as departed?', description: 'The trip will close for booking and cancellation.', label: 'Mark departed' },
    COMPLETED: { title: 'Mark trip as completed?', description: 'The trip will be recorded as completed.', label: 'Mark completed' },
  }[action.status];

  return (
    <>
      <PageHeader title="Trips & fares" description="Scheduled departures, live occupancy and per-trip fares." actions={<Button onClick={() => setScheduleOpen(true)}><Plus /> Schedule trips</Button>} />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(t) => t._id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        meta={query.data?.meta}
        onPageChange={table.setPage}
        emptyIcon={CalendarClock}
        emptyTitle="No trips match these filters"
        emptyAction={<Button onClick={() => setScheduleOpen(true)}><Plus /> Schedule trips</Button>}
        toolbar={
          <>
            <Select value={f.status} onChange={(e) => table.setFilter('status', e.target.value)} aria-label="Filter by status" className="w-40">
              <option value="">All statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DEPARTED">Departed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-ink-600">From <Input type="date" value={f.from} onChange={(e) => table.setFilter('from', e.target.value)} className="w-40" /></label>
            <label className="flex items-center gap-2 text-sm text-ink-600">To <Input type="date" value={f.to} onChange={(e) => table.setFilter('to', e.target.value)} className="w-40" /></label>
          </>
        }
      />
      <ScheduleTripDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
      <EditFareDialog trip={fareTrip} onOpenChange={(o) => !o && setFareTrip(null)} />
      {confirmCopy && (
        <ConfirmDialog
          open={!!action}
          onOpenChange={(o) => !o && setAction(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.label}
          destructive={action?.status === 'CANCELLED'}
          loading={changeStatus.isPending}
          onConfirm={() => action && changeStatus.mutate(action)}
        />
      )}
    </>
  );
}

export { occupancyBar };
