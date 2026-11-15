import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  footer?: React.ReactNode;
}

/** Right-hand slide-over panel (Radix Dialog: focus trap, Esc to close, scroll lock). */
export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(({ className, children, title, description, footer, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn('fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-canvas shadow-raised data-[state=open]:animate-slide-in', className)}
      {...(description ? {} : { 'aria-describedby': undefined })}
      {...props}
    >
      <div className="flex items-start justify-between gap-4 border-b border-ink-200 bg-white px-5 py-4 sm:px-6">
        <div>
          <DialogPrimitive.Title className="text-lg font-bold text-ink-900">{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-500">{description}</DialogPrimitive.Description>}
        </div>
        <DialogPrimitive.Close className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
          <X className="size-5" />
        </DialogPrimitive.Close>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      {footer && <div className="border-t border-ink-200 bg-white px-5 py-4 sm:px-6">{footer}</div>}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
