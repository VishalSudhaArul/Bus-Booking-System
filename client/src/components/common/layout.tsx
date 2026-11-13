import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function Logo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2.5 font-extrabold tracking-tight', tone === 'light' ? 'text-white' : 'text-ink-950', className)} aria-label="BusNest home">
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-700 shadow-sm">
        <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
          <path d="M9 21V11.5A3.5 3.5 0 0 1 12.5 8h7A3.5 3.5 0 0 1 23 11.5V21" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 16h14" stroke="#f2a93b" strokeWidth="2" />
          <circle cx="12.5" cy="22.5" r="1.8" fill="#fff" />
          <circle cx="19.5" cy="22.5" r="1.8" fill="#fff" />
        </svg>
      </span>
      <span className="text-lg">
        Bus<span className={tone === 'light' ? 'text-accent-400' : 'text-brand-700'}>Nest</span>
      </span>
    </Link>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: string;
  tone?: 'brand' | 'accent' | 'info' | 'danger' | 'neutral';
  trend?: 'up' | 'down';
  loading?: boolean;
}

const statTones = {
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-100 text-accent-600',
  info: 'bg-blue-50 text-blue-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-ink-100 text-ink-600',
};

export function StatCard({ label, value, icon: Icon, hint, tone = 'brand', trend, loading }: StatCardProps) {
  return (
    <Card className="p-5 transition-shadow hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        <span className={cn('flex size-9 items-center justify-center rounded-xl', statTones[tone])}>
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="tabular mt-2 text-2xl font-bold text-ink-950">{value}</p>}
      {hint && (
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
          {trend === 'up' && <ArrowUpRight className="size-3.5 text-success" aria-hidden />}
          {trend === 'down' && <ArrowDownRight className="size-3.5 text-danger" aria-hidden />}
          {hint}
        </p>
      )}
    </Card>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, loading, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size="sm">
        <p className="text-sm text-ink-600">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
