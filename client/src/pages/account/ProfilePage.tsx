import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/common/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate, titleCase } from '@/lib/utils';
import { authApi } from '@/services';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80).regex(/^[\p{L}][\p{L} .'-]*$/u, 'Use letters only'),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').or(z.literal('')),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/, '8+ characters with upper and lower case letters and a number'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const profile = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema) });
  const password = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    if (user) profile.reset({ name: user.name, phone: user.phone ?? '' });
  }, [user, profile]);

  if (!user) return null;

  const saveProfile = profile.handleSubmit(async (v) => {
    try {
      const updated = await authApi.updateProfile({ name: v.name, ...(v.phone ? { phone: v.phone } : {}) });
      setUser({ ...user, ...updated });
      profile.reset({ name: updated.name, phone: updated.phone ?? '' });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const savePassword = password.handleSubmit(async (v) => {
    try {
      await authApi.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Password changed', { description: 'Please sign in again with your new password.' });
      await logout();
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_PASSWORD') return password.setError('currentPassword', { message: err.message });
      toast.error(errorMessage(err));
    }
  });

  const pe = profile.formState.errors;
  const we = password.formState.errors;
  return (
    <>
      <PageHeader title="My profile" description={`${titleCase(user.role)} account · member since ${formatDate(user.createdAt)}`} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Personal details</CardTitle>
              <CardDescription>Used to pre-fill your bookings.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} noValidate className="space-y-4">
              <Field label="Email" htmlFor="pf-email" hint="Email cannot be changed">
                <Input id="pf-email" value={user.email} disabled readOnly />
              </Field>
              <Field label="Full name" htmlFor="pf-name" error={pe.name?.message} required>
                <Input id="pf-name" autoComplete="name" aria-invalid={!!pe.name} {...profile.register('name')} />
              </Field>
              <Field label="Mobile number" htmlFor="pf-phone" error={pe.phone?.message}>
                <Input id="pf-phone" type="tel" maxLength={10} autoComplete="tel" aria-invalid={!!pe.phone} {...profile.register('phone')} />
              </Field>
              <Button type="submit" loading={profile.formState.isSubmitting} disabled={!profile.formState.isDirty}>
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Change password</CardTitle>
              <CardDescription>You'll be signed out of all devices afterwards.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} noValidate className="space-y-4">
              <Field label="Current password" htmlFor="pw-current" error={we.currentPassword?.message} required>
                <Input id="pw-current" type="password" autoComplete="current-password" aria-invalid={!!we.currentPassword} {...password.register('currentPassword')} />
              </Field>
              <Field label="New password" htmlFor="pw-new" error={we.newPassword?.message} required>
                <Input id="pw-new" type="password" autoComplete="new-password" aria-invalid={!!we.newPassword} {...password.register('newPassword')} />
              </Field>
              <Field label="Confirm new password" htmlFor="pw-confirm" error={we.confirm?.message} required>
                <Input id="pw-confirm" type="password" autoComplete="new-password" aria-invalid={!!we.confirm} {...password.register('confirm')} />
              </Field>
              <Button type="submit" variant="outline" loading={password.formState.isSubmitting}>
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
