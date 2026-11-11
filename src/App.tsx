import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/app/AppShell";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { ScrollToTop } from "./components/app/ScrollToTop";
import { PageSpinner } from "./components/ui/states";
import { useMe } from "./lib/queries";
import Landing from "./pages/Landing";

const SignIn = lazy(() => import("./pages/auth/SignIn"));
const SignUp = lazy(() => import("./pages/auth/SignUp"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Recover = lazy(() => import("./pages/Recover"));
const Discover = lazy(() => import("./pages/Discover"));
const Person = lazy(() => import("./pages/Person"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const Teams = lazy(() => import("./pages/teams/Teams"));
const TeamPage = lazy(() => import("./pages/teams/TeamPage"));
const TeamEditor = lazy(() => import("./pages/teams/TeamEditor"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Signed-in only. Unfinished profiles are sent to onboarding first. */
function RequireAuth({ children, allowUnonboarded = false }: { children: ReactNode; allowUnonboarded?: boolean }) {
  const { data: me, isPending, error } = useMe();
  const loc = useLocation();
  if (isPending) return <PageSpinner />;
  if (error) throw error;
  if (!me) return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!allowUnonboarded && !me.profile.onboarded) return <Navigate to={`/onboarding?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

/** Auth pages bounce signed-in users into the app. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe();
  if (isPending) return <PageSpinner />;
  if (me) return <Navigate to={me.profile.onboarded ? "/discover" : "/onboarding"} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <ScrollToTop />
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sign-in" element={<GuestOnly><SignIn /></GuestOnly>} />
          <Route path="/sign-up" element={<GuestOnly><SignUp /></GuestOnly>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/onboarding" element={<RequireAuth allowUnonboarded><Onboarding /></RequireAuth>} />
          <Route path="/recover" element={<RequireAuth allowUnonboarded><Recover /></RequireAuth>} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/discover" element={<Discover />} />
            <Route path="/people/:id" element={<Person />} />
            <Route path="/profile" element={<EditProfile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/new" element={<TeamEditor />} />
            <Route path="/teams/:id" element={<TeamPage />} />
            <Route path="/teams/:id/edit" element={<TeamEditor />} />
          </Route>
          {/* old routes from v1 */}
          <Route path="/browse" element={<Navigate to="/discover" replace />} />
          <Route path="/auth" element={<Navigate to="/sign-in" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
