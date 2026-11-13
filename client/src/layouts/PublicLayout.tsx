import { LayoutDashboard, LogOut, Menu, Ticket, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Logo } from '@/components/common/layout';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dialog';
import { homeFor, useAuth } from '@/features/auth/AuthContext';
import { cn, initials } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Book tickets', end: true },
  { to: '/help', label: 'Help & policies' },
];

export function UserMenu({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const home = homeFor(user.role);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('flex items-center gap-2 rounded-full p-1 pr-3 text-sm font-semibold transition-colors', tone === 'light' ? 'text-white hover:bg-white/10' : 'text-ink-800 hover:bg-ink-100')}
        aria-label="Account menu"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{initials(user.name)}</span>
        <span className="hidden max-w-32 truncate sm:block">{user.name.split(' ')[0]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="text-sm font-semibold text-ink-900">{user.name}</p>
          <p className="truncate text-xs text-ink-500">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(home)}>
          <LayoutDashboard /> {user.role === 'PASSENGER' ? 'My account' : 'Dashboard'}
        </DropdownMenuItem>
        {user.role === 'PASSENGER' && (
          <DropdownMenuItem onSelect={() => navigate('/account/bookings')}>
            <Ticket /> My bookings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate(`${home}/profile`)}>
          <UserRound /> Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            toast.success('You have been signed out');
            navigate('/');
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PublicLayout() {
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-raised">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {status === 'loading' ? (
              <div className="h-9 w-24 animate-pulse rounded-full bg-ink-100" />
            ) : user ? (
              <UserMenu />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Create account</Link>
                </Button>
              </div>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {open && (
          <nav className="container-page animate-fade-up space-y-1 border-t border-ink-100 py-3 md:hidden" aria-label="Mobile">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50">
                {item.label}
              </NavLink>
            ))}
            {!user && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" asChild>
                  <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register" onClick={() => setOpen(false)}>Create account</Link>
                </Button>
              </div>
            )}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="no-print mt-16 border-t border-ink-100 bg-ink-950 text-ink-300">
        <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo tone="light" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
              BusNest connects travellers with trusted intercity bus operators. Compare timings, pick your exact seat and get an instant digital ticket.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Travel</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/" className="hover:text-white">Search buses</Link></li>
              <li><Link to="/account/bookings" className="hover:text-white">Manage booking</Link></li>
              <li><Link to="/help#cancellation" className="hover:text-white">Cancellation policy</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Company</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/help" className="hover:text-white">About BusNest</Link></li>
              <li><Link to="/help#faq" className="hover:text-white">Help centre</Link></li>
              <li><Link to="/login" className="hover:text-white">Operator sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container-page flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-ink-500">
            <p>© {new Date().getFullYear()} BusNest. A demonstration project — payments and refunds are simulated.</p>
            <p>All times shown in IST.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
