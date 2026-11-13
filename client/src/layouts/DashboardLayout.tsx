import {
  BarChart3,
  Building2,
  Bus,
  CalendarClock,
  ClipboardList,
  History,
  LayoutDashboard,
  MapPin,
  Menu,
  ReceiptText,
  Route as RouteIcon,
  ScrollText,
  Search,
  Ticket,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/common/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { cn, titleCase } from '@/lib/utils';
import type { Role } from '@/types';
import { UserMenu } from './PublicLayout';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const staffNav = (base: string, admin: boolean): NavGroup[] => [
  { title: 'Overview', items: [{ to: base, label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Operations',
    items: [
      { to: `${base}/trips`, label: 'Trips & fares', icon: CalendarClock },
      { to: `${base}/bookings`, label: 'Bookings', icon: Ticket },
      { to: `${base}/manifests`, label: 'Passenger manifests', icon: ClipboardList },
      { to: `${base}/cancellations`, label: 'Cancellations & refunds', icon: ReceiptText },
    ],
  },
  {
    title: 'Fleet & network',
    items: [
      ...(admin ? [{ to: `${base}/operators`, label: 'Operators', icon: Building2 }] : []),
      { to: `${base}/buses`, label: admin ? 'Buses & seat layouts' : 'My buses', icon: Bus },
      { to: `${base}/routes`, label: admin ? 'Routes' : 'My routes', icon: RouteIcon },
      ...(admin ? [{ to: `${base}/stops`, label: 'Stops', icon: MapPin }] : []),
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: `${base}/reports`, label: 'Reports', icon: BarChart3 },
      ...(admin
        ? [
            { to: `${base}/users`, label: 'Users', icon: Users },
            { to: `${base}/audit`, label: 'Audit log', icon: ScrollText },
          ]
        : []),
    ],
  },
];

const passengerNav: NavGroup[] = [
  {
    title: 'My travel',
    items: [
      { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/account/bookings', label: 'My bookings', icon: Ticket },
      { to: '/account/cancellations', label: 'Cancellation history', icon: History },
    ],
  },
  { title: 'Account', items: [{ to: '/account/profile', label: 'My profile', icon: UserRound }] },
];

const navFor = (role: Role): NavGroup[] => (role === 'ADMIN' ? staffNav('/admin', true) : role === 'OPERATOR' ? staffNav('/operator', false) : passengerNav);

function Sidebar({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Dashboard">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{group.title}</p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn('size-4.5 shrink-0 transition-colors', isActive ? 'text-accent-400' : 'text-ink-500 group-hover:text-ink-300')} aria-hidden />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DashboardLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  if (!user) return null;
  const groups = navFor(user.role);

  const brand = (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
      <Logo tone="light" />
      <button type="button" className="rounded-md p-1.5 text-ink-300 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
        <X className="size-5" />
      </button>
    </div>
  );
  const footer = (
    <div className="border-t border-white/10 p-4">
      <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-300 hover:bg-white/5 hover:text-white">
        <Search className="size-4" aria-hidden /> {user.role === 'PASSENGER' ? 'Book a new trip' : 'View passenger site'}
      </Link>
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink-950 lg:flex">
        {brand}
        <Sidebar groups={groups} />
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fade-up flex-col bg-ink-950 shadow-raised">
            {brand}
            <Sidebar groups={groups} onNavigate={() => setOpen(false)} />
            {footer}
          </aside>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-ink-100 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-ink-900">{user.role === 'PASSENGER' ? 'My account' : user.role === 'ADMIN' ? 'Administration' : (user.operator?.name ?? 'Operator console')}</p>
            <p className="text-xs text-ink-500">Signed in as {user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={user.role === 'ADMIN' ? 'brand' : user.role === 'OPERATOR' ? 'info' : 'neutral'}>{titleCase(user.role)}</Badge>
          <UserMenu />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl animate-fade-up px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
