import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowUpDown, CalendarDays, CircleDot, MapPin, Search, Users } from 'lucide-react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { cn, istDate } from '@/lib/utils';
import { catalogApi } from '@/services';

export const searchSchema = z
  .object({
    from: z.string().trim().min(2, 'Enter a departure city'),
    to: z.string().trim().min(2, 'Enter a destination city'),
    date: z
      .string()
      .min(1, 'Pick a journey date')
      .refine((d) => d >= istDate(), 'Journey date cannot be in the past'),
    passengers: z.coerce.number().int().min(1, 'At least 1 passenger').max(6, 'Up to 6 passengers per booking'),
  })
  .refine((v) => v.from.toLowerCase() !== v.to.toLowerCase(), { message: 'Destination must differ from departure', path: ['to'] });

export type SearchValues = z.infer<typeof searchSchema>;

interface Props {
  defaults?: Partial<SearchValues>;
  variant?: 'hero' | 'compact';
  onSearch?: (values: SearchValues) => void;
}

const field =
  'group relative flex min-w-0 flex-1 flex-col justify-center rounded-xl border border-ink-200 bg-white px-4 py-2.5 transition-all hover:border-ink-300 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10';
const fieldLabel = 'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500';
const fieldInput = 'w-full bg-transparent pt-0.5 text-[15px] font-semibold text-ink-900 placeholder:font-medium placeholder:text-ink-400 focus:outline-none';

export function SearchWidget({ defaults, variant = 'hero', onSearch }: Props) {
  const navigate = useNavigate();
  const id = useId();
  const { data: cities = [] } = useQuery({ queryKey: ['cities'], queryFn: catalogApi.cities, staleTime: 10 * 60_000 });

  const { register, handleSubmit, setValue, getValues, watch, formState } = useForm<z.input<typeof searchSchema>, unknown, SearchValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { from: defaults?.from ?? '', to: defaults?.to ?? '', date: defaults?.date ?? istDate(1), passengers: defaults?.passengers ?? 1 },
  });
  const errors = formState.errors;
  const firstError = errors.from?.message ?? errors.to?.message ?? errors.date?.message ?? errors.passengers?.message;
  const date = watch('date');

  const submit = (values: SearchValues) => {
    if (onSearch) return onSearch(values);
    navigate(`/search?${new URLSearchParams({ from: values.from, to: values.to, date: values.date, passengers: String(values.passengers) })}`);
  };

  const swap = () => {
    const { from, to } = getValues();
    setValue('from', to, { shouldValidate: formState.isSubmitted });
    setValue('to', from, { shouldValidate: formState.isSubmitted });
  };

  const quickDates = [
    { label: 'Today', value: istDate(0) },
    { label: 'Tomorrow', value: istDate(1) },
  ];

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Search buses"
      className={cn(
        'rounded-2xl border border-white/60 bg-white/95 p-3 shadow-raised ring-1 ring-ink-900/5 backdrop-blur-xl sm:p-4',
        variant === 'compact' && 'rounded-xl border-ink-200 bg-white p-3 shadow-card ring-0 backdrop-blur-none',
      )}
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-stretch">
        {/* From / To with a swap button straddling the gap */}
        <div className="relative flex flex-1 flex-col gap-2.5 sm:flex-row">
          <label className={field} htmlFor={`${id}-from`}>
            <span className={fieldLabel}>
              <CircleDot className="size-3.5 text-brand-600" aria-hidden /> From
            </span>
            <input id={`${id}-from`} list={`${id}-cities`} placeholder="Leaving from" autoComplete="off" aria-invalid={!!errors.from} className={fieldInput} {...register('from')} />
          </label>
          <button
            type="button"
            onClick={swap}
            aria-label="Swap departure and destination"
            className="absolute right-6 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600 active:scale-95 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
          >
            <ArrowLeftRight className="hidden size-4 sm:block" aria-hidden />
            <ArrowUpDown className="size-4 sm:hidden" aria-hidden />
          </button>
          <label className={field} htmlFor={`${id}-to`}>
            <span className={fieldLabel}>
              <MapPin className="size-3.5 text-brand-600" aria-hidden /> To
            </span>
            <input id={`${id}-to`} list={`${id}-cities`} placeholder="Going to" autoComplete="off" aria-invalid={!!errors.to} className={fieldInput} {...register('to')} />
          </label>
          <datalist id={`${id}-cities`}>
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="flex gap-2.5">
          <label className={cn(field, 'lg:w-48 lg:flex-none')} htmlFor={`${id}-date`}>
            <span className={fieldLabel}>
              <CalendarDays className="size-3.5 text-brand-600" aria-hidden /> Departure
            </span>
            <input id={`${id}-date`} type="date" min={istDate()} aria-invalid={!!errors.date} className={fieldInput} {...register('date')} />
          </label>
          <label className={cn(field, 'w-24 flex-none')} htmlFor={`${id}-pax`}>
            <span className={fieldLabel}>
              <Users className="size-3.5 text-brand-600" aria-hidden /> Seats
            </span>
            <select id={`${id}-pax`} className={cn(fieldInput, 'cursor-pointer appearance-none')} {...register('passengers')}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button type="submit" size="lg" className="h-auto min-h-14 rounded-xl px-8 text-base shadow-lg shadow-brand-600/25 lg:min-w-44">
          <Search className="!size-5" /> Search buses
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2" role="group" aria-label="Quick date">
          {quickDates.map((d) => (
            <button
              key={d.label}
              type="button"
              aria-pressed={date === d.value}
              onClick={() => setValue('date', d.value, { shouldValidate: formState.isSubmitted })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-all',
                date === d.value ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700',
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        {firstError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {firstError}
          </p>
        )}
      </div>
    </form>
  );
}
