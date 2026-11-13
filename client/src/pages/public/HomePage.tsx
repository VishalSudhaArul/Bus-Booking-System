import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Armchair, BadgeCheck, Clock3, Headset, LockKeyhole, RefreshCcw, Search, ShieldCheck, Star, TicketCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Skeleton } from '@/components/ui/card';
import { SearchWidget } from '@/features/search/SearchWidget';
import { formatCurrency, formatDuration, istDate } from '@/lib/utils';
import { catalogApi } from '@/services';

const BENEFITS = [
  { icon: Armchair, title: 'Pick your exact seat', text: 'See the real layout of every bus — window, aisle, upper or lower berth — and choose the seat you want.' },
  { icon: TicketCheck, title: 'Instant e-ticket', text: 'Your booking is confirmed in seconds with a unique PNR and a printable digital ticket.' },
  { icon: RefreshCcw, title: 'Clear cancellation rules', text: 'Know exactly what you get back before you cancel. No hidden deductions, no surprises.' },
  { icon: Headset, title: 'Operators you can trust', text: 'Every operator on BusNest is verified, rated by travellers and reachable from your ticket.' },
];

const STEPS = [
  { icon: Search, title: 'Search your route', text: 'Enter where you are travelling and when. Filter by bus type, timing and price.' },
  { icon: Armchair, title: 'Choose seats', text: 'Select seats on a live seat map that always shows current availability.' },
  { icon: TicketCheck, title: 'Confirm & travel', text: 'Add passenger details, confirm, and board with your digital ticket.' },
];

const TRUST = [
  { icon: ShieldCheck, title: 'No double bookings', text: 'Seat allocation is enforced by the database itself. Two people can never be sold the same seat.' },
  { icon: LockKeyhole, title: 'Your account is protected', text: 'Passwords are hashed, sessions expire, and you only ever see your own bookings.' },
  { icon: BadgeCheck, title: 'Transparent pricing', text: 'The fare you see includes seat charges and taxes, broken down before you pay.' },
];

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h2>
      {text && <p className="mt-2 text-ink-600">{text}</p>}
    </div>
  );
}

export function HomePage() {
  const popular = useQuery({ queryKey: ['popular-routes'], queryFn: catalogApi.popularRoutes, staleTime: 5 * 60_000 });
  const operators = useQuery({ queryKey: ['public-operators'], queryFn: catalogApi.operators, staleTime: 5 * 60_000 });

  return (
    <>
      {/* Hero */}
      <section className="relative bg-brand-900">
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-700/40 blur-3xl" />
          <div className="absolute -bottom-32 left-1/4 size-80 rounded-full bg-accent-500/10 blur-3xl" />
          <svg className="absolute inset-x-0 bottom-0 h-24 w-full text-brand-800/60" viewBox="0 0 1200 96" preserveAspectRatio="none">
            <path fill="currentColor" d="M0 96V60l80-18 60 12 90-34 70 22 100-30 90 26 110-40 100 34 90-20 120 28 110-30 80 22 100-16v80z" />
          </svg>
        </div>
        <div className="container-page relative pb-28 pt-14 sm:pt-20 lg:pb-32">
          <div className="max-w-2xl animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/15">
              <span className="size-1.5 rounded-full bg-accent-400" /> Live seat availability on every bus
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] text-white sm:text-5xl">
              Book your bus seat <span className="text-accent-400">with certainty.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-brand-100/90">
              Compare trusted operators, choose the exact seat you want and get a confirmed e-ticket in under a minute.
            </p>
          </div>
        </div>
      </section>

      {/* Search widget overlaps the hero */}
      <section className="container-page relative z-10 -mt-20 lg:-mt-16" aria-label="Search">
        <SearchWidget />
      </section>

      {/* Popular routes */}
      <section className="container-page mt-16">
        <SectionHeading eyebrow="Popular routes" title="Where travellers are heading" text="Tap a route to see tomorrow's departures." />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {popular.isLoading
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-card" />)
            : (popular.data ?? []).map((r) => (
                <Link
                  key={`${r.sourceCity}-${r.destinationCity}`}
                  to={`/search?${new URLSearchParams({ from: r.sourceCity, to: r.destinationCity, date: istDate(1), passengers: '1' })}`}
                  className="group rounded-card border border-ink-100 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-ink-950">
                        {r.sourceCity} <span className="text-ink-300">→</span> {r.destinationCity}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                        <Clock3 className="size-3.5" aria-hidden /> {formatDuration(r.durationMinutes)} · {r.distanceKm} km
                      </p>
                    </div>
                    <span className="flex size-8 items-center justify-center rounded-full bg-ink-50 text-ink-500 transition-colors group-hover:bg-brand-700 group-hover:text-white">
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </div>
                  <p className="mt-4 text-xs text-ink-500">
                    from <span className="tabular text-lg font-extrabold text-ink-950">{formatCurrency(r.minFare)}</span>
                  </p>
                </Link>
              ))}
          {!popular.isLoading && (popular.data ?? []).length === 0 && (
            <p className="col-span-full rounded-card border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">Routes will appear here once trips are scheduled.</p>
          )}
        </div>
      </section>

      {/* Benefits */}
      <section className="container-page mt-20">
        <SectionHeading eyebrow="Why BusNest" title="Booking that respects your time" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <Card key={b.title} className="p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <b.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{b.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{b.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20 border-y border-ink-100 bg-white py-16">
        <div className="container-page">
          <SectionHeading eyebrow="How it works" title="Three steps to your seat" />
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-4">
                <span className="tabular flex size-11 shrink-0 items-center justify-center rounded-full bg-ink-950 text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <s.icon className="size-4 text-brand-600" aria-hidden /> {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.text}</p>
                </div>
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
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-card" />)
            : (operators.data?.items ?? []).map((o) => (
                <Card key={o._id} className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-ink-950 text-xs font-bold tracking-wide text-accent-400">{o.code}</span>
                    <span className="tabular inline-flex items-center gap-1 text-sm font-bold text-ink-900">
                      <Star className="size-4 fill-accent-500 text-accent-500" aria-hidden /> {o.rating.toFixed(1)}
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
        <div className="rounded-panel bg-ink-950 p-8 sm:p-12">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-400">Trust & safety</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Built so your booking is never in doubt</h2>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-card bg-white/5 p-5 ring-1 ring-inset ring-white/10">
                <t.icon className="size-6 text-accent-400" aria-hidden />
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
