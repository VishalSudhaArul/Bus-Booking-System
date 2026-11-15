import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CheckCircle2, Download, Ticket as TicketIcon, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Booking } from '@/types';
import { Ticket } from './Ticket';

/**
 * Shown right after a booking is confirmed. "Download ticket" opens the
 * browser's print dialog, where the pass can be saved as a PDF.
 */
export function BoardingPassModal({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="no-print fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 overflow-y-auto p-4 focus:outline-none sm:p-8" aria-describedby={undefined}>
          {booking && (
            <div className="mx-auto max-w-3xl animate-pop">
              <div className="no-print mb-4 flex items-start justify-between gap-4 rounded-2xl bg-white p-4 shadow-raised">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="size-6" aria-hidden />
                  </span>
                  <div>
                    <DialogPrimitive.Title className="text-lg font-bold text-ink-900">Booking confirmed!</DialogPrimitive.Title>
                    <p className="text-sm text-ink-600">
                      Your seats are reserved. PNR <span className="font-mono font-bold text-ink-900">{booking.pnr}</span>
                    </p>
                  </div>
                </div>
                <DialogPrimitive.Close className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>

              <Ticket booking={booking} />

              <div className="no-print mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" asChild>
                  <Link to={`/account/bookings/${booking._id}`} onClick={onClose}>
                    <TicketIcon /> View in My bookings
                  </Link>
                </Button>
                <Button onClick={() => window.print()}>
                  <Download /> Download ticket
                </Button>
              </div>
              <p className="no-print mt-2 text-right text-xs text-white/80">Choose “Save as PDF” in the print dialog to download.</p>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
