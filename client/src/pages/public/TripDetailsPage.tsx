import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Info, RefreshCw, Snowflake, Star, Wind } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { useAuth } from '@/features/auth/AuthContext';
import { loadDraft, saveDraft } from '@/features/bookings/draft';
import { FareBreakdown, estimateFare } from '@/features/bookings/FareSummary';
import { SeatLegend, SeatMap } from '@/features/seats/SeatMap';
import { JourneyLine, StopList } from '@/features/trips/TripCard';
import { redirectFromState } from '@/lib/navigation';
import { busTypeLabel, formatDay, formatTime } from '@/lib/utils';
import { tripApi } from '@/services';
import type { TripSeat } from '@/types';

const MAX_SEATS = 6;

export function TripDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => tripApi.details(id) });
  // Poll the seat map so a seat taken by someone else greys out without a reload.
  const seatMap = useQuery({ queryKey: ['trip-seats', id], queryFn: () => tripApi.seats(id), refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 0 });

  // Returning from checkout (e.g. after a seat conflict) restores the previous choice.
  const draft = useMemo(() => {
    const d = loadDraft();
    return d?.tripId === id ? d : null;
  }, [id]);
  const [selected, setSelected] = useState<string[]>(draft?.seatIds ?? []);
  const [boardingStopId, setBoarding] = useState(draft?.boardingStopId ?? '');
  const [droppingStopId, setDropping] = useState(draft?.droppingStopId ?? '');

  // Default the stops once the trip has loaded.
  useEffect(() => {
    if (!trip.data) return;
    setBoarding((v) => v || trip.data.boardingPoints[0]?.stopId || '');
    setDropping((v) => v || trip.data.droppingPoints.at(-1)?.stopId || '');
  }, [trip.data]);

  // If a selected seat is no longer available on the server, drop it and say so.
  useEffect(() => {
    if (!seatMap.data) return;
    const free = new Set(seatMap.data.seats.filter((s) => s.status === 'AVAILABLE').map((s) => s._id));
    const lost = selected.filter((sid) => !free.has(sid));
    if (lost.length === 0) return;
    const names = seatMap.data.seats.filter((s) => lost.includes(s._id)).map((s) => s.seatNumber);
    setSelected((cur) => cur.filter((sid) => free.has(sid)));
    toast.warning(`Seat ${names.join(', ')} was just booked by someone else`, { description: 'Please choose another seat.' });
  }, [seatMap.data, selected]);

  const selectedSeats = useMemo(() => (seatMap.data?.seats ?? []).filter((s) => selected.includes(s._id)), [seatMap.data, selected]);
  const fare = useMemo(() => estimateFare(seatMap.data?.baseFare ?? 0, selectedSeats.map((s) => s.fare)), [seatMap.data, selectedSeats]);

  const toggle = (seat: TripSeat) => {
    if (seat.status !== 'AVAILABLE') return;
    setSelected((cur) => (cur.includes(seat._id) ? cur.filter((s) => s !== seat._id) : cur.length >= MAX_SEATS ? cur : [...cur, seat._id]));
  };

  const proceed = () => {
    saveDraft({ tripId: id, seatIds: selected, boardingStopId, droppingStopId });
    if (!user) {
      toast.info('Sign in to continue', { description: 'Your seat selection has been saved.' });
      return navigate('/login', { state: { from: '/checkout' } });
    }
    if (user.role !== 'PASSENGER') return toast.error('Staff accounts cannot make bookings', { description: 'Sign in with a passenger account to book seats.' });
    navigate('/checkout');
  };

  if (trip.isLoading || seatMap.isLoading) {
    return (
      <div className="container-page grid gap-6 py-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-[28rem] rounded-card" />
        </div>
        <Skeleton className="h-80 rounded-card" />
      </div>
    );
  }
  if (trip.error || seatMap.error || !trip.data || !seatMap.data) {
    return (
      <div className="container-page py-10">
        <Card>
          <ErrorState error={trip.error ?? seatMap.error} onRetry={() => { trip.refetch(); seatMap.refetch(); }} />
        </Card>
      </div>
    );
  }

  const t = trip.data;
  const bookable = seatMap.data.bookable;
  const freeCount = seatMap.data.seats.filter((s) => s.status === 'AVAILABLE').length;
  const backTo = redirectFromState(location.state, '');

  return (
    <div className="container-page py-6">
      <button type="button" onClick={() => (backTo ? navigate(backTo) : navigate(-1))} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
        <ArrowLeft className="size-4" aria-hidden /> Back to results
      </button>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Trip summary */}
          <Card>
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold">{t.operator.name}</h1>
                    <span className="tabular inline-flex items-center gap-1 rounded-md bg-brand-700 px-1.5 py-0.5 text-xs font-bold text-white">
                      <Star className="size-3 fill-current" aria-hidden /> {t.operator.rating.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                    {t.bus.isAC ? <Snowflake className="size-3.5 text-blue-600" aria-hidden /> : <Wind className="size-3.5 text-ink-400" aria-hidden />}
                    {t.bus.name} · {busTypeLabel(t.bus.busType, t.bus.isAC)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink-900">{formatDay(t.departureTime)}</p>
                  <p className="text-xs text-ink-500">
                    {t.route.sourceCity} → {t.route.destinationCity} · {t.route.distanceKm} km
                  </p>
                </div>
              </div>
              <JourneyLine className="mt-5" departure={t.departureTime} arrival={t.arrivalTime} durationMinutes={t.durationMinutes} from={t.route.sourceCity} to={t.route.destinationCity} />
              {t.bus.amenities.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {t.bus.amenities.map((a) => (
                    <Badge key={a}>{a}</Badge>
                  ))}
                </div>
              )}
              <div className="mt-5 grid gap-6 border-t border-ink-100 pt-5 sm:grid-cols-2">
                <StopList title="Boarding points" points={t.boardingPoints} />
                <StopList title="Dropping points" points={t.droppingPoints} />
              </div>
            </CardContent>
          </Card>

          {/* Seat map */}
          <Card>
            <CardContent>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Select your seats</h2>
                  <p className="text-sm text-ink-500">
                    {freeCount} of {t.totalSeats} seats available
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => seatMap.refetch()} loading={seatMap.isFetching}>
                  {!seatMap.isFetching && <RefreshCw />} Refresh availability
                </Button>
              </div>
              {!bookable && (
                <div className="mb-5 flex gap-2.5 rounded-xl bg-amber-50 p-3.5 text-sm font-medium text-amber-900" role="status">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> This trip is no longer open for booking.
                </div>
              )}
              <SeatMap layout={seatMap.data.layout} seats={seatMap.data.seats} selected={selected} onToggle={toggle} maxSelectable={MAX_SEATS} disabled={!bookable} />
              <div className="mt-6 flex justify-center border-t border-ink-100 pt-5">
                <SeatLegend />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Booking summary */}
        <aside className="lg:sticky lg:top-24">
          <Card>
            <CardContent className="space-y-5">
              <h2 className="text-lg font-bold">Your selection</h2>

              <Field label="Boarding point" htmlFor="boarding">
                <Select id="boarding" value={boardingStopId} onChange={(e) => setBoarding(e.target.value)}>
                  {t.boardingPoints.map((p) => (
                    <option key={p.stopId} value={p.stopId}>
                      {formatTime(p.time)} · {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dropping point" htmlFor="dropping">
                <Select id="dropping" value={droppingStopId} onChange={(e) => setDropping(e.target.value)}>
                  {t.droppingPoints.map((p) => (
                    <option key={p.stopId} value={p.stopId}>
                      {formatTime(p.time)} · {p.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <p className="text-sm font-medium text-ink-700">Seats</p>
                {selectedSeats.length === 0 ? (
                  <p className="mt-1.5 rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-500">Tap a seat on the map to select it</p>
                ) : (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {selectedSeats.map((s) => (
                      <li key={s._id}>
                        <Badge tone="brand" className="px-3 py-1 text-sm">
                          {s.seatNumber}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedSeats.length > 0 && <FareBreakdown fare={fare} seatCount={selectedSeats.length} className="border-t border-ink-100 pt-4" totalLabel="Total fare" />}

              <Button size="lg" className="w-full" disabled={selectedSeats.length === 0 || !bookable || !boardingStopId || !droppingStopId} onClick={proceed}>
                Continue <ArrowRight />
              </Button>
              {!user && (
                <p className="text-center text-xs text-ink-500">
                  You'll be asked to <Link to="/login" state={{ from: `/trips/${id}` }} className="font-semibold text-brand-700 hover:underline">sign in</Link> before paying.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
