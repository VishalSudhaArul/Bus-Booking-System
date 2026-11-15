import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, CreditCard, Lock, ShieldCheck, Tag, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorState } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { busTypeLabel, cn, formatCurrency, formatDay, formatTime } from '@/lib/utils';
import { bookingApi, catalogApi, tripApi } from '@/services';
import type { Booking } from '@/types';
import type { BookingDraft } from './draft';
import { FareBreakdown } from './FareSummary';

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

interface Props {
  draft: BookingDraft;
  onBooked: (booking: Booking) => void;
  /** A seat was taken or the trip closed — send the user back to choose again. */
  onSeatsLost: (message: string) => void;
}

/**
 * Passenger details, promo code and the server-quoted fare. The amount shown
 * is always the server's quote, i.e. exactly what the booking will charge.
 */
export function CheckoutPanel({ draft, onBooked, onSeatsLost }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | undefined>();
  const [promoError, setPromoError] = useState('');

  const trip = useQuery({ queryKey: ['trip', draft.tripId], queryFn: () => tripApi.details(draft.tripId) });
  const offers = useQuery({ queryKey: ['promos'], queryFn: catalogApi.promos, staleTime: 10 * 60_000 });
  const quote = useQuery({
    queryKey: ['fare-quote', draft.tripId, draft.seatIds.join(','), promo ?? ''],
    queryFn: () => bookingApi.fareQuote({ tripId: draft.tripId, seatIds: draft.seatIds, promoCode: promo }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const form = useForm<z.input<typeof checkoutSchema>, unknown, CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { passengers: [], contact: { email: user?.email ?? '', phone: user?.phone ?? '' } },
  });
  const { fields, replace } = useFieldArray({ control: form.control, name: 'passengers' });
  const errors = form.formState.errors;

  // Build the passenger rows once the quote tells us the seats (sorted, with ladies-only flags).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !quote.data) return;
    seeded.current = true;
    replace(
      quote.data.seats.map((s, i) => ({
        seatId: s.seatId,
        name: i === 0 && !s.ladiesOnly ? (user?.name ?? '') : '',
        age: '' as unknown as number,
        gender: s.ladiesOnly ? 'FEMALE' : ('' as unknown as 'MALE'),
      })),
    );
  }, [quote.data, replace, user?.name]);

  // A promo that the server rejects is removed and its message shown under the field.
  useEffect(() => {
    const err = quote.error;
    if (promo && err instanceof ApiError && ['INVALID_PROMO', 'PROMO_MIN_NOT_MET'].includes(err.code)) {
      setPromoError(err.message);
      setPromo(undefined);
    } else if (err instanceof ApiError && ['TRIP_NOT_BOOKABLE', 'INVALID_SEATS'].includes(err.code)) {
      onSeatsLost(err.message);
    }
  }, [quote.error, promo, onSeatsLost]);

  // A seat can be taken while the passenger fills in the form — check as soon as we know.
  const seatMap = useQuery({ queryKey: ['trip-seats', draft.tripId], queryFn: () => tripApi.seats(draft.tripId), staleTime: 0 });
  useEffect(() => {
    if (!seatMap.data || submitting.current) return;
    const gone = seatMap.data.seats.filter((s) => draft.seatIds.includes(s._id) && s.status !== 'AVAILABLE');
    if (gone.length) onSeatsLost(`Seat ${gone.map((s) => s.seatNumber).join(', ')} is no longer available. Please choose a different seat.`);
  }, [seatMap.data, draft.seatIds, onSeatsLost]);

  const applyPromo = (code: string) => {
    const value = code.trim().toUpperCase();
    setPromoError('');
    if (!/^[A-Z0-9]{3,20}$/.test(value)) return setPromoError('Enter a valid promo code');
    setPromoInput(value);
    setPromo(value);
  };

  const book = useMutation({
    mutationFn: (values: CheckoutValues) =>
      bookingApi.create(
        { tripId: draft.tripId, boardingStopId: draft.boardingStopId, droppingStopId: draft.droppingStopId, contact: values.contact, passengers: values.passengers, promoCode: promo },
        draft.idempotencyKey,
      ),
    onMutate: () => {
      submitting.current = true;
    },
    onSettled: (_d, error) => {
      if (error) submitting.current = false;
    },
    onSuccess: (booking) => {
      queryClient.invalidateQueries();
      onBooked(booking);
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) return toast.error('Booking failed', { description: 'Please try again.' });
      if (['SEAT_ALREADY_BOOKED', 'SEAT_UNAVAILABLE', 'TRIP_NOT_BOOKABLE', 'TRIP_DEPARTED'].includes(err.code)) return onSeatsLost(err.message);
      if (err.code === 'LADIES_ONLY_SEAT') return toast.error('Ladies-only seat', { description: err.message });
      if (['INVALID_PROMO', 'PROMO_MIN_NOT_MET'].includes(err.code)) {
        setPromo(undefined);
        setPromoError(err.message);
        return toast.error(err.message);
      }
      if (err.code === 'VALIDATION_ERROR') {
        for (const fe of err.fieldErrors) form.setError(fe.field as never, { message: fe.message });
        return toast.error('Please check the highlighted fields');
      }
      toast.error('Booking could not be completed', { description: `${err.message} You can safely try again — you will not be charged twice.` });
    },
  });

  if (trip.isLoading || (quote.isLoading && !quote.data)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (trip.error || !trip.data || !quote.data) return <ErrorState error={trip.error ?? quote.error} onRetry={() => { trip.refetch(); quote.refetch(); }} />;

  const t = trip.data;
  const q = quote.data;
  const boarding = t.boardingPoints.find((p) => p.stopId === draft.boardingStopId);
  const dropping = t.droppingPoints.find((p) => p.stopId === draft.droppingStopId);
  const seatInfo = (seatId: string) => q.seats.find((s) => s.seatId === seatId);

  return (
    <form onSubmit={form.handleSubmit((v) => book.mutate(v))} noValidate className="space-y-5">
      {/* Trip summary */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink-900">
              {t.route.sourceCity} → {t.route.destinationCity}
            </p>
            <p className="text-sm text-ink-600">
              {formatDay(t.departureTime)} · {t.operator.name}
            </p>
            <p className="text-xs text-ink-500">{busTypeLabel(t.bus.busType, t.bus.isAC)}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {q.seats.map((s) => (
              <Badge key={s.seatId} tone={s.ladiesOnly ? 'neutral' : 'brand'} className={cn(s.ladiesOnly && 'bg-ladies-50 text-ladies-700 ring-ladies-300')}>
                {s.seatNumber}
              </Badge>
            ))}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3 text-xs">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-500">Boarding</dt>
            <dd className="mt-0.5 font-semibold text-ink-900">{boarding ? `${formatTime(boarding.time)} · ${boarding.name}` : '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-ink-500">Dropping</dt>
            <dd className="mt-0.5 font-semibold text-ink-900">{dropping ? `${formatTime(dropping.time)} · ${dropping.name}` : '—'}</dd>
          </div>
        </dl>
      </Card>

      {/* Passengers */}
      <section>
        <h3 className="text-sm font-bold text-ink-900">Passenger details</h3>
        <p className="text-xs text-ink-500">Names as on the photo ID each passenger will carry.</p>
        <div className="mt-3 space-y-3">
          {fields.map((field, i) => {
            const seat = seatInfo(field.seatId);
            const e = errors.passengers?.[i];
            return (
              <fieldset key={field.id} className={cn('rounded-xl border bg-white p-4', seat?.ladiesOnly ? 'border-ladies-300' : 'border-ink-200')}>
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ink-900">
                  Passenger {i + 1}
                  <Badge tone="brand">Seat {seat?.seatNumber}</Badge>
                  {seat?.ladiesOnly && <Badge className="bg-ladies-50 text-ladies-700 ring-ladies-300">Ladies only</Badge>}
                </legend>
                <div className="mt-1 grid gap-3 sm:grid-cols-[1fr_5.5rem_8rem]">
                  <Field label="Full name" htmlFor={`p-${i}-name`} error={e?.name?.message} required>
                    <Input id={`p-${i}-name`} autoComplete="off" placeholder="e.g. Asha Rao" aria-invalid={!!e?.name} {...form.register(`passengers.${i}.name`)} />
                  </Field>
                  <Field label="Age" htmlFor={`p-${i}-age`} error={e?.age?.message} required>
                    <Input id={`p-${i}-age`} type="number" inputMode="numeric" min={1} max={120} placeholder="Age" aria-invalid={!!e?.age} {...form.register(`passengers.${i}.age`)} />
                  </Field>
                  <Field label="Gender" htmlFor={`p-${i}-gender`} error={e?.gender?.message} required>
                    <Select id={`p-${i}-gender`} aria-invalid={!!e?.gender} {...form.register(`passengers.${i}.gender`)}>
                      {seat?.ladiesOnly ? (
                        <option value="FEMALE">Female</option>
                      ) : (
                        <>
                          <option value="">Select</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </>
                      )}
                    </Select>
                  </Field>
                </div>
              </fieldset>
            );
          })}
        </div>
      </section>

      {/* Contact */}
      <section>
        <h3 className="text-sm font-bold text-ink-900">Contact details</h3>
        <p className="text-xs text-ink-500">Your booking and boarding pass are linked to these details.</p>
        <div className="mt-3 grid gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="contact-email" error={errors.contact?.email?.message} required>
            <Input id="contact-email" type="email" autoComplete="email" aria-invalid={!!errors.contact?.email} {...form.register('contact.email')} />
          </Field>
          <Field label="Mobile number" htmlFor="contact-phone" error={errors.contact?.phone?.message} hint="10-digit mobile number" required>
            <Input id="contact-phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="9876543210" aria-invalid={!!errors.contact?.phone} {...form.register('contact.phone')} />
          </Field>
        </div>
      </section>

      {/* Promo + fare */}
      <section className="rounded-xl border border-ink-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <BadgePercent className="size-4 text-brand-600" aria-hidden /> Offers & fare
        </h3>
        {promo && !quote.isFetching && q.fare.promoCode ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm ring-1 ring-inset ring-emerald-200">
            <span className="flex items-center gap-2 font-semibold text-emerald-800">
              <Tag className="size-4" aria-hidden /> {q.fare.promoCode} applied · you save {formatCurrency(q.fare.discount)}
            </span>
            <button
              type="button"
              onClick={() => {
                setPromo(undefined);
                setPromoInput('');
              }}
              className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
              aria-label="Remove promo code"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 flex gap-2">
              <label htmlFor="promo" className="sr-only">
                Promo code
              </label>
              <Input
                id="promo"
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value.toUpperCase());
                  setPromoError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyPromo(promoInput);
                  }
                }}
                placeholder="Promo code"
                className="font-mono uppercase"
                aria-invalid={!!promoError}
                aria-describedby={promoError ? 'promo-error' : undefined}
              />
              <Button variant="outline" onClick={() => applyPromo(promoInput)} loading={!!promo && quote.isFetching} disabled={!promoInput.trim()}>
                Apply
              </Button>
            </div>
            {promoError && (
              <p id="promo-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {promoError}
              </p>
            )}
            {!!offers.data?.length && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {offers.data.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => applyPromo(o.code)}
                    className="rounded-full border border-dashed border-brand-300 bg-brand-50/60 px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                    title={o.description}
                  >
                    <span className="font-mono">{o.code}</span> · {o.description}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div className={cn('mt-4 border-t border-dashed border-ink-200 pt-4 transition-opacity', quote.isFetching && 'opacity-60')}>
          <FareBreakdown fare={q.fare} seatCount={q.seats.length} />
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl bg-ink-100/70 p-3 text-xs text-ink-600">
        <CreditCard className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
        <p>
          Payment is <strong>simulated</strong> in this demo — no card details are collected. Confirming marks the booking as paid.
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full text-base" loading={book.isPending}>
        {!book.isPending && <Lock />} Pay {formatCurrency(q.fare.total)} & book
      </Button>
      <p className="-mt-2 flex items-center justify-center gap-1.5 text-xs text-ink-500">
        <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden /> Seats and fare are verified again by our server when you confirm.
      </p>
    </form>
  );
}
