import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { bookingApi } from '@/services';
import type { CancellationPolicy } from '@/types';

const REASONS = ['Change of travel plans', 'Booked by mistake', 'Found a better option', 'Medical or family emergency', 'Other'];

export function PolicyTable({ policy, activePercent }: { policy: CancellationPolicy; activePercent?: number }) {
  const tiers = [...policy.tiers].sort((a, b) => b.minHours - a.minHours);
  return (
    <div className="overflow-hidden rounded-xl border border-ink-100 text-sm">
      <table className="w-full">
        <thead className="bg-ink-50 text-left text-xs font-semibold text-ink-500">
          <tr>
            <th scope="col" className="px-3 py-2">Time before departure</th>
            <th scope="col" className="px-3 py-2 text-right">Refund</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {tiers.map((t, i) => {
            const upper = tiers[i - 1]?.minHours;
            const lower = Math.max(t.minHours, policy.cutoffHours);
            const label = upper === undefined ? `${t.minHours} hours or more` : `${lower} to ${upper} hours`;
            return (
              <tr key={t.minHours} className={cn(activePercent === t.refundPercent && 'bg-brand-50 font-semibold text-brand-900')}>
                <td className="px-3 py-2">{label}</td>
                <td className="tabular px-3 py-2 text-right">{t.refundPercent === 0 ? 'No refund' : `${t.refundPercent}%`}</td>
              </tr>
            );
          })}
          <tr className="text-ink-500">
            <td className="px-3 py-2">Less than {policy.cutoffHours} hours</td>
            <td className="px-3 py-2 text-right">Cannot be cancelled</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Shows the server-calculated refund first; the passenger confirms only after seeing it. */
export function CancelBookingDialog({ bookingId, pnr, open, onOpenChange }: { bookingId: string; pnr: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const quote = useQuery({ queryKey: ['cancellation-quote', bookingId], queryFn: () => bookingApi.quote(bookingId), enabled: open, staleTime: 0, gcTime: 0 });

  const finalReason = reason === 'Other' ? note.trim() : reason;
  const cancel = useMutation({
    mutationFn: () => bookingApi.cancel(bookingId, finalReason),
    onSuccess: ({ cancellation }) => {
      toast.success('Booking cancelled', {
        description: cancellation.refundAmount > 0 ? `${formatCurrency(cancellation.refundAmount)} will be refunded to your original payment method.` : 'No refund applies to this cancellation.',
      });
      queryClient.invalidateQueries();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error('Could not cancel booking', { description: errorMessage(err) });
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      quote.refetch();
    },
  });

  const q = quote.data;
  return (
    <Dialog open={open} onOpenChange={(v) => !cancel.isPending && onOpenChange(v)}>
      <DialogContent title="Cancel booking" description={`PNR ${pnr}`}>
        {quote.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : quote.error || !q ? (
          <ErrorState error={quote.error} onRetry={() => quote.refetch()} className="py-6" />
        ) : !q.allowed ? (
          <>
            <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">This booking can no longer be cancelled</p>
                <p className="mt-0.5">{q.reason}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">Amount paid</dt>
                  <dd className="tabular font-medium">{formatCurrency(q.total)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-600">Cancellation fee</dt>
                  <dd className="tabular font-medium">− {formatCurrency(q.cancellationFee)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-dashed border-ink-200 pt-2.5">
                  <dt className="font-semibold text-ink-950">Refund amount ({q.refundPercent}%)</dt>
                  <dd className={cn('tabular text-xl font-extrabold', q.refundAmount > 0 ? 'text-success' : 'text-ink-950')}>{formatCurrency(q.refundAmount)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-ink-500">
                Departure is in {Math.floor(q.hoursBeforeDeparture)} hours. {q.refundType === 'NONE' ? 'No refund applies at this point, but your seats will be released.' : 'Refunds are simulated and marked as processed immediately.'}
              </p>
            </div>

            <PolicyTable policy={q.policy} activePercent={q.refundPercent} />

            <Field label="Reason for cancelling" htmlFor="cancel-reason" required>
              <Select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            {reason === 'Other' && (
              <Field label="Tell us more" htmlFor="cancel-note" required error={note && note.trim().length < 3 ? 'Please enter at least 3 characters' : undefined}>
                <Textarea id="cancel-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Why are you cancelling?" />
              </Field>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
                Keep booking
              </Button>
              <Button variant="danger" loading={cancel.isPending} disabled={finalReason.length < 3} onClick={() => cancel.mutate()}>
                Cancel booking
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
