import { BusFront, MapPin, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/common/feedback';
import { Logo } from '@/components/common/layout';
import { busTypeLabel, cn, formatCurrency, formatDateTime, formatDay, formatDuration, formatTime, titleCase } from '@/lib/utils';
import type { Booking } from '@/types';
import { FareBreakdown } from './FareSummary';

/** Decorative barcode derived from the PNR (visual only). */
function Barcode({ value }: { value: string }) {
  const bars = [...value].flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2), 1 + ((n >> 3) % 3), 1 + ((n >> 1) % 2)];
  });
  return (
    <div className="flex h-12 items-stretch gap-[2px]" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className={i % 2 === 0 ? 'bg-ink-900' : 'bg-transparent'} style={{ width: w * 1.5 }} />
      ))}
    </div>
  );
}

function Point({ label, time, name, landmark, align = 'left' }: { label: string; time: string | null; name: string; landmark?: string; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'sm:text-right')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold text-ink-950">{formatTime(time)}</p>
      <p className="text-xs font-medium text-ink-500">{formatDay(time)}</p>
      <p className={cn('mt-2 flex items-start gap-1.5 text-sm font-semibold text-ink-800', align === 'right' && 'sm:justify-end')}>
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
        {name}
      </p>
      {landmark && <p className="text-xs text-ink-500">{landmark}</p>}
    </div>
  );
}

export function Ticket({ booking }: { booking: Booking }) {
  const cancelled = booking.status === 'CANCELLED';
  const duration = booking.trip ? Math.round((new Date(booking.trip.arrivalTime).getTime() - new Date(booking.trip.departureTime).getTime()) / 60_000) : 0;

  return (
    <article className={cn('print-area relative overflow-hidden rounded-panel border border-ink-100 bg-white shadow-raised', cancelled && 'opacity-95')} aria-label={`Ticket ${booking.pnr}`}>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 bg-ink-950 px-6 py-5 text-white">
        <div className="flex items-center gap-4">
          <Logo tone="light" />
          <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden />
          <p className="hidden text-sm font-medium text-ink-300 sm:block">E-ticket</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">PNR</p>
          <p className="font-mono text-xl font-bold tracking-wider text-accent-400">{booking.pnr}</p>
        </div>
      </header>

      {cancelled && (
        <div className="bg-red-50 px-6 py-2.5 text-center text-sm font-semibold text-red-800" role="status">
          This booking was cancelled on {formatDateTime(booking.cancelledAt)}. This ticket is not valid for travel.
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_18rem]">
        <div className="space-y-6 p-6">
          {/* Journey */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                {booking.route.sourceCity} <span className="text-ink-400">→</span> {booking.route.destinationCity}
              </h2>
              <StatusBadge status={booking.status} />
            </div>
            <div className="mt-5 grid grid-cols-1 items-start gap-5 sm:grid-cols-[1fr_auto_1fr]">
              <Point label="Boarding" time={booking.boardingPoint.time} name={booking.boardingPoint.name} landmark={booking.boardingPoint.landmark} />
              <div className="hidden flex-col items-center gap-1 pt-7 sm:flex">
                <span className="text-[11px] font-semibold text-ink-500">{formatDuration(duration)}</span>
                <span className="h-px w-20 bg-[repeating-linear-gradient(90deg,var(--color-ink-300)_0_4px,transparent_4px_8px)]" aria-hidden />
                <BusFront className="size-4 text-ink-400" aria-hidden />
              </div>
              <Point label="Dropping" time={booking.droppingPoint.time} name={booking.droppingPoint.name} landmark={booking.droppingPoint.landmark} align="right" />
            </div>
          </section>

          {/* Operator */}
          <section className="grid gap-4 rounded-xl bg-ink-50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Operator</p>
              <p className="mt-0.5 text-sm font-semibold text-ink-900">{booking.operator.name}</p>
              {booking.operator.contactPhone && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                  <Phone className="size-3" aria-hidden /> {booking.operator.contactPhone}
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Bus</p>
              <p className="mt-0.5 text-sm font-semibold text-ink-900">{booking.trip?.bus.name ?? '—'}</p>
              <p className="mt-0.5 text-xs text-ink-500">{booking.trip ? `${busTypeLabel(booking.trip.bus.busType, booking.trip.bus.isAC)} · ${booking.trip.bus.registrationNumber}` : ''}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Seats</p>
              <p className="tabular mt-0.5 text-sm font-bold text-ink-900">{booking.passengers.map((p) => p.seatNumber).join(', ')}</p>
              <p className="mt-0.5 text-xs text-ink-500">Booked {formatDateTime(booking.createdAt)}</p>
            </div>
          </section>

          {/* Passengers */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Passengers</h3>
            <div className="mt-2 overflow-hidden rounded-xl border border-ink-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50 text-xs font-semibold text-ink-500">
                  <tr>
                    <th scope="col" className="px-4 py-2">Name</th>
                    <th scope="col" className="px-4 py-2">Age</th>
                    <th scope="col" className="px-4 py-2">Gender</th>
                    <th scope="col" className="px-4 py-2">Seat</th>
                    <th scope="col" className="px-4 py-2 text-right">Fare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {booking.passengers.map((p) => (
                    <tr key={p._id}>
                      <td className="px-4 py-2.5 font-medium text-ink-900">{p.name}</td>
                      <td className="tabular px-4 py-2.5 text-ink-700">{p.age}</td>
                      <td className="px-4 py-2.5 text-ink-700">{titleCase(p.gender)}</td>
                      <td className="tabular px-4 py-2.5 font-bold text-ink-900">{p.seatNumber}</td>
                      <td className="tabular px-4 py-2.5 text-right text-ink-700">{formatCurrency(p.fare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Contact: {booking.contactEmail} · {booking.contactPhone}
            </p>
          </section>
        </div>

        {/* Stub */}
        <aside className="relative border-t border-dashed border-ink-200 bg-ink-50/50 p-6 xl:border-l xl:border-t-0">
          <span className="absolute -left-3 -top-3 hidden size-6 rounded-full bg-canvas xl:block" aria-hidden />
          <span className="absolute -bottom-3 -left-3 hidden size-6 rounded-full bg-canvas xl:block" aria-hidden />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Fare breakdown</h3>
          <FareBreakdown fare={booking.fare} seatCount={booking.seatCount} className="mt-3" totalLabel="Total paid" />
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-ink-500">Payment ({titleCase(booking.payment.method)})</span>
            <StatusBadge status={booking.payment.status} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-ink-400">{booking.payment.reference}</p>

          {booking.cancellation && (
            <div className="mt-5 rounded-xl border border-red-100 bg-white p-3 text-sm">
              <p className="font-semibold text-ink-900">Refund</p>
              <div className="mt-1.5 flex justify-between">
                <span className="text-ink-600">Refunded ({booking.cancellation.refundPercent}%)</span>
                <span className="tabular font-semibold text-ink-900">{formatCurrency(booking.cancellation.refundAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-600">Cancellation fee</span>
                <span className="tabular font-semibold text-ink-900">{formatCurrency(booking.cancellation.cancellationFee)}</span>
              </div>
              {booking.cancellation.refundReference && <p className="mt-1 font-mono text-[11px] text-ink-400">{booking.cancellation.refundReference}</p>}
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-1.5 border-t border-dashed border-ink-200 pt-5">
            <Barcode value={booking.pnr} />
            <p className="font-mono text-xs tracking-[0.3em] text-ink-500">{booking.pnr}</p>
          </div>
        </aside>
      </div>

      <footer className="border-t border-ink-100 px-6 py-3 text-[11px] leading-relaxed text-ink-500">
        Please reach the boarding point 15 minutes before departure and carry a valid photo ID. Payment and refunds on BusNest are simulated for demonstration.
      </footer>
    </article>
  );
}
