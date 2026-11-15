import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Snowflake, Wind } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/feedback';
import { Card, CardContent, Skeleton } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { loadDraft, saveDraft } from '@/features/bookings/draft';
import { SeatSelector, type SeatSelection } from '@/features/seats/SeatDrawer';
import { AmenityIcons } from '@/features/trips/amenities';
import { JourneyLine, RatingBadge, StopList } from '@/features/trips/TripCard';
import { redirectFromState } from '@/lib/navigation';
import { busTypeLabel, formatDay } from '@/lib/utils';
import { tripApi } from '@/services';

/** Shareable page for a single trip: details plus the same seat selector used in search results. */
export function TripDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => tripApi.details(id) });

  // Returning here (e.g. after a seat conflict) restores the previous choice.
  const initial = useMemo(() => {
    const d = loadDraft();
    return d?.tripId === id ? d : undefined;
  }, [id]);
  const backTo = redirectFromState(location.state, '');

  const proceed = (selection: SeatSelection) => {
    saveDraft(selection);
    if (!user) {
      toast.info('Log in to continue', { description: 'Your seat selection is saved.' });
      return navigate('/login', { state: { from: '/checkout' } });
    }
    if (user.role !== 'PASSENGER') return toast.error('Staff accounts cannot make bookings', { description: 'Log in with a passenger account to book seats.' });
    navigate('/checkout');
  };

  if (trip.isLoading) {
    return (
      <div className="container-page space-y-6 py-8">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-[28rem] rounded-xl" />
      </div>
    );
  }
  if (trip.error || !trip.data) {
    return (
      <div className="container-page py-10">
        <Card>
          <ErrorState error={trip.error} onRetry={() => trip.refetch()} />
        </Card>
      </div>
    );
  }

  const t = trip.data;
  return (
    <div className="container-page space-y-6 py-6">
      <button type="button" onClick={() => (backTo ? navigate(backTo) : navigate(-1))} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{t.operator.name}</h1>
                <RatingBadge rating={t.operator.rating} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                {t.bus.isAC ? <Snowflake className="size-3.5 text-brand-600" aria-hidden /> : <Wind className="size-3.5 text-ink-400" aria-hidden />}
                {t.bus.name} · {busTypeLabel(t.bus.busType, t.bus.isAC)}
              </p>
              <AmenityIcons amenities={t.bus.amenities} max={8} className="mt-3" />
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-ink-900">{formatDay(t.departureTime)}</p>
              <p className="text-xs text-ink-500">
                {t.route.sourceCity} → {t.route.destinationCity} · {t.route.distanceKm} km
              </p>
            </div>
          </div>
          <JourneyLine className="mt-5" departure={t.departureTime} arrival={t.arrivalTime} durationMinutes={t.durationMinutes} from={t.route.sourceCity} to={t.route.destinationCity} />
          <div className="mt-5 grid gap-6 border-t border-ink-100 pt-5 sm:grid-cols-2">
            <StopList title="Boarding points" points={t.boardingPoints} />
            <StopList title="Dropping points" points={t.droppingPoints} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <SeatSelector tripId={t._id} boardingPoints={t.boardingPoints} droppingPoints={t.droppingPoints} initial={initial} onContinue={proceed} />
        </CardContent>
      </Card>
    </div>
  );
}
