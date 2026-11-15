import { cn, formatCurrency } from '@/lib/utils';
import type { Fare } from '@/types';

export const GST_PERCENT = 5;

/**
 * Preview of the fare for the seats currently selected. This mirrors the
 * server formula for display only; the amount actually charged is whatever
 * the server computes at confirmation.
 */
export function estimateFare(baseFare: number, seatFares: number[], taxPercent = GST_PERCENT): Fare {
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const base = round(baseFare * seatFares.length);
  const seatCharges = round(seatFares.reduce((sum, f) => sum + (f - baseFare), 0));
  const taxes = round(((base + seatCharges) * taxPercent) / 100);
  return { baseFare: base, seatCharges, taxPercent, taxes, total: round(base + seatCharges + taxes) };
}

export function FareBreakdown({ fare, seatCount, className, totalLabel = 'Total payable' }: { fare: Fare; seatCount: number; className?: string; totalLabel?: string }) {
  return (
    <dl className={cn('space-y-2 text-sm', className)}>
      <div className="flex justify-between gap-4">
        <dt className="text-ink-600">
          Base fare <span className="text-ink-400">× {seatCount}</span>
        </dt>
        <dd className="tabular font-medium text-ink-900">{formatCurrency(fare.baseFare)}</dd>
      </div>
      {fare.seatCharges > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-ink-600">Seat preference charges</dt>
          <dd className="tabular font-medium text-ink-900">{formatCurrency(fare.seatCharges)}</dd>
        </div>
      )}
      {!!fare.discount && fare.discount > 0 && (
        <div className="flex justify-between gap-4 text-emerald-700">
          <dt>
            Promo <span className="font-mono text-xs font-bold">{fare.promoCode}</span>
          </dt>
          <dd className="tabular font-semibold">− {formatCurrency(fare.discount)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-ink-600">GST ({fare.taxPercent}%)</dt>
        <dd className="tabular font-medium text-ink-900">{formatCurrency(fare.taxes)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-dashed border-ink-200 pt-3">
        <dt className="font-semibold text-ink-950">{totalLabel}</dt>
        <dd className="tabular text-xl font-extrabold text-ink-950">{formatCurrency(fare.total)}</dd>
      </div>
    </dl>
  );
}
