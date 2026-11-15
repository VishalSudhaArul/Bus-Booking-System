import { BusFront, MapPin, Phone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/common/feedback';
import { Logo } from '@/components/common/layout';
import { Skeleton } from '@/components/ui/card';
import { busTypeLabel, cn, formatCurrency, formatDateTime, formatDay, formatDuration, formatTime, titleCase } from '@/lib/utils';
import type { Booking } from '@/types';
import { FareBreakdown } from './FareSummary';

/** QR code linking to this booking in the app (scan to open the ticket). */
export function BookingQr({ booking, size = 148 }: { booking: Booking; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const url = `${window.location.origin}/account/bookings/${booking._id}`;
    QRCode.toDataURL(url, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((data) => alive && setSrc(data))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [booking._id, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={`QR code for booking ${booking.pnr}`} className="rounded-lg" />
  ) : (
    <Skeleton className="rounded-lg" style={{ width: size, height: size }} />
  );
}

function Stop({ label, time, name, landmark, align = 'left' }: { label: string; time: string | null; name: string; landmark?: string; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">{label}</p>
      <p className="tabular mt-1 text-3xl font-extrabold tracking-tight text-ink-900">{formatTime(time)}</p>
      <p className="text-xs font-medium text-ink-500">{formatDay(time)}</p>
      <p className={cn('mt-2 flex items-start gap-1 text-sm font-semibold text-ink-800', align === 'right' && 'justify-end')}>
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
        {name}
      </p>
      {landmark && <p className="text-xs text-ink-500">{landmark}</p>}
    </div>
  );
}

/** Digital boarding pass: printable, with a QR code and a tear-off stub. */
export function Ticket({ booking }: { booking: Booking }) {
  const cancelled = booking.status === 'CANCELLED';
  const duration = booking.trip ? Math.round((new Date(booking.trip.arrivalTime).getTime() - new Date(booking.trip.departureTime).getTime()) / 60_000) : 0;

  return (
    <article className="print-area relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-raised" aria-label={`Boarding pass ${booking.pnr}`}>
      {/* Header band */}
      <header className="relative overflow-hidden bg-brand-600 px-6 py-5 text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-500/60 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo tone="light" />
            <span className="hidden h-6 w-px bg-white/30 sm:block" aria-hidden />
            <p className="hidden text-xs font-bold uppercase tracking-widest text-brand-100 sm:block">Boarding pass</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-100">PNR</p>
            <p className="font-mono text-2xl font-bold tracking-wider">{booking.pnr}</p>
          </div>
        </div>
      </header>

      {cancelled && (
        <div className="bg-red-50 px-6 py-2.5 text-center text-sm font-semibold text-red-800" role="status">
          Cancelled on {formatDateTime(booking.cancelledAt)} — not valid for travel.
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_15rem]">
        <div className="space-y-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {booking.route.sourceCity} <span className="text-ink-300">→</span> {booking.route.destinationCity}
            </h2>
            <StatusBadge status={booking.status} />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <Stop label="Boarding" time={booking.boardingPoint.time} name={booking.boardingPoint.name} landmark={booking.boardingPoint.landmark} />
            <div className="flex flex-col items-center gap-1 pt-8">
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{formatDuration(duration)}</span>
              <span className="flex items-center gap-1 text-brand-600" aria-hidden>
                <span className="h-px w-6 bg-ink-300 sm:w-12" />
                <BusFront className="size-4" />
                <span className="h-px w-6 bg-ink-300 sm:w-12" />
              </span>
            </div>
            <Stop label="Dropping" time={booking.droppingPoint.time} name={booking.droppingPoint.name} landmark={booking.droppingPoint.landmark} align="right" />
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-xl bg-ink-50 p-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Operator</dt>
              <dd className="mt-0.5 font-semibold text-ink-900">{booking.operator.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Bus</dt>
              <dd className="mt-0.5 font-semibold text-ink-900">{booking.trip ? busTypeLabel(booking.trip.bus.busType, booking.trip.bus.isAC) : '—'}</dd>
              <dd className="font-mono text-[11px] text-ink-500">{booking.trip?.bus.registrationNumber}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Seats</dt>
              <dd className="tabular mt-0.5 font-bold text-brand-700">{booking.passengers.map((p) => p.seatNumber).join(', ')}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Booked</dt>
              <dd className="mt-0.5 font-semibold text-ink-900">{formatDateTime(booking.createdAt)}</dd>
            </div>
          </dl>

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Passengers</h3>
            <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200">
              {booking.passengers.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink-900">{p.name}</span>
                    <span className="ml-2 text-xs text-ink-500">
                      {p.age} · {titleCase(p.gender)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular text-xs text-ink-500">{formatCurrency(p.fare)}</span>
                    <span className="tabular rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{p.seatNumber}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-500">
              Contact: {booking.contactEmail} · {booking.contactPhone}
              {booking.operator.contactPhone && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Phone className="size-3" aria-hidden /> Operator {booking.operator.contactPhone}
                </span>
              )}
            </p>
          </section>
        </div>

        {/* Stub */}
        <aside className="relative flex flex-col border-t border-dashed border-ink-300 bg-ink-50/60 p-6 md:border-l md:border-t-0">
          <span className="absolute -left-3 -top-3 hidden size-6 rounded-full bg-canvas md:block" aria-hidden />
          <span className="absolute -bottom-3 -left-3 hidden size-6 rounded-full bg-canvas md:block" aria-hidden />
          <div className={cn('mx-auto flex flex-col items-center rounded-xl bg-white p-3 shadow-card', cancelled && 'opacity-30 grayscale')}>
            <BookingQr booking={booking} />
            <p className="mt-2 font-mono text-[11px] font-semibold tracking-[0.25em] text-ink-500">{booking.pnr}</p>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-500">Show this QR code when boarding</p>

          <div className="mt-6">
            <FareBreakdown fare={booking.fare} seatCount={booking.seatCount} totalLabel="Total paid" />
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-ink-500">Payment ({titleCase(booking.payment.method)})</span>
              <StatusBadge status={booking.payment.status} />
            </div>
            <p className="mt-1 font-mono text-[10px] text-ink-400">{booking.payment.reference}</p>
          </div>

          {booking.cancellation && (
            <div className="mt-4 rounded-xl border border-red-100 bg-white p-3 text-sm">
              <p className="font-semibold text-ink-900">Refund</p>
              <div className="mt-1.5 flex justify-between">
                <span className="text-ink-600">Refunded ({booking.cancellation.refundPercent}%)</span>
                <span className="tabular font-semibold text-ink-900">{formatCurrency(booking.cancellation.refundAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-600">Cancellation fee</span>
                <span className="tabular font-semibold text-ink-900">{formatCurrency(booking.cancellation.cancellationFee)}</span>
              </div>
              {booking.cancellation.refundReference && <p className="mt-1 font-mono text-[10px] text-ink-400">{booking.cancellation.refundReference}</p>}
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-ink-100 px-6 py-3 text-[11px] leading-relaxed text-ink-500">
        Reach the boarding point 15 minutes before departure with a valid photo ID. Payment and refunds on BusNest are simulated for demonstration.
      </footer>
    </article>
  );
}
