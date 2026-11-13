import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, Skeleton } from '@/components/ui/card';
import { PolicyTable } from '@/features/cancellations/CancelBookingDialog';
import { catalogApi } from '@/services';

const FAQ = [
  { q: 'How do I book a ticket?', a: 'Search for your route and date, open a bus to see its seat map, select your seats, add passenger details and confirm. Your e-ticket with a PNR appears immediately and stays in My bookings.' },
  { q: 'Can someone else book the seat I am looking at?', a: 'Until you confirm, yes — seats are sold first come, first served. The seat map refreshes automatically, and availability is checked again on our servers at the moment you confirm, so a seat can never be sold twice.' },
  { q: 'What happens if I click "Confirm booking" twice or my connection drops?', a: 'Nothing bad. Every checkout carries a unique request key, so repeating the same request returns your original booking instead of creating a second one.' },
  { q: 'How do I cancel a booking?', a: 'Open the booking from My bookings and choose Cancel booking. You will see exactly how much will be refunded before you confirm. Your seats are released for other travellers once the cancellation is recorded.' },
  { q: 'Are payments real?', a: 'No. BusNest is a demonstration project: payments and refunds are simulated and no card details are collected.' },
  { q: 'What if the operator cancels the trip?', a: 'Every confirmed booking on that trip is cancelled automatically with a full refund.' },
];

export function HelpPage() {
  const policy = useQuery({ queryKey: ['cancellation-policy'], queryFn: catalogApi.policy, staleTime: 10 * 60_000 });
  return (
    <div className="container-page max-w-4xl py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">About & help</p>
      <h1 className="mt-2 text-3xl font-bold">Travel made predictable</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        BusNest is an intercity bus booking platform. Passengers search, pick exact seats and get an instant ticket; operators and administrators run buses, routes, trips and fares from a single console with live manifests and
        occupancy reports.
      </p>

      <section id="cancellation" className="mt-12 scroll-mt-24">
        <h2 className="text-xl font-bold">Cancellation & refund policy</h2>
        <p className="mt-1.5 text-sm text-ink-600">The refund depends on how long before departure you cancel. The exact amount is always shown before you confirm.</p>
        <Card className="mt-4">
          <CardContent>{policy.data ? <PolicyTable policy={policy.data} /> : <Skeleton className="h-40 w-full" />}</CardContent>
        </Card>
      </section>

      <section id="faq" className="mt-12 scroll-mt-24">
        <h2 className="text-xl font-bold">Frequently asked questions</h2>
        <div className="mt-4 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-card border border-ink-100 bg-white shadow-card open:shadow-raised">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-ink-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-700">
        <Compass className="size-8" aria-hidden />
      </span>
      <p className="tabular mt-6 text-sm font-bold uppercase tracking-widest text-brand-700">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold">This stop isn't on our route</h1>
      <p className="mt-2 max-w-md text-ink-600">The page you're looking for doesn't exist or has moved. Let's get you back on the road.</p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/">Search buses</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/help">Help centre</Link>
        </Button>
      </div>
    </div>
  );
}
