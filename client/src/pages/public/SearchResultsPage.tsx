import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BusFront, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState } from '@/components/common/feedback';
import { Pagination } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { SearchWidget, searchSchema } from '@/features/search/SearchWidget';
import { TripCard } from '@/features/trips/TripCard';
import { cn, formatDay, titleCase } from '@/lib/utils';
import { tripApi } from '@/services';

const SORTS = [
  { value: 'departure:asc', label: 'Departure: earliest first' },
  { value: 'departure:desc', label: 'Departure: latest first' },
  { value: 'arrival:asc', label: 'Arrival: earliest first' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'seats:desc', label: 'Most seats available' },
  { value: 'duration:asc', label: 'Shortest journey' },
  { value: 'rating:desc', label: 'Top rated operators' },
];
const BUS_TYPES = ['SEATER', 'SEMI_SLEEPER', 'SLEEPER'];
const SLOTS = [
  { value: 'EARLY', label: 'Before 6 AM' },
  { value: 'MORNING', label: '6 AM – 12 PM' },
  { value: 'AFTERNOON', label: '12 PM – 6 PM' },
  { value: 'NIGHT', label: 'After 6 PM' },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50')}
    >
      {children}
    </button>
  );
}

export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const parsed = searchSchema.safeParse({ from: params.get('from') ?? '', to: params.get('to') ?? '', date: params.get('date') ?? '', passengers: params.get('passengers') ?? '1' });
  const list = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const [sort, order] = (params.get('sort') ?? 'departure:asc').split(':');
  const busTypes = list('busType');
  const slots = list('slot');
  const ac = params.get('ac') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const filterCount = busTypes.length + slots.length + (ac ? 1 : 0);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  const toggle = (key: string, current: string[], value: string) => update({ [key]: (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).join(',') || null });

  const criteria = parsed.success ? parsed.data : null;
  const query = useQuery({
    queryKey: ['trip-search', criteria, sort, order, busTypes.join(), slots.join(), ac, page],
    queryFn: () => tripApi.search({ ...criteria!, sort, order, busType: busTypes, departureSlot: slots, ac: ac || undefined, page, limit: 8 }),
    enabled: !!criteria,
    placeholderData: keepPreviousData,
    // Availability moves; refresh quietly so the list never goes badly stale.
    refetchInterval: 60_000,
  });

  const filters = (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Bus type</h3>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {BUS_TYPES.map((t) => (
            <Chip key={t} active={busTypes.includes(t)} onClick={() => toggle('busType', busTypes, t)}>
              {titleCase(t)}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Air conditioning</h3>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Chip active={ac === 'true'} onClick={() => update({ ac: ac === 'true' ? null : 'true' })}>A/C</Chip>
          <Chip active={ac === 'false'} onClick={() => update({ ac: ac === 'false' ? null : 'false' })}>Non A/C</Chip>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Departure time</h3>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {SLOTS.map((s) => (
            <Chip key={s.value} active={slots.includes(s.value)} onClick={() => toggle('slot', slots, s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      {filterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => update({ busType: null, slot: null, ac: null })}>
          <X /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container-page py-6">
      <SearchWidget
        key={params.get('from') + '|' + params.get('to') + '|' + params.get('date')}
        variant="compact"
        defaults={criteria ?? { from: params.get('from') ?? '', to: params.get('to') ?? '' }}
        onSearch={(v) => setParams({ from: v.from, to: v.to, date: v.date, passengers: String(v.passengers) })}
      />

      {!criteria ? (
        <Card className="mt-6">
          <EmptyState icon={BusFront} title="Tell us where you're going" description="Enter a departure city, a destination and a journey date above to see available buses." />
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="hidden lg:block">
            <Card className="sticky top-24 p-5">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-bold">
                <SlidersHorizontal className="size-4" aria-hidden /> Filters
              </h2>
              {filters}
            </Card>
          </aside>

          <section aria-live="polite" aria-busy={query.isFetching}>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">
                  {criteria.from} <span className="text-ink-400">→</span> {criteria.to}
                </h1>
                <p className="text-sm text-ink-500">
                  {formatDay(`${criteria.date}T12:00:00+05:30`)} · {criteria.passengers} {criteria.passengers === 1 ? 'seat' : 'seats'}
                  {query.data && ` · ${query.data.meta.total} ${query.data.meta.total === 1 ? 'bus' : 'buses'} found`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="lg:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
                  <SlidersHorizontal /> Filters{filterCount > 0 && ` (${filterCount})`}
                </Button>
                <label className="sr-only" htmlFor="sort">Sort results</label>
                <Select id="sort" value={`${sort}:${order}`} onChange={(e) => update({ sort: e.target.value })} className="w-56">
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            {showFilters && <Card className="mb-4 animate-fade-up p-5 lg:hidden">{filters}</Card>}

            {query.isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-44 rounded-card" />
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
                  title={filterCount > 0 ? 'No buses match these filters' : 'No buses found for this journey'}
                  description={filterCount > 0 ? 'Try removing a filter to see more options.' : `We couldn't find buses from ${criteria.from} to ${criteria.to} with ${criteria.passengers} free ${criteria.passengers === 1 ? 'seat' : 'seats'} on this date. Try another date or a nearby city.`}
                  action={filterCount > 0 ? <Button variant="outline" onClick={() => update({ busType: null, slot: null, ac: null })}>Clear filters</Button> : undefined}
                />
              </Card>
            ) : (
              <div className={cn('space-y-4 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
                {query.data?.items.map((trip) => <TripCard key={trip._id} trip={trip} passengers={criteria.passengers} />)}
                {query.data && query.data.meta.totalPages > 1 && (
                  <Card>
                    <Pagination meta={query.data.meta} onPageChange={(p) => update({ page: String(p) })} className="border-t-0" />
                  </Card>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
