import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bus as BusIcon, Eye, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ErrorState, StatusBadge } from '@/components/common/feedback';
import { PageHeader } from '@/components/common/layout';
import { DataTable, SearchInput, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useConsole, useSave, useTableState } from '@/hooks';
import { busTypeLabel, cn, formatCurrency } from '@/lib/utils';
import { adminApi } from '@/services';
import type { Bus, Deck, LayoutTemplate, Seat } from '@/types';
import { useOperatorOptions } from './MasterDataPages';

const TEMPLATES: { value: LayoutTemplate; label: string; perRow: number; decks: number }[] = [
  { value: 'SEATER_2X2', label: 'Seater 2+2', perRow: 4, decks: 1 },
  { value: 'SEATER_2X1', label: 'Seater 2+1', perRow: 3, decks: 1 },
  { value: 'SEMI_SLEEPER_2X2', label: 'Semi-sleeper 2+2', perRow: 4, decks: 1 },
  { value: 'SLEEPER_2X1', label: 'Sleeper 2+1 (two decks)', perRow: 3, decks: 2 },
  { value: 'SLEEPER_1X1', label: 'Sleeper 1+1 (two decks)', perRow: 2, decks: 2 },
];

const busSchema = z.object({
  operatorId: z.string().min(1, 'Choose an operator'),
  name: z.string().trim().min(2, 'Enter a name for the bus').max(80),
  registrationNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9 -]{5,16}$/, 'Enter a valid registration number'),
  isAC: z.boolean(),
  amenities: z.string(),
  template: z.enum(['SEATER_2X2', 'SEATER_2X1', 'SEMI_SLEEPER_2X2', 'SLEEPER_2X1', 'SLEEPER_1X1']),
  rows: z.coerce.number().int().min(2, 'At least 2 rows').max(15, 'At most 15 rows'),
  windowPremium: z.coerce.number().min(0).max(1000),
  lowerDeckPremium: z.coerce.number().min(0).max(1000),
});
type BusValues = z.infer<typeof busSchema>;

function BusDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const operators = useOperatorOptions(open);
  const navigate = useNavigate();
  const form = useForm<z.input<typeof busSchema>, unknown, BusValues>({ resolver: zodResolver(busSchema), defaultValues: { operatorId: '', name: '', registrationNumber: '', isAC: true, amenities: 'Charging point, Water bottle', template: 'SEATER_2X2', rows: 10, windowPremium: 0, lowerDeckPremium: 0 } });
  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);
  const [template, rows] = form.watch(['template', 'rows']);
  const spec = TEMPLATES.find((t) => t.value === template)!;
  const save = useSave<BusValues, Bus>({
    mutationFn: (v) =>
      adminApi.createBus({
        operatorId: v.operatorId,
        name: v.name,
        registrationNumber: v.registrationNumber,
        isAC: v.isAC,
        amenities: v.amenities.split(',').map((a) => a.trim()).filter(Boolean),
        layout: { template: v.template, rows: v.rows, windowPremium: v.windowPremium, lowerDeckPremium: v.lowerDeckPremium },
      }),
    success: (bus) => `${bus.name} created with ${bus.seats?.length ?? 0} seats`,
    onDone: (bus) => {
      onOpenChange(false);
      navigate(`/admin/buses/${bus._id}`);
    },
    setError: form.setError,
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add bus" description="The seat layout is generated from the template; individual seats can be adjusted afterwards.">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Operator" htmlFor="bus-operator" error={e.operatorId?.message} required className="sm:col-span-2">
            <Select id="bus-operator" aria-invalid={!!e.operatorId} {...form.register('operatorId')}>
              <option value="">Select operator</option>
              {operators.data?.filter((o) => o.isActive).map((o) => (
                <option key={o._id} value={o._id}>{o.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Bus name" htmlFor="bus-name" error={e.name?.message} required>
            <Input id="bus-name" placeholder="e.g. Starline Recliner" aria-invalid={!!e.name} {...form.register('name')} />
          </Field>
          <Field label="Registration number" htmlFor="bus-reg" error={e.registrationNumber?.message} required>
            <Input id="bus-reg" className="uppercase" placeholder="KA01AB1234" aria-invalid={!!e.registrationNumber} {...form.register('registrationNumber')} />
          </Field>
          <Field label="Seat layout" htmlFor="bus-template" required>
            <Select id="bus-template" {...form.register('template')}>
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Rows" htmlFor="bus-rows" error={e.rows?.message} hint={`${(Number(rows) || 0) * spec.perRow * spec.decks} seats in total`} required>
            <Input id="bus-rows" type="number" min={2} max={15} aria-invalid={!!e.rows} {...form.register('rows')} />
          </Field>
          <Field label="Window seat premium (₹)" htmlFor="bus-window" error={e.windowPremium?.message}>
            <Input id="bus-window" type="number" min={0} {...form.register('windowPremium')} />
          </Field>
          <Field label="Lower deck premium (₹)" htmlFor="bus-lower" error={e.lowerDeckPremium?.message} hint={spec.decks === 1 ? 'Applies to two-deck sleepers only' : undefined}>
            <Input id="bus-lower" type="number" min={0} disabled={spec.decks === 1} {...form.register('lowerDeckPremium')} />
          </Field>
          <Field label="Amenities" htmlFor="bus-amenities" hint="Comma separated" className="sm:col-span-2">
            <Input id="bus-amenities" {...form.register('amenities')} />
          </Field>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700 sm:col-span-2">
            <input type="checkbox" className="size-4 accent-brand-700" {...form.register('isAC')} /> Air conditioned
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Create bus</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BusesPage() {
  const { base, isAdmin } = useConsole();
  const navigate = useNavigate();
  const table = useTableState({});
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['buses', table.page, table.search], queryFn: () => adminApi.buses({ page: table.page, limit: 10, search: table.search }), placeholderData: keepPreviousData });

  const columns: Column<Bus>[] = [
    { key: 'name', header: 'Bus', cell: (b) => (<div><p className="font-semibold text-ink-900">{b.name}</p><p className="font-mono text-xs text-ink-500">{b.registrationNumber}</p></div>) },
    ...(isAdmin ? [{ key: 'operator', header: 'Operator', hideOnMobile: true, cell: (b: Bus) => b.operatorId?.name ?? '—' }] : []),
    { key: 'type', header: 'Type', cell: (b) => busTypeLabel(b.busType, b.isAC) },
    { key: 'seats', header: 'Seats', align: 'right', cell: (b) => (<span className="tabular">{b.activeSeats}{b.activeSeats !== b.totalSeats && <span className="text-ink-400"> / {b.totalSeats}</span>}</span>) },
    { key: 'status', header: 'Status', hideOnMobile: true, cell: (b) => <StatusBadge status={b.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'actions', header: '', align: 'right', cell: (b) => (<Button variant="ghost" size="sm" asChild><Link to={`${base}/buses/${b._id}`} onClick={(ev) => ev.stopPropagation()}><Eye /> Layout</Link></Button>) },
  ];

  return (
    <>
      <PageHeader title={isAdmin ? 'Buses & seat layouts' : 'My buses'} description={isAdmin ? 'Vehicles, their seating configuration and seat-level fares.' : 'Vehicles assigned to your operator account.'} actions={isAdmin && <Button onClick={() => setOpen(true)}><Plus /> Add bus</Button>} />
      <DataTable columns={columns} rows={query.data?.items} rowKey={(b) => b._id} loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} meta={query.data?.meta} onPageChange={table.setPage} onRowClick={(b) => navigate(`${base}/buses/${b._id}`)} toolbar={<SearchInput value={table.search} onChange={table.setSearch} placeholder="Search by name or registration" />} emptyIcon={BusIcon} emptyTitle="No buses found" emptyDescription={isAdmin ? 'Add a bus to generate its seat layout.' : 'No buses have been assigned to your operator yet.'} />
      {isAdmin && <BusDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

/** Vehicle detail with its seat layout. Admins can disable seats and edit seat premiums. */
export function BusDetailPage() {
  const { id = '' } = useParams();
  const { base, isAdmin } = useConsole();
  const query = useQuery({ queryKey: ['bus', id], queryFn: () => adminApi.bus(id) });
  const [deck, setDeck] = useState<Deck>('LOWER');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [premium, setPremium] = useState('0');

  const bus = query.data;
  const seats = useMemo(() => bus?.seats ?? [], [bus]);
  const selected = seats.find((s) => s._id === selectedId) ?? null;
  useEffect(() => setPremium(String(selected?.priceModifier ?? 0)), [selected]);

  const saveSeat = useSave<{ seat: Seat; body: { isActive?: boolean; priceModifier?: number } }>({
    mutationFn: ({ seat, body }) => adminApi.updateSeat(id, seat._id, body),
    success: 'Seat updated',
  });
  const toggleBus = useSave<Bus>({ mutationFn: (b) => adminApi.updateBus(b._id, { isActive: !b.isActive }), success: 'Bus updated' });

  if (query.isLoading) return <Skeleton className="h-[32rem] rounded-card" />;
  if (query.error || !bus) return <Card><ErrorState error={query.error} onRetry={() => query.refetch()} /></Card>;

  const decks = [...new Set(seats.map((s) => s.deck))].sort() as Deck[];
  const activeDeck = decks.includes(deck) ? deck : decks[0];
  const template = Array.from({ length: bus.layout.columns + 1 }, (_, i) => (i === bus.layout.aisleAfterColumn ? '1.25rem' : 'minmax(0,1fr)')).join(' ');
  const col = (c: number) => (c > bus.layout.aisleAfterColumn ? c + 1 : c);
  const inService = seats.filter((s) => s.isActive).length;

  return (
    <>
      <Link to={`${base}/buses`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
        <ArrowLeft className="size-4" aria-hidden /> All buses
      </Link>
      <PageHeader
        title={bus.name}
        description={`${bus.registrationNumber} · ${busTypeLabel(bus.busType, bus.isAC)} · ${bus.operatorId.name}`}
        actions={
          <>
            <StatusBadge status={bus.isActive ? 'ACTIVE' : 'INACTIVE'} />
            {isAdmin && <Button variant="outline" loading={toggleBus.isPending} onClick={() => toggleBus.mutate(bus)}>{bus.isActive ? 'Take out of service' : 'Return to service'}</Button>}
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Seat layout</h2>
                <p className="text-sm text-ink-500">{inService} of {seats.length} seats in service{isAdmin && ' · select a seat to edit it'}</p>
              </div>
              {decks.length > 1 && (
                <div className="inline-flex rounded-xl bg-ink-100 p-1">
                  {decks.map((d) => (
                    <button key={d} type="button" onClick={() => setDeck(d)} className={cn('rounded-lg px-4 py-1.5 text-sm font-semibold', activeDeck === d ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600')}>
                      {d === 'LOWER' ? 'Lower deck' : 'Upper deck'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mx-auto w-full max-w-xs rounded-[1.75rem] border-2 border-ink-200 bg-ink-50/60 p-4">
              <p className="mb-3 border-b border-dashed border-ink-200 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Front</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: template }}>
                {seats.filter((s) => s.deck === activeDeck).map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setSelectedId(s._id)}
                    aria-pressed={selectedId === s._id}
                    aria-label={`Seat ${s.seatNumber}${s.isActive ? '' : ', out of service'}`}
                    style={{ gridColumn: col(s.column), gridRow: s.row }}
                    className={cn(
                      'tabular relative flex items-center justify-center rounded-lg border text-[11px] font-bold transition-all disabled:cursor-default',
                      bus.busType === 'SLEEPER' ? 'h-16' : 'h-10',
                      s.isActive ? 'border-ink-300 bg-white text-ink-700' : 'border-dashed border-ink-200 bg-ink-100 text-ink-300 line-through',
                      isAdmin && 'hover:border-brand-500',
                      selectedId === s._id && 'border-brand-700 ring-2 ring-brand-500/30',
                    )}
                  >
                    {s.seatNumber}
                    {s.priceModifier > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent-500" aria-hidden />}
                  </button>
                ))}
              </div>
              <p className="mt-3 border-t border-dashed border-ink-200 pt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">Rear</p>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-500">
              <span className="size-1.5 rounded-full bg-accent-500" aria-hidden /> Seat carries a fare premium
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 text-sm">
              <h2 className="text-base font-bold">Vehicle</h2>
              <dl className="space-y-2">
                {[
                  ['Layout', TEMPLATES.find((t) => t.value === bus.layout.template)?.label ?? bus.layout.template],
                  ['Rows', String(bus.layout.rows)],
                  ['Decks', String(bus.layout.decks)],
                  ['Total seats', String(seats.length)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="font-medium text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
              {bus.amenities.length > 0 && <div className="flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">{bus.amenities.map((a) => <Badge key={a}>{a}</Badge>)}</div>}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardContent>
                <h2 className="text-base font-bold">Edit seat</h2>
                {!selected ? (
                  <p className="mt-2 text-sm text-ink-500">Select a seat on the layout to change its availability or fare premium.</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="tabular text-2xl font-extrabold">{selected.seatNumber}</span>
                      <StatusBadge status={selected.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </div>
                    <p className="text-xs text-ink-500">{selected.position === 'WINDOW' ? 'Window' : 'Aisle'} · {selected.deck === 'LOWER' ? 'Lower' : 'Upper'} deck · currently +{formatCurrency(selected.priceModifier)}</p>
                    <Field label="Fare premium (₹)" htmlFor="seat-premium" hint="Added to the trip's base fare for this seat">
                      <Input id="seat-premium" type="number" min={0} max={2000} value={premium} onChange={(e) => setPremium(e.target.value)} />
                    </Field>
                    <div className="grid gap-2">
                      <Button loading={saveSeat.isPending} disabled={Number(premium) === selected.priceModifier || Number(premium) < 0} onClick={() => saveSeat.mutate({ seat: selected, body: { priceModifier: Number(premium) } })}>
                        Save premium
                      </Button>
                      <Button variant="outline" disabled={saveSeat.isPending} onClick={() => saveSeat.mutate({ seat: selected, body: { isActive: !selected.isActive } })}>
                        {selected.isActive ? 'Mark out of service' : 'Return to service'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
