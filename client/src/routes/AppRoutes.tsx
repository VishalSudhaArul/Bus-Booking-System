import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PageLoader } from '@/components/common/feedback';
import { GuestOnly, ProtectedRoute } from '@/features/auth/AuthContext';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { HomePage } from '@/pages/public/HomePage';

/** Code-split a named export so passengers never download the admin console. */
function lazyNamed<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}

const publicPages = () => import('@/pages/public/SearchResultsPage');
const SearchResultsPage = lazyNamed(publicPages, 'SearchResultsPage');
const TripDetailsPage = lazyNamed(() => import('@/pages/public/TripDetailsPage'), 'TripDetailsPage');
const CheckoutPage = lazyNamed(() => import('@/pages/public/CheckoutPage'), 'CheckoutPage');
const auth = () => import('@/pages/public/AuthPages');
const LoginPage = lazyNamed(auth, 'LoginPage');
const RegisterPage = lazyNamed(auth, 'RegisterPage');
const help = () => import('@/pages/public/HelpPage');
const HelpPage = lazyNamed(help, 'HelpPage');
const NotFoundPage = lazyNamed(help, 'NotFoundPage');

const account = () => import('@/pages/account/AccountPages');
const AccountOverviewPage = lazyNamed(account, 'AccountOverviewPage');
const MyBookingsPage = lazyNamed(account, 'MyBookingsPage');
const ProfilePage = lazyNamed(() => import('@/pages/account/ProfilePage'), 'ProfilePage');
const BookingDetails = lazy(() => account().then((m) => ({ default: (p: { backTo: string }) => <m.BookingDetailsPage {...p} /> })));
const Cancellations = lazy(() => account().then((m) => ({ default: (p: { title?: string; description?: string }) => <m.CancellationsPage {...p} /> })));

const DashboardPage = lazyNamed(() => import('@/pages/staff/DashboardPage'), 'DashboardPage');
const master = () => import('@/pages/staff/MasterDataPages');
const OperatorsPage = lazyNamed(master, 'OperatorsPage');
const StopsPage = lazyNamed(master, 'StopsPage');
const UsersPage = lazyNamed(master, 'UsersPage');
const fleet = () => import('@/pages/staff/FleetPages');
const BusesPage = lazyNamed(fleet, 'BusesPage');
const BusDetailPage = lazyNamed(fleet, 'BusDetailPage');
const network = () => import('@/pages/staff/NetworkPages');
const RoutesPage = lazyNamed(network, 'RoutesPage');
const TripsPage = lazyNamed(network, 'TripsPage');
const ops = () => import('@/pages/staff/OperationsPages');
const StaffBookingsPage = lazyNamed(ops, 'StaffBookingsPage');
const ManifestsPage = lazyNamed(ops, 'ManifestsPage');
const ReportsPage = lazyNamed(ops, 'ReportsPage');
const AuditPage = lazyNamed(ops, 'AuditPage');

/** Pages shared by the admin and operator consoles; the API scopes the data. */
function staffRoutes(base: '/admin' | '/operator') {
  return (
    <>
      <Route index element={<DashboardPage />} />
      <Route path="trips" element={<TripsPage />} />
      <Route path="bookings" element={<StaffBookingsPage />} />
      <Route path="bookings/:id" element={<BookingDetails backTo={`${base}/bookings`} />} />
      <Route path="manifests" element={<ManifestsPage />} />
      <Route path="cancellations" element={<Cancellations title="Cancellations & refunds" description="Cancelled bookings and the simulated refunds issued." />} />
      <Route path="buses" element={<BusesPage />} />
      <Route path="buses/:id" element={<BusDetailPage />} />
      <Route path="routes" element={<RoutesPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="profile" element={<ProfilePage />} />
    </>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchResultsPage />} />
          <Route path="trips/:id" element={<TripDetailsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="about" element={<HelpPage />} />
          <Route element={<ProtectedRoute roles={['PASSENGER']} />}>
            <Route path="checkout" element={<CheckoutPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<GuestOnly />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['PASSENGER']} />}>
          <Route path="account" element={<DashboardLayout />}>
            <Route index element={<AccountOverviewPage />} />
            <Route path="bookings" element={<MyBookingsPage />} />
            <Route path="bookings/:id" element={<BookingDetails backTo="/account/bookings" />} />
            <Route path="cancellations" element={<Cancellations />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route path="admin" element={<DashboardLayout />}>
            {staffRoutes('/admin')}
            <Route path="operators" element={<OperatorsPage />} />
            <Route path="stops" element={<StopsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['OPERATOR']} />}>
          <Route path="operator" element={<DashboardLayout />}>
            {staffRoutes('/operator')}
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
