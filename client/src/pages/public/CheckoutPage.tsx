import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState, PageLoader } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/features/auth/AuthContext';
import { clearDraft, loadDraft } from '@/features/bookings/draft';
import { FareBreakdown, estimateFare } from '@/features/bookings/FareSummary';
import { ApiError } from '@/lib/api';
import { busTypeLabel, formatDay, formatTime } from '@/lib/utils';
import { bookingApi, tripApi } from '@/services';

const passengerSchema = z.object({
  seatId: z.string(),
  name: z
    .string()
    .trim()
    .min(2, 'Enter the full name')
    .max(80)
    .regex(/^[\p{L}][\p{L} .'-]*$/u, 'Use letters only'),
  age: z.coerce.number({ error: (issue) => (issue.input === undefined ? undefined : 'Enter the age') }).int('Enter a whole number').min(1, 'Enter a valid age').max(120, 'Enter a valid age'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { message: 'Select a gender' }),
});

export const checkoutSchema = z.object({
  passengers: z.array(passengerSchema).min(1),
  contact: z.object({
    email: z.string().trim().email('Enter a valid email address'),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  }),
});
type CheckoutValues = z.infer<typeof checkoutSchema>;

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [draft] = useState(loadDraft);
  // Once a submit starts, our own seats will show as BOOKED; the stale-seat guard must stand down.
  const submitting = useRef(false);

  const tripId = draft?.tripId ?? '';
  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripApi.details(tripId), enabled: !!draft });
  const seatMap = useQuery({ queryKey: ['trip-seats', tripId], queryFn: () => tripApi.seats(tripId), enabled: !!draft, staleTime: 0 });

  const seats = useMemo(() => (seatMap.data?.seats ?? []).filter((s) => draft?.seatIds.includes(s._id)), [seatMap.data, draft]);
  const fare = useMemo(() => estimateFare(seatMap.data?.baseFare ?? 0, seats.map((s) => s.fare)), [seatMap.data, seats]);

  const form = useForm<z.input<typeof checkoutSchema>, unknown, CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      passengers: (draft?.seatIds ?? []).map((seatId, i) => ({ seatId, name: i === 0 ? (user?.name ?? '') : '', age: '' as unknown as number, gender: '' as unknown as 'MALE' })),
      contact: { email: user?.email ?? '', phone: user?.phone ?? '' },
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'passengers' });
  const errors = form.formState.errors;

  const backToSeats = (message: string, description?: string) => {
    toast.error(message, { description });
    queryClient.invalidateQueries({ queryKey: ['trip-seats', tripId] });
    navigate(`/trips/${tripId}`, { replace: true });
  };

  // A seat can be taken while the passenger fills in the form — check as soon as we know.
  useEffect(() => {
    if (!seatMap.data || !draft || submitting.current) return;
    const gone = seatMap.data.seats.filter((s) => draft.seatIds.includes(s._id) && s.status !== 'AVAILABLE');
    if (gone.length) backToSeats(`Seat ${gone.map((s) => s.seatNumber).join(', ')} is no longer available`, 'Please choose a different seat.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatMap.data]);

  const book = useMutation({
    mutationFn: (values: CheckoutValues) =>
      bookingApi.create(
        { tripId, boardingStopId: draft!.boardingStopId, droppingStopId: draft!.droppingStopId, contact: values.contact, passengers: values.passengers },
        draft!.idempotencyKey,
      ),
    onMutate: () => {
      submitting.current = true;
    },
    onSettled: (_data, error) => {
      if (error) submitting.current = false;
    },
    onSuccess: (booking) => {
      clearDraft();
      queryClient.invalidateQueries();
      toast.success('Booking confirmed', { description: `Your PNR is ${booking.pnr}` });
      navigate(`/account/bookings/${booking._id}?confirmed=1`, { replace: true });
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) return toast.error('Booking failed', { description: 'Please try again.' });
      if (err.code === 'SEAT_ALREADY_BOOKED' || err.code === 'SEAT_UNAVAILABLE') return backToSeats('Those seats were just taken', err.message);
      if (err.code === 'TRIP_NOT_BOOKABLE' || err.code === 'TRIP_DEPARTED') {
        clearDraft();
        toast.error(err.message);
        return navigate('/', { replace: true });
      }
      if (err.code === 'IDEMPOTENCY_KEY_REUSED') {
        clearDraft();
        toast.info('This booking was already submitted', { description: 'Check My bookings for your ticket.' });
        return navigate('/account/bookings', { replace: true });
      }
      if (err.code === 'VALIDATION_ERROR') {
        // Map server field errors (e.g. "passengers.0.age") back onto the form.
        for (const fe of err.fieldErrors) form.setError(fe.field as never, { message: fe.message });
        return toast.error('Please check the highlighted fields');
      }
      // Network failure or 5xx: the same Idempotency-Key makes a retry safe.
      toast.error('Booking could not be completed', { description: `${err.message} You can safely try again — you will not be charged twice.` });
    },
  });

  if (!draft) return <Navigate to="/" replace />;
  if (trip.isLoading || seatMap.isLoading) return <PageLoader label="Preparing your booking…" />;
  if (trip.error || seatMap.error || !trip.data) {
    return (
      <div className="container-page py-10">
        <Card>
          <ErrorState error={trip.error ?? seatMap.error} onRetry={() => { trip.refetch(); seatMap.refetch(); }} />
        </Card>
      </div>
    );
  }

  const t = trip.data;
  const boarding = t.boardingPoints.find((p) => p.stopId === draft.boardingStopId);
  const dropping = t.droppingPoints.find((p) => p.stopId === draft.droppingStopId);

  return (
    <div className="container-page py-6">
      <Link to={`/trips/${tripId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
        <ArrowLeft className="size-4" aria-hidden /> Change seats
      </Link>

      {/* Steps */}
      <ol className="mb-6 flex items-center gap-2 text-xs font-semibold text-ink-500" aria-label="Booking progress">
        {['Seats', 'Passenger details', 'Ticket'].map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className={`tabular flex size-6 items-center justify-center rounded-full ${i <= 1 ? 'bg-brand-700 text-white' : 'bg-ink-200 text-ink-600'}`}>{i + 1}</span>
            <span className={i === 1 ? 'text-ink-950' : ''} aria-current={i === 1 ? 'step' : undefined}>{step}</span>
            {i < 2 && <span className="h-px w-6 bg-ink-300 sm:w-12" aria-hidden />}
          </li>
        ))}
      </ol>

      <form onSubmit={form.handleSubmit((v) => book.mutate(v))} noValidate className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <h1 className="text-lg font-bold">Passenger details</h1>
              <p className="text-sm text-ink-500">Enter names exactly as on the photo ID each passenger will carry.</p>
              <div className="mt-5 space-y-5">
                {fields.map((field, i) => {
                  const seat = seats.find((s) => s._id === field.seatId);
                  const e = errors.passengers?.[i];
                  return (
                    <fieldset key={field.id} className="rounded-xl border border-ink-100 p-4">
                      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ink-900">
                        Passenger {i + 1} <Badge tone="brand">Seat {seat?.seatNumber ?? '—'}</Badge>
                      </legend>
                      <div className="mt-2 grid gap-4 sm:grid-cols-[1fr_6rem_9rem]">
                        <Field label="Full name" htmlFor={`p-${i}-name`} error={e?.name?.message} required>
                          <Input id={`p-${i}-name`} autoComplete="off" placeholder="e.g. Asha Rao" aria-invalid={!!e?.name} {...form.register(`passengers.${i}.name`)} />
                        </Field>
                        <Field label="Age" htmlFor={`p-${i}-age`} error={e?.age?.message} required>
                          <Input id={`p-${i}-age`} type="number" inputMode="numeric" min={1} max={120} placeholder="Age" aria-invalid={!!e?.age} {...form.register(`passengers.${i}.age`)} />
                        </Field>
                        <Field label="Gender" htmlFor={`p-${i}-gender`} error={e?.gender?.message} required>
                          <Select id={`p-${i}-gender`} aria-invalid={!!e?.gender} {...form.register(`passengers.${i}.gender`)}>
                            <option value="">Select</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                          </Select>
                        </Field>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="text-lg font-bold">Contact details</h2>
              <p className="text-sm text-ink-500">Your ticket and any trip updates are linked to these details.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="contact-email" error={errors.contact?.email?.message} required>
                  <Input id="contact-email" type="email" autoComplete="email" aria-invalid={!!errors.contact?.email} {...form.register('contact.email')} />
                </Field>
                <Field label="Mobile number" htmlFor="contact-phone" error={errors.contact?.phone?.message} hint="10-digit Indian mobile number" required>
                  <Input id="contact-phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="9876543210" aria-invalid={!!errors.contact?.phone} {...form.register('contact.phone')} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                <CreditCard className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-semibold">Payment</h2>
                <p className="mt-0.5 text-sm text-ink-600">
                  This is a demonstration: payment is <strong>simulated</strong> and no card details are collected. Confirming will mark the booking as paid.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-lg font-bold">Trip summary</h2>
              <div>
                <p className="font-semibold text-ink-950">
                  {t.route.sourceCity} → {t.route.destinationCity}
                </p>
                <p className="text-sm text-ink-600">
                  {formatDay(t.departureTime)} · {t.operator.name}
                </p>
                <p className="text-xs text-ink-500">{busTypeLabel(t.bus.busType, t.bus.isAC)}</p>
              </div>
              <dl className="space-y-2 rounded-xl bg-ink-50 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Boarding</dt>
                  <dd className="text-right font-medium text-ink-900">{boarding ? `${formatTime(boarding.time)} · ${boarding.name}` : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Dropping</dt>
                  <dd className="text-right font-medium text-ink-900">{dropping ? `${formatTime(dropping.time)} · ${dropping.name}` : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Seats</dt>
                  <dd className="tabular font-bold text-ink-900">{seats.map((s) => s.seatNumber).join(', ')}</dd>
                </div>
              </dl>
              <FareBreakdown fare={fare} seatCount={seats.length} />
              <Button type="submit" size="lg" variant="accent" className="w-full" loading={book.isPending}>
                {!book.isPending && <Lock />} Confirm booking
              </Button>
              <p className="flex items-start gap-2 text-xs text-ink-500">
                <ShieldCheck className="mt-px size-4 shrink-0 text-brand-600" aria-hidden />
                Seats and the final fare are verified again on our servers when you confirm.
              </p>
            </CardContent>
          </Card>
        </aside>
      </form>
    </div>
  );
}
