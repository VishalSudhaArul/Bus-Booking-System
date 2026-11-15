import { ArrowLeft } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckoutPanel } from '@/features/bookings/CheckoutPanel';
import { clearDraft, loadDraft } from '@/features/bookings/draft';
import type { Booking } from '@/types';

export { checkoutSchema } from '@/features/bookings/CheckoutPanel';

/** Full-page checkout, used when arriving from a trip's own page or after signing in. */
export function CheckoutPage() {
  const navigate = useNavigate();
  const [draft] = useState(loadDraft);

  const onSeatsLost = useCallback(
    (message: string) => {
      toast.error('Please choose your seats again', { description: message });
      navigate(draft ? `/trips/${draft.tripId}` : '/', { replace: true });
    },
    [draft, navigate],
  );

  if (!draft) return <Navigate to="/" replace />;

  const onBooked = (booking: Booking) => {
    clearDraft();
    toast.success('Booking confirmed', { description: `Your PNR is ${booking.pnr}` });
    navigate(`/account/bookings/${booking._id}?confirmed=1`, { replace: true });
  };

  return (
    <div className="container-page max-w-2xl py-6">
      <Link to={`/trips/${draft.tripId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Change seats
      </Link>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Complete your booking</h1>
      <CheckoutPanel draft={draft} onBooked={onBooked} onSeatsLost={onSeatsLost} />
    </div>
  );
}
