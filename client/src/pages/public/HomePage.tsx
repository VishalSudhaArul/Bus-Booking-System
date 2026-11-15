import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Armchair, BadgeCheck, Clock3, Headset, LockKeyhole, RefreshCcw, Search, ShieldCheck, Star, TicketCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Skeleton } from '@/components/ui/card';
import { SearchWidget } from '@/features/search/SearchWidget';
import { formatCurrency, formatDuration, istDate } from '@/lib/utils';
import { catalogApi } from '@/services';

const BENEFITS = [
  { icon: Armchair, title: 'Pick your exact seat', text: 'See the real layout of every bus — window, aisle, upper or lower berth, ladies-only seats — and choose yours.' },
  { icon: TicketCheck, title: 'Instant boarding pass', text: 'Confirmed in seconds with a unique PNR and a QR boarding pass you can save or print.' },
  { icon: RefreshCcw, title: 'Clear cancellations', text: 'See exactly what you get back before you cancel. No hidden deductions.' },
  { icon: Headset, title: 'Verified operators', text: 'Every operator is rated by travellers and reachable straight from your ticket.' },
];

const STEPS = [
  { icon: Search, title: 'Search', text: 'Enter your route and date, then filter by time, bus type, price and rating.' },
  { icon: Armchair, title: 'Choose seats', text: 'Open any bus to see its live seat map and pick your seats and stops.' },
  { icon: TicketCheck, title: 'Board', text: 'Add passenger details, confirm, and show your QR boarding pass.' },
];

const TRUST = [
  { icon: ShieldCheck, title: 'No double bookings', text: 'Seat allocation is enforced by the database itself — a seat can never be sold twice.' },
  { icon: LockKeyhole, title: 'Your account is protected', text: 'Hashed passwords, expiring sessions, and you only ever see your own bookings.' },
  { icon: BadgeCheck, title: 'Transparent pricing', text: 'Seat charges, promo discounts and taxes are itemised before you pay.' },
];

function SectionHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {text && <p className="mt-2 text-ink-600">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export function HomePage() {
  const popular = useQuery({ queryKey: ['popular-routes'], queryFn: catalogApi.popularRoutes, staleTime: 5 * 60_000 });
  const operators = useQuery({ queryKey: ['public-operators'], queryFn: catalogApi.operators, staleTime: 5 * 60_000 });
  const cities = useQuery({ queryKey: ['cities'], queryFn: catalogApi.cities, staleTime: 10 * 60_000 });
  const buses = operators.data?.items.reduce((n, o) => n + (o.busCount ?? 0), 0);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-600">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -right-32 -top-40 size-[34rem] rounded-full bg-brand-500/60 blur-3xl" />
          <div className="absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-brand-800/50 blur-3xl" />
          <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0v32" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
        </div>
        <div className="container-page relative pb-36 pt-14 sm:pt-20 lg:pb-40">
          <div className="max-w-2xl animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/20">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" /> Live seat availability on every bus
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Travel India by bus,
              <br />
              <span className="text-brand-100">your seat guaranteed.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-brand-50/90">Compare trusted operators, pick the exact seat you want and get a QR boarding pass in under a minute.</p>
          </div>
        </div>
      </section>

      {/* Floating search card */}
      <section className="container-page relative z-10 -mt-28" aria-label="Search">
        <SearchWidget />
        <dl className="mt-6 grid grid-cols-3 gap-3 text-center sm:mx-auto sm:max-w-2xl">
          {[
            [cities.data?.length, 'Cities connected'],
            [operators.data?.meta.total, 'Verified operators'],
            [buses, 'Buses in service'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-xl border border-ink-200 bg-white px-3 py-3 shadow-card">
              <dt className="text-xs font-medium text-ink-500">{label}</dt>
              <dd className="tabular text-lg font-extrabold text-ink-900">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Popular routes */}
      <section className="container-page mt-20">
        <SectionHeading eyebrow="Popular routes" title="Where travellers are heading" text="Tap a route to see tomorrow's departures." />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {popular.isLoading
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            : (popular.data ?? []).map((r) => (
                <Link
                  key={`${r.sourceCity}-${r.destinationCity}`}
                  to={`/search?${new URLSearchParams({ from: r.sourceCity, to: r.destinationCity, date: istDate(1), passengers: '1' })}`}
                  className="group rounded-xl border border-ink-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-base font-bold text-ink-900">
                        <span className="truncate">{r.sourceCity}</span>
                        <ArrowRight className="size-4 shrink-0 text-ink-300" aria-hidden />
                        <span className="truncate">{r.destinationCity}</span>
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                        <Clock3 className="size-3.5" aria-hidden /> {formatDuration(r.durationMinutes)} · {r.distanceKm} km · {r.trips} departures
                      </p>
                    </div>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-5 text-xs text-ink-500">
                    from <span className="tabular text-xl font-extrabold text-ink-900">{formatCurrency(r.minFare)}</span>
                  </p>
                </Link>
              ))}
          {!popular.isLoading && (popular.data ?? []).length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-ink-300 p-8 text-center text-sm text-ink-500">Routes will appear here once trips are scheduled.</p>
          )}
        </div>
      </section>

      {/* Benefits */}
      <section className="container-page mt-20">
        <SectionHeading eyebrow="Why BusNest" title="Booking that respects your time" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <Card key={b.title} className="p-5 transition-shadow hover:shadow-raised">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <b.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{b.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{b.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20 border-y border-ink-200 bg-white py-16">
        <div className="container-page">
          <SectionHeading eyebrow="How it works" title="Three steps to your seat" />
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="tabular flex size-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-md shadow-brand-600/25">{i + 1}</span>
                  {i < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-gradient-to-r from-brand-200 to-transparent md:block" aria-hidden />}
                </div>
                <h3 className="mt-4 flex items-center gap-2 text-base font-semibold">
                  <s.icon className="size-4 text-brand-600" aria-hidden /> {s.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Operators */}
      <section className="container-page mt-20">
        <SectionHeading eyebrow="Featured operators" title="Travel with rated, verified partners" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {operators.isLoading
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
            : (operators.data?.items ?? []).map((o) => (
                <Card key={o._id} className="p-5 transition-shadow hover:shadow-raised">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-ink-900 text-xs font-bold tracking-wide text-white">{o.code}</span>
                    <span className="tabular inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <Star className="size-3 fill-current" aria-hidden /> {o.rating.toFixed(1)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{o.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-600">{o.description}</p>
                  <p className="mt-3 text-xs font-medium text-ink-500">{o.busCount ?? 0} buses in service</p>
                </Card>
              ))}
        </div>
      </section>

      {/* Trust */}
      <section className="container-page mt-20">
        <div className="relative overflow-hidden rounded-2xl bg-ink-900 p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-300">Trust & safety</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Built so your booking is never in doubt</h2>
          </div>
          <div className="relative mt-8 grid gap-4 md:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-xl bg-white/5 p-5 ring-1 ring-inset ring-white/10">
                <t.icon className="size-6 text-brand-300" aria-hidden />
                <h3 className="mt-3 text-base font-semibold text-white">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
