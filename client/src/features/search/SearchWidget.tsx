import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, CalendarDays, MapPin, Search, Users } from 'lucide-react';
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

const fieldBox = 'group relative flex min-w-0 flex-1 flex-col justify-center rounded-xl border border-transparent bg-ink-50 px-4 py-2.5 transition-colors focus-within:border-brand-500 focus-within:bg-white hover:bg-ink-100/70 focus-within:hover:bg-white';
const fieldLabel = 'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500';
const fieldInput = 'w-full bg-transparent pt-0.5 text-[15px] font-semibold text-ink-950 placeholder:font-medium placeholder:text-ink-400 focus:outline-none';

export function SearchWidget({ defaults, variant = 'hero', onSearch }: Props) {
  const navigate = useNavigate();
  const id = useId();
  const { data: cities = [] } = useQuery({ queryKey: ['cities'], queryFn: catalogApi.cities, staleTime: 10 * 60_000 });

  const { register, handleSubmit, setValue, getValues, formState } = useForm<z.input<typeof searchSchema>, unknown, SearchValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { from: defaults?.from ?? '', to: defaults?.to ?? '', date: defaults?.date ?? istDate(1), passengers: defaults?.passengers ?? 1 },
  });
  const errors = formState.errors;
  const firstError = errors.from?.message ?? errors.to?.message ?? errors.date?.message ?? errors.passengers?.message;

  const submit = (values: SearchValues) => {
    if (onSearch) return onSearch(values);
    navigate(`/search?${new URLSearchParams({ from: values.from, to: values.to, date: values.date, passengers: String(values.passengers) })}`);
  };

  const swap = () => {
    const { from, to } = getValues();
    setValue('from', to, { shouldValidate: formState.isSubmitted });
    setValue('to', from, { shouldValidate: formState.isSubmitted });
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate aria-label="Search buses" className={cn('rounded-panel bg-white p-3 shadow-raised ring-1 ring-ink-100', variant === 'compact' && 'rounded-card shadow-card')}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <div className="relative flex flex-1 flex-col gap-2 sm:flex-row">
          <label className={fieldBox} htmlFor={`${id}-from`}>
            <span className={fieldLabel}>
              <MapPin className="size-3.5" aria-hidden /> From
            </span>
            <input id={`${id}-from`} list={`${id}-cities`} placeholder="Departure city" autoComplete="off" aria-invalid={!!errors.from} className={fieldInput} {...register('from')} />
          </label>
          <button
            type="button"
            onClick={swap}
            aria-label="Swap departure and destination"
            className="absolute left-1/2 top-1/2 z-10 hidden size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-sm transition-transform hover:rotate-180 hover:text-brand-700 sm:flex"
          >
            <ArrowLeftRight className="size-3.5" />
          </button>
          <label className={cn(fieldBox, 'sm:pl-7')} htmlFor={`${id}-to`}>
            <span className={fieldLabel}>
              <MapPin className="size-3.5" aria-hidden /> To
            </span>
            <input id={`${id}-to`} list={`${id}-cities`} placeholder="Destination city" autoComplete="off" aria-invalid={!!errors.to} className={fieldInput} {...register('to')} />
          </label>
          <datalist id={`${id}-cities`}>
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="flex gap-2">
          <label className={cn(fieldBox, 'lg:w-44 lg:flex-none')} htmlFor={`${id}-date`}>
            <span className={fieldLabel}>
              <CalendarDays className="size-3.5" aria-hidden /> Journey date
            </span>
            <input id={`${id}-date`} type="date" min={istDate()} aria-invalid={!!errors.date} className={fieldInput} {...register('date')} />
          </label>
          <label className={cn(fieldBox, 'w-28 flex-none')} htmlFor={`${id}-pax`}>
            <span className={fieldLabel}>
              <Users className="size-3.5" aria-hidden /> Seats
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
        <Button type="submit" size="lg" variant={variant === 'hero' ? 'accent' : 'primary'} className="h-auto min-h-14 rounded-xl px-7 lg:min-w-40">
          <Search /> Search buses
        </Button>
      </div>
      {firstError && (
        <p role="alert" className="px-2 pt-2.5 text-sm font-medium text-danger">
          {firstError}
        </p>
      )}
    </form>
  );
}
