import { AlertTriangle, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { cn, titleCase } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-red-50 text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink-900">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-500" role="status">
      <Loader2 className="size-6 animate-spin text-brand-600" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  CONFIRMED: 'success',
  ACTIVE: 'success',
  PAID: 'success',
  PROCESSED: 'success',
  COMPLETED: 'neutral',
  SCHEDULED: 'info',
  DEPARTED: 'warning',
  PENDING: 'warning',
  PARTIALLY_REFUNDED: 'warning',
  REFUNDED: 'info',
  CANCELLED: 'danger',
  INACTIVE: 'neutral',
  NOT_REFUNDED: 'neutral',
  NOT_APPLICABLE: 'neutral',
  ADMIN: 'brand',
  OPERATOR: 'info',
  PASSENGER: 'neutral',
};

/** One consistent colour language for every status in the app. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot className={className}>
      {titleCase(status)}
    </Badge>
  );
}
