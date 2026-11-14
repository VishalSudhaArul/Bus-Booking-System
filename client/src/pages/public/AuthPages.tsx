import { zodResolver } from '@hookform/resolvers/zod';
import { Armchair, Eye, EyeOff, ShieldCheck, TicketCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Logo } from '@/components/common/layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { homeFor, useAuth } from '@/features/auth/AuthContext';
import { ApiError, errorMessage } from '@/lib/api';
import { redirectFromState } from '@/lib/navigation';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(80).regex(/^[\p{L}][\p{L} .'-]*$/u, 'Use letters only'),
    email: z.string().trim().email('Enter a valid email address'),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').or(z.literal('')),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(72)
      .regex(/[a-z]/, 'Add a lowercase letter')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/\d/, 'Add a number'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

const DEMO_ACCOUNTS = [
  { role: 'Passenger', email: 'passenger@busnest.example.com', password: 'Passenger@12345' },
  { role: 'Operator', email: 'operator@busnest.example.com', password: 'Operator@12345' },
  { role: 'Admin', email: 'admin@busnest.example.com', password: 'Admin@12345' },
];

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 top-1/4 size-96 rounded-full bg-brand-700/40 blur-3xl" aria-hidden />
        <Logo tone="light" className="relative" />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight text-white">Your seat, confirmed — every time.</h2>
          <ul className="mt-8 space-y-5 text-brand-100">
            {[
              { icon: Armchair, text: 'Choose your exact seat on a live seat map' },
              { icon: TicketCheck, text: 'Instant e-ticket with a unique PNR' },
              { icon: ShieldCheck, text: 'Clear refunds, calculated before you cancel' },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <item.icon className="size-4.5 text-accent-400" aria-hidden />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200/70">Demonstration project — payments are simulated.</p>
      </aside>
      <main className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md animate-fade-up">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-600">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-center text-sm text-ink-600">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function PasswordInput({ id, invalid, autoComplete, registration }: { id: string; invalid: boolean; autoComplete: string; registration: object }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} aria-invalid={invalid} className="pr-10" {...registration} />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, setValue, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const submit = handleSubmit(async (values) => {
    setFormError('');
    try {
      const user = await login(values.email, values.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      // Only passengers return to a booking flow; staff go to their console.
      navigate(user.role === 'PASSENGER' ? redirectFromState(location.state, homeFor(user.role)) : homeFor(user.role), { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : errorMessage(err));
    }
  });

  return (
    <AuthShell
      title="Sign in to BusNest"
      subtitle="Manage your bookings, tickets and cancellations."
      footer={
        <>
          New to BusNest?{' '}
          <Link to="/register" state={location.state} className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {formError}
          </p>
        )}
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <PasswordInput id="password" autoComplete="current-password" invalid={!!formState.errors.password} registration={register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-dashed border-ink-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Demo accounts</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <Button
              key={a.role}
              variant="outline"
              size="sm"
              onClick={() => {
                setValue('email', a.email, { shouldValidate: true });
                setValue('password', a.password, { shouldValidate: true });
              }}
            >
              {a.role}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">Fills the form with a seeded demo account.</p>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, setError, formState } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema), defaultValues: { phone: '' } });
  const e = formState.errors;

  const submit = handleSubmit(async (values) => {
    setFormError('');
    try {
      const user = await signUp({ name: values.name, email: values.email, phone: values.phone || undefined, password: values.password });
      toast.success(`Welcome to BusNest, ${user.name.split(' ')[0]}`);
      navigate(redirectFromState(location.state, '/account'), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_EXISTS') return setError('email', { message: 'An account with this email already exists' });
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        for (const fe of err.fieldErrors) setError(fe.field as never, { message: fe.message });
        return;
      }
      setFormError(errorMessage(err));
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Book faster and keep all your tickets in one place."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {formError}
          </p>
        )}
        <Field label="Full name" htmlFor="name" error={e.name?.message} required>
          <Input id="name" autoComplete="name" aria-invalid={!!e.name} {...register('name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={e.email?.message} required>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!e.email} {...register('email')} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={e.phone?.message} hint="Optional">
            <Input id="phone" type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" aria-invalid={!!e.phone} {...register('phone')} />
          </Field>
        </div>
        <Field label="Password" htmlFor="password" error={e.password?.message} hint="8+ characters with upper and lower case letters and a number" required>
          <PasswordInput id="password" autoComplete="new-password" invalid={!!e.password} registration={register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={e.confirmPassword?.message} required>
          <PasswordInput id="confirmPassword" autoComplete="new-password" invalid={!!e.confirmPassword} registration={register('confirmPassword')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
