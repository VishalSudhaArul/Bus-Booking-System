import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Pencil, Plus, Star, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StatusBadge } from '@/components/common/feedback';
import { ConfirmDialog, PageHeader } from '@/components/common/layout';
import { DataTable, SearchInput, type Column } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/features/auth/AuthContext';
import { useSave, useTableState } from '@/hooks';
import { formatDate } from '@/lib/utils';
import { adminApi } from '@/services';
import type { Operator, Stop, User } from '@/types';

const active = (isActive?: boolean) => <StatusBadge status={isActive === false ? 'INACTIVE' : 'ACTIVE'} />;

/** All operators, for select boxes (admin only). */
export function useOperatorOptions(enabled = true) {
  return useQuery({ queryKey: ['operators', 'options'], queryFn: () => adminApi.operators({ limit: 100 }), enabled, staleTime: 60_000, select: (d) => d.items });
}

// ── Operators ──────────────────────────────────────────────────────────────

const operatorSchema = z.object({
  name: z.string().trim().min(2, 'Enter the operator name').max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, '2-8 letters or digits'),
  contactEmail: z.string().trim().email('Enter a valid email'),
  contactPhone: z.string().trim().regex(/^[0-9+\- ]{7,15}$/, 'Enter a valid phone number'),
  description: z.string().trim().max(400).optional(),
  rating: z.coerce.number().min(0).max(5),
  isActive: z.boolean(),
});
type OperatorValues = z.infer<typeof operatorSchema>;

function OperatorDialog({ operator, open, onOpenChange }: { operator: Operator | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.input<typeof operatorSchema>, unknown, OperatorValues>({ resolver: zodResolver(operatorSchema) });
  useEffect(() => {
    if (open) form.reset({ name: operator?.name ?? '', code: operator?.code ?? '', contactEmail: operator?.contactEmail ?? '', contactPhone: operator?.contactPhone ?? '', description: operator?.description ?? '', rating: operator?.rating ?? 4, isActive: operator?.isActive ?? true });
  }, [open, operator, form]);
  const save = useSave<OperatorValues>({
    mutationFn: (v) => (operator ? adminApi.updateOperator(operator._id, v) : adminApi.createOperator(v)),
    success: operator ? 'Operator updated' : 'Operator created',
    onDone: () => onOpenChange(false),
    setError: form.setError,
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={operator ? 'Edit operator' : 'Add operator'} description="Operators own buses and routes, and can be given their own console login.">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Operator name" htmlFor="op-name" error={e.name?.message} required className="sm:col-span-2">
            <Input id="op-name" aria-invalid={!!e.name} {...form.register('name')} />
          </Field>
          <Field label="Code" htmlFor="op-code" error={e.code?.message} hint="Short unique code, e.g. DSL" required>
            <Input id="op-code" className="uppercase" aria-invalid={!!e.code} disabled={!!operator} {...form.register('code')} />
          </Field>
          <Field label="Rating (0-5)" htmlFor="op-rating" error={e.rating?.message}>
            <Input id="op-rating" type="number" step="0.1" min={0} max={5} aria-invalid={!!e.rating} {...form.register('rating')} />
          </Field>
          <Field label="Contact email" htmlFor="op-email" error={e.contactEmail?.message} required>
            <Input id="op-email" type="email" aria-invalid={!!e.contactEmail} {...form.register('contactEmail')} />
          </Field>
          <Field label="Contact phone" htmlFor="op-phone" error={e.contactPhone?.message} required>
            <Input id="op-phone" aria-invalid={!!e.contactPhone} {...form.register('contactPhone')} />
          </Field>
          <Field label="Description" htmlFor="op-desc" error={e.description?.message} className="sm:col-span-2">
            <Textarea id="op-desc" maxLength={400} {...form.register('description')} />
          </Field>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700 sm:col-span-2">
            <input type="checkbox" className="size-4 accent-brand-700" {...form.register('isActive')} /> Active — visible to passengers
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{operator ? 'Save changes' : 'Create operator'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OperatorsPage() {
  const table = useTableState({});
  const [editing, setEditing] = useState<Operator | null>(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['operators', table.page, table.search], queryFn: () => adminApi.operators({ page: table.page, limit: 10, search: table.search }), placeholderData: keepPreviousData });
  const openDialog = (o: Operator | null) => {
    setEditing(o);
    setOpen(true);
  };

  const columns: Column<Operator>[] = [
    {
      key: 'name',
      header: 'Operator',
      cell: (o) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-950 text-[11px] font-bold text-accent-400">{o.code}</span>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">{o.name}</p>
            <p className="truncate text-xs text-ink-500">{o.contactEmail}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', hideOnMobile: true, cell: (o) => o.contactPhone },
    { key: 'rating', header: 'Rating', hideOnMobile: true, cell: (o) => <span className="tabular inline-flex items-center gap-1 font-semibold"><Star className="size-3.5 fill-accent-500 text-accent-500" aria-hidden /> {o.rating.toFixed(1)}</span> },
    { key: 'buses', header: 'Buses', align: 'right', cell: (o) => <span className="tabular">{o.busCount ?? 0}</span> },
    { key: 'status', header: 'Status', cell: (o) => active(o.isActive) },
    { key: 'actions', header: '', align: 'right', cell: (o) => <Button variant="ghost" size="sm" onClick={() => openDialog(o)}><Pencil /> Edit</Button> },
  ];

  return (
    <>
      <PageHeader title="Operators" description="Bus companies selling seats on BusNest." actions={<Button onClick={() => openDialog(null)}><Plus /> Add operator</Button>} />
      <DataTable columns={columns} rows={query.data?.items} rowKey={(o) => o._id} loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} meta={query.data?.meta} onPageChange={table.setPage} toolbar={<SearchInput value={table.search} onChange={table.setSearch} placeholder="Search by name or code" />} emptyIcon={Building2} emptyTitle="No operators found" emptyDescription="Add an operator to start assigning buses and routes." />
      <OperatorDialog operator={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ── Stops ──────────────────────────────────────────────────────────────────

const stopSchema = z.object({
  name: z.string().trim().min(2, 'Enter the stop name').max(80),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  landmark: z.string().trim().max(120).optional(),
  address: z.string().trim().max(200).optional(),
  isActive: z.boolean(),
});
type StopValues = z.infer<typeof stopSchema>;

function StopDialog({ stop, open, onOpenChange }: { stop: Stop | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<StopValues>({ resolver: zodResolver(stopSchema) });
  useEffect(() => {
    if (open) form.reset({ name: stop?.name ?? '', city: stop?.city ?? '', landmark: stop?.landmark ?? '', address: stop?.address ?? '', isActive: stop?.isActive ?? true });
  }, [open, stop, form]);
  const save = useSave<StopValues>({ mutationFn: (v) => (stop ? adminApi.updateStop(stop._id, v) : adminApi.createStop(v)), success: stop ? 'Stop updated' : 'Stop created', onDone: () => onOpenChange(false), setError: form.setError });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={stop ? 'Edit stop' : 'Add stop'} description="Stops are the boarding and dropping points routes are built from." size="sm">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
          <Field label="City" htmlFor="stop-city" error={e.city?.message} required>
            <Input id="stop-city" aria-invalid={!!e.city} {...form.register('city')} />
          </Field>
          <Field label="Stop name" htmlFor="stop-name" error={e.name?.message} required>
            <Input id="stop-name" aria-invalid={!!e.name} {...form.register('name')} />
          </Field>
          <Field label="Landmark" htmlFor="stop-landmark" error={e.landmark?.message} hint="Shown to passengers on the ticket">
            <Input id="stop-landmark" {...form.register('landmark')} />
          </Field>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="size-4 accent-brand-700" {...form.register('isActive')} /> Active
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{stop ? 'Save changes' : 'Create stop'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StopsPage() {
  const table = useTableState({});
  const [editing, setEditing] = useState<Stop | null>(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['stops', table.page, table.search], queryFn: () => adminApi.stops({ page: table.page, limit: 10, search: table.search }), placeholderData: keepPreviousData });
  const openDialog = (s: Stop | null) => {
    setEditing(s);
    setOpen(true);
  };
  const columns: Column<Stop>[] = [
    { key: 'name', header: 'Stop', cell: (s) => <span className="font-semibold text-ink-900">{s.name}</span> },
    { key: 'city', header: 'City', cell: (s) => s.city },
    { key: 'landmark', header: 'Landmark', hideOnMobile: true, cell: (s) => s.landmark || '—' },
    { key: 'status', header: 'Status', cell: (s) => active(s.isActive) },
    { key: 'actions', header: '', align: 'right', cell: (s) => <Button variant="ghost" size="sm" onClick={() => openDialog(s)}><Pencil /> Edit</Button> },
  ];
  return (
    <>
      <PageHeader title="Stops" description="Boarding and dropping points across the network." actions={<Button onClick={() => openDialog(null)}><Plus /> Add stop</Button>} />
      <DataTable columns={columns} rows={query.data?.items} rowKey={(s) => s._id} loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} meta={query.data?.meta} onPageChange={table.setPage} toolbar={<SearchInput value={table.search} onChange={table.setSearch} placeholder="Search stops or cities" />} emptyIcon={MapPin} emptyTitle="No stops found" />
      <StopDialog stop={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ── Users ──────────────────────────────────────────────────────────────────

const userSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the full name').max(80),
    email: z.string().trim().email('Enter a valid email'),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, '10-digit mobile number').or(z.literal('')),
    password: z.string(),
    role: z.enum(['ADMIN', 'OPERATOR', 'PASSENGER']),
    operatorId: z.string(),
    isEdit: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'OPERATOR' && !v.operatorId) ctx.addIssue({ code: 'custom', path: ['operatorId'], message: 'Choose the operator this account manages' });
    if (!v.isEdit && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(v.password)) ctx.addIssue({ code: 'custom', path: ['password'], message: '8+ characters with upper, lower case and a number' });
  });
type UserValues = z.infer<typeof userSchema>;

function UserDialog({ user, open, onOpenChange }: { user: User | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const operators = useOperatorOptions(open);
  const form = useForm<UserValues>({ resolver: zodResolver(userSchema) });
  useEffect(() => {
    if (open) form.reset({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', password: '', role: user?.role ?? 'OPERATOR', operatorId: user?.operatorId ?? '', isEdit: !!user });
  }, [open, user, form]);
  const role = form.watch('role');
  const save = useSave<UserValues>({
    mutationFn: (v) => {
      const shared = { name: v.name, phone: v.phone || undefined, role: v.role, operatorId: v.role === 'OPERATOR' ? v.operatorId : null };
      return user ? adminApi.updateUser(user._id, shared) : adminApi.createUser({ ...shared, email: v.email, password: v.password });
    },
    success: user ? 'User updated' : 'User created',
    onDone: () => onOpenChange(false),
    setError: form.setError,
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={user ? 'Edit user' : 'Add user'} description="Create staff logins or adjust a user's role.">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="u-name" error={e.name?.message} required>
            <Input id="u-name" aria-invalid={!!e.name} {...form.register('name')} />
          </Field>
          <Field label="Mobile number" htmlFor="u-phone" error={e.phone?.message}>
            <Input id="u-phone" maxLength={10} aria-invalid={!!e.phone} {...form.register('phone')} />
          </Field>
          <Field label="Email" htmlFor="u-email" error={e.email?.message} required className={user ? 'sm:col-span-2' : ''}>
            <Input id="u-email" type="email" disabled={!!user} aria-invalid={!!e.email} {...form.register('email')} />
          </Field>
          {!user && (
            <Field label="Temporary password" htmlFor="u-password" error={e.password?.message} required>
              <Input id="u-password" type="password" autoComplete="new-password" aria-invalid={!!e.password} {...form.register('password')} />
            </Field>
          )}
          <Field label="Role" htmlFor="u-role" error={e.role?.message} required>
            <Select id="u-role" {...form.register('role')}>
              <option value="PASSENGER">Passenger</option>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          {role === 'OPERATOR' && (
            <Field label="Operator" htmlFor="u-operator" error={e.operatorId?.message} required>
              <Select id="u-operator" aria-invalid={!!e.operatorId} {...form.register('operatorId')}>
                <option value="">Select operator</option>
                {operators.data?.map((o) => (
                  <option key={o._id} value={o._id}>{o.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{user ? 'Save changes' : 'Create user'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const table = useTableState({ role: '' });
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState<User | null>(null);
  const query = useQuery({ queryKey: ['users', table.page, table.search, table.filters.role], queryFn: () => adminApi.users({ page: table.page, limit: 10, search: table.search, role: table.filters.role }), placeholderData: keepPreviousData });
  const toggle = useSave<User>({ mutationFn: (u) => adminApi.updateUser(u._id, { isActive: !u.isActive }), success: (u) => `${(u as User).name} ${(u as User).isActive ? 'reactivated' : 'deactivated'}`, onDone: () => setToggling(null) });
  const openDialog = (u: User | null) => {
    setEditing(u);
    setOpen(true);
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'User', cell: (u) => (<div><p className="font-semibold text-ink-900">{u.name}</p><p className="text-xs text-ink-500">{u.email}</p></div>) },
    { key: 'role', header: 'Role', cell: (u) => <StatusBadge status={u.role} /> },
    { key: 'operator', header: 'Operator', hideOnMobile: true, cell: (u) => u.operator?.name ?? '—' },
    { key: 'joined', header: 'Joined', hideOnMobile: true, cell: (u) => formatDate(u.createdAt) },
    { key: 'status', header: 'Status', cell: (u) => active(u.isActive) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openDialog(u)}><Pencil /> Edit</Button>
          {u._id !== me?._id && <Button variant="ghost" size="sm" onClick={() => setToggling(u)}>{u.isActive ? 'Deactivate' : 'Activate'}</Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Users" description="Passenger, operator and administrator accounts." actions={<Button onClick={() => openDialog(null)}><Plus /> Add user</Button>} />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(u) => u._id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        meta={query.data?.meta}
        onPageChange={table.setPage}
        emptyIcon={Users}
        emptyTitle="No users found"
        toolbar={
          <>
            <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search by name or email" />
            <Select value={table.filters.role} onChange={(e) => table.setFilter('role', e.target.value)} aria-label="Filter by role" className="w-40">
              <option value="">All roles</option>
              <option value="PASSENGER">Passengers</option>
              <option value="OPERATOR">Operators</option>
              <option value="ADMIN">Admins</option>
            </Select>
          </>
        }
      />
      <UserDialog user={editing} open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.isActive ? 'Deactivate user?' : 'Reactivate user?'}
        description={toggling?.isActive ? `${toggling.name} will be signed out and unable to sign in until reactivated.` : `${toggling?.name} will be able to sign in again.`}
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
        destructive={toggling?.isActive}
        loading={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
      />
    </>
  );
}
