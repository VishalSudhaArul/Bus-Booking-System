import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { BusFront, ChevronLeft, ChevronRight, Moon, SlidersHorizontal, Star, Sun, Sunrise, Sunset, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common/feedback';
import { Pagination } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/AuthContext';
import { BoardingPassModal } from '@/features/bookings/BoardingPassModal';
import { CheckoutPanel } from '@/features/bookings/CheckoutPanel';
import { clearDraft, loadDraft, saveDraft, type BookingDraft } from '@/features/bookings/draft';
import type { SeatSelection } from '@/features/seats/SeatDrawer';
import { SearchWidget, searchSchema } from '@/features/search/SearchWidget';
import { TripCard } from '@/features/trips/TripCard';
import { cn, formatCurrency, istDate } from '@/lib/utils';
import { tripApi } from '@/services';
import type { Booking } from '@/types';

const SORTS = [
  { value: 'departure:asc', label: 'Earliest departure' },
  { value: 'departure:desc', label: 'Latest departure' },
  { value: 'price:asc', label: 'Cheapest first' },
  { value: 'price:desc', label: 'Most expensive' },
  { value: 'duration:asc', label: 'Fastest' },
  { value: 'rating:desc', label: 'Top rated' },
  { value: 'seats:desc', label: 'Most seats left' },
  { value: 'arrival:asc', label: 'Earliest arrival' },
];

const SLOTS: { value: string; label: string; hours: string; icon: LucideIcon }[] = [
  { value: 'MORNING', label: 'Morning', hours: '5 AM–12 PM', icon: Sunrise },
  { value: 'AFTERNOON', label: 'Afternoon', hours: '12–5 PM', icon: Sun },
  { value: 'EVENING', label: 'Evening', hours: '5–9 PM', icon: Sunset },
  { value: 'NIGHT', label: 'Night', hours: '9 PM–5 AM', icon: Moon },
];

const RATINGS = [
  { value: '', label: 'Any' },
  { value: '3.5', label: '3.5+' },
  { value: '4', label: '4.0+' },
  { value: '4.5', label: '4.5+' },
];

const dayLabel = (d: string) => {
  const date = new Date(`${d}T12:00:00+05:30`);
  return {
    weekday: date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }),
    day: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
  };
};
const shiftDate = (d: string, days: number) => new Date(new Date(`${d}T12:00:00+05:30`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

function FilterGroup({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border-b border-ink-100 py-5 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150 active:scale-95',
        active ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showFilters, setShowFilters] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [checkoutDraft, setCheckoutDraft] = useState<BookingDraft | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const parsed = searchSchema.safeParse({ from: params.get('from') ?? '', to: params.get('to') ?? '', date: params.get('date') ?? '', passengers: params.get('passengers') ?? '1' });
  const list = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const [sort, order] = (params.get('sort') ?? 'departure:asc').split(':');
  const busTypes = list('busType');
  const slots = list('slot');
  const ac = params.get('ac') ?? '';
  const rating = params.get('rating') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const filterCount = busTypes.length + slots.length + (ac ? 1 : 0) + (rating ? 1 : 0) + (maxPrice ? 1 : 0);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!('page' in changes)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  const toggle = (key: string, current: string[], value: string) => update({ [key]: (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).join(',') || null });
  const clearFilters = () => update({ busType: null, slot: null, ac: null, rating: null, maxPrice: null });

  const criteria = parsed.success ? parsed.data : null;
  const query = useQuery({
    queryKey: ['trip-search', criteria, sort, order, busTypes.join(), slots.join(), ac, rating, maxPrice, page],
    queryFn: () =>
      tripApi.search({ ...criteria!, sort, order, busType: busTypes, departureSlot: slots, ac: ac || undefined, minRating: rating || undefined, maxPrice: maxPrice || undefined, page, limit: 8 }),
    enabled: !!criteria,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const facets = query.data?.meta.facets as { minPrice: number; maxPrice: number } | undefined;

  // Price slider: local value while dragging, committed to the URL after a pause.
  const [price, setPrice] = useState<number | null>(maxPrice ? Number(maxPrice) : null);
  useEffect(() => setPrice(maxPrice ? Number(maxPrice) : null), [maxPrice]);
  useEffect(() => {
    if (price === null || String(price) === maxPrice) return;
    const t = setTimeout(() => update({ maxPrice: facets && price >= facets.maxPrice ? null : String(price) }), 350);
    return () => clearTimeout(t);
  }, [price, maxPrice, facets, update]);

  // Returning from sign-in with a saved selection: reopen checkout.
  useEffect(() => {
    if (params.get('checkout') !== '1' || !user) return;
    const draft = loadDraft();
    update({ checkout: null });
    if (draft && user.role === 'PASSENGER') setCheckoutDraft(draft);
  }, [params, user, update]);

  const continueToBook = (selection: SeatSelection) => {
    const draft = saveDraft(selection);
    if (!user) {
      toast.info('Log in to continue', { description: 'Your seat selection is saved.' });
      const back = new URLSearchParams(params);
      back.set('checkout', '1');
      return navigate('/login', { state: { from: `${location.pathname}?${back}` } });
    }
    if (user.role !== 'PASSENGER') return toast.error('Staff accounts cannot make bookings', { description: 'Log in with a passenger account to book seats.' });
    setCheckoutDraft(draft);
  };

  const onSeatsLost = useCallback(
    (message: string) => {
      toast.error('Please choose your seats again', { description: message });
      const tripId = checkoutDraft?.tripId ?? null;
      setCheckoutDraft(null);
      setOpenTripId(tripId);
      queryClient.invalidateQueries({ queryKey: ['trip-seats'] });
      queryClient.invalidateQueries({ queryKey: ['trip-search'] });
    },
    [checkoutDraft, queryClient],
  );

  const onBooked = (booking: Booking) => {
    clearDraft();
    setCheckoutDraft(null);
    setOpenTripId(null);
    setConfirmed(booking);
  };

  const filters = (
    <div>
      <FilterGroup title="Departure time">
        <div className="grid grid-cols-2 gap-2">
          {SLOTS.map((s) => (
            <Pill key={s.value} active={slots.includes(s.value)} onClick={() => toggle('slot', slots, s.value)} className="flex flex-col items-center gap-0.5 py-2.5">
              <s.icon className="size-4" aria-hidden />
              <span>{s.label}</span>
              <span className="text-[10px] font-medium opacity-70">{s.hours}</span>
            </Pill>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Bus type">
        <div className="flex flex-wrap gap-2">
          <Pill active={ac === 'true'} onClick={() => update({ ac: ac === 'true' ? null : 'true' })}>A/C</Pill>
          <Pill active={ac === 'false'} onClick={() => update({ ac: ac === 'false' ? null : 'false' })}>Non-A/C</Pill>
          {[
            ['SLEEPER', 'Sleeper'],
            ['SEMI_SLEEPER', 'Semi-sleeper'],
            ['SEATER', 'Seater'],
          ].map(([value, label]) => (
            <Pill key={value} active={busTypes.includes(value)} onClick={() => toggle('busType', busTypes, value)}>
              {label}
            </Pill>
          ))}
        </div>
      </FilterGroup>
      {facets && facets.maxPrice > facets.minPrice && (
        <FilterGroup title="Price" action={<span className="tabular text-xs font-bold text-brand-700">up to {formatCurrency(price ?? facets.maxPrice)}</span>}>
          <input
            type="range"
            min={Math.floor(facets.minPrice / 10) * 10}
            max={Math.ceil(facets.maxPrice / 10) * 10}
            step={10}
            value={price ?? Math.ceil(facets.maxPrice / 10) * 10}
            onChange={(e) => setPrice(Number(e.target.value))}
            aria-label="Maximum price per seat"
            className="w-full cursor-pointer accent-brand-600"
          />
          <div className="tabular mt-1 flex justify-between text-[11px] font-medium text-ink-500">
            <span>{formatCurrency(facets.minPrice)}</span>
            <span>{formatCurrency(facets.maxPrice)}</span>
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Operator rating">
        <div className="grid grid-cols-4 gap-1.5">
          {RATINGS.map((r) => (
            <Pill key={r.label} active={rating === r.value} onClick={() => update({ rating: r.value || null })} className="flex items-center justify-center gap-1 px-1">
              {r.value && <Star className="size-3 fill-current" aria-hidden />}
              {r.label}
            </Pill>
          ))}
        </div>
      </FilterGroup>
    </div>
  );

  return (
    <div className="pb-8">
      <div className="border-b border-ink-200 bg-white">
        <div className="container-page py-4">
          <SearchWidget
            key={params.get('from') + '|' + params.get('to') + '|' + params.get('date')}
            variant="compact"
            defaults={criteria ?? { from: params.get('from') ?? '', to: params.get('to') ?? '' }}
            onSearch={(v) => setParams({ from: v.from, to: v.to, date: v.date, passengers: String(v.passengers) })}
          />
        </div>
      </div>

      {!criteria ? (
        <div className="container-page mt-6">
          <Card>
            <EmptyState icon={BusFront} title="Where are you going?" description="Enter a departure city, a destination and a date above to see available buses." />
          </Card>
        </div>
      ) : (
        <div className="container-page mt-6">
          {/* Date strip */}
          <div className="mb-5 flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" disabled={criteria.date <= istDate()} onClick={() => update({ date: shiftDate(criteria.date, -1) })}>
              <ChevronLeft />
            </Button>
            <div className="flex flex-1 gap-2 overflow-x-auto" role="group" aria-label="Choose date">
              {Array.from({ length: 7 }, (_, i) => shiftDate(criteria.date, i - 3))
                .filter((d) => d >= istDate())
                .slice(0, 7)
                .map((d) => {
                  const l = dayLabel(d);
                  const active = d === criteria.date;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ date: d })}
                      className={cn(
                        'min-w-[5.5rem] flex-1 rounded-xl border px-3 py-2 text-center transition-all',
                        active ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300',
                      )}
                    >
                      <span className={cn('block text-[11px] font-semibold uppercase', active ? 'text-brand-100' : 'text-ink-500')}>{l.weekday}</span>
                      <span className="block text-sm font-bold">{l.day}</span>
                    </button>
                  );
                })}
            </div>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => update({ date: shiftDate(criteria.date, 1) })}>
              <ChevronRight />
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
            <aside className="hidden lg:block">
              <Card className="sticky top-20 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <SlidersHorizontal className="size-4" aria-hidden /> Filters
                  </h2>
                  {filterCount > 0 && (
                    <button type="button" onClick={clearFilters} className="text-xs font-semibold text-brand-700 hover:underline">
                      Reset
                    </button>
                  )}
                </div>
                {filters}
              </Card>
            </aside>

            <section aria-live="polite" aria-busy={query.isFetching}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    {criteria.from} <span className="text-ink-300">→</span> {criteria.to}
                  </h1>
                  <p className="text-sm text-ink-500">
                    {query.data ? `${query.data.meta.total} ${query.data.meta.total === 1 ? 'bus' : 'buses'} found` : 'Searching…'} · {criteria.passengers} {criteria.passengers === 1 ? 'seat' : 'seats'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="lg:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
                    <SlidersHorizontal /> Filters{filterCount > 0 && ` (${filterCount})`}
                  </Button>
                  <label className="sr-only" htmlFor="sort">
                    Sort results
                  </label>
                  <Select id="sort" value={`${sort}:${order}`} onChange={(e) => update({ sort: e.target.value })} className="w-48">
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {showFilters && (
                <Card className="mb-4 animate-drawer p-5 lg:hidden">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold">Filters</h2>
                    <button type="button" onClick={() => setShowFilters(false)} className="rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Close filters">
                      <X className="size-4" />
                    </button>
                  </div>
                  {filters}
                </Card>
              )}

              {query.isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-44 rounded-xl" />
                  ))}
                </div>
              ) : query.error ? (
                <Card>
                  <ErrorState error={query.error} onRetry={() => query.refetch()} />
                </Card>
              ) : query.data && query.data.items.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={BusFront}
                    title={filterCount > 0 ? 'No buses match these filters' : 'No buses on this date'}
                    description={filterCount > 0 ? 'Try removing a filter to see more options.' : `We couldn't find buses from ${criteria.from} to ${criteria.to} with ${criteria.passengers} free ${criteria.passengers === 1 ? 'seat' : 'seats'}. Try another day from the strip above.`}
                    action={filterCount > 0 ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
                  />
                </Card>
              ) : (
                <div className={cn('space-y-4 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
                  {query.data?.items.map((trip) => (
                    <TripCard key={trip._id} trip={trip} open={openTripId === trip._id} onToggle={() => setOpenTripId((cur) => (cur === trip._id ? null : trip._id))} onContinue={continueToBook} />
                  ))}
                  {query.data && query.data.meta.totalPages > 1 && (
                    <Card>
                      <Pagination meta={query.data.meta} onPageChange={(p) => update({ page: String(p) })} className="border-t-0" />
                    </Card>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <Sheet open={!!checkoutDraft} onOpenChange={(open) => !open && setCheckoutDraft(null)}>
        {checkoutDraft && (
          <SheetContent title="Complete your booking" description="Passenger details, offers and payment">
            <CheckoutPanel draft={checkoutDraft} onBooked={onBooked} onSeatsLost={onSeatsLost} />
          </SheetContent>
        )}
      </Sheet>
      <BoardingPassModal booking={confirmed} onClose={() => setConfirmed(null)} />
    </div>
  );
}
