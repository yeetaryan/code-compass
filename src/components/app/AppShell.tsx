import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu as MenuIcon, Settings, UserRound, UserPen } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { WelcomeBackBanner } from "./WelcomeBack";

const NAV = [
  { to: "/discover", label: "Discover" },
  { to: "/teams", label: "Teams" },
];

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/", { replace: true });
    toast("Signed out");
  };
}

export function AppShell() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const pending = me.pendingRequestsToReview;

  const link = ({ isActive }: { isActive: boolean }) =>
    cn("relative rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors", isActive ? "bg-subtle text-ink" : "text-ink-3 hover:text-ink");

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo to="/discover" />
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={link}>
                  {n.label}
                  {n.to === "/teams" && pending > 0 && <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-needle px-1.5 text-[0.7rem] text-white">{pending}</span>}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/teams/new" className="hidden h-9 items-center rounded-full border border-line-strong bg-surface px-4 text-[0.85rem] font-medium shadow-xs hover:bg-subtle sm:inline-flex">
              Start a team
            </Link>
            <Menu>
              <MenuTrigger className="hidden rounded-full md:block" aria-label="Account menu">
                <Avatar name={me.profile.name} src={me.profile.avatarUrl} size={36} />
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>
                  <span className="block font-medium text-ink">{me.profile.name}</span>
                  <span className="block truncate">{me.user.email}</span>
                </MenuLabel>
                <MenuSeparator />
                <MenuItem asChild><Link to={`/people/${me.user.id}`}><UserRound /> View my profile</Link></MenuItem>
                <MenuItem asChild><Link to="/profile"><UserPen /> Edit profile</Link></MenuItem>
                <MenuItem asChild><Link to="/settings"><Settings /> Settings</Link></MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={signOut}><LogOut /> Sign out</MenuItem>
              </MenuContent>
            </Menu>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-subtle md:hidden" aria-label="Open menu">
                <MenuIcon className="size-5" />
              </DialogTrigger>
              <DialogContent title="Menu" side="right">
                <div className="mb-6 flex items-center gap-3">
                  <Avatar name={me.profile.name} src={me.profile.avatarUrl} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{me.profile.name}</p>
                    <p className="truncate text-[0.85rem] text-ink-3">{me.user.email}</p>
                  </div>
                </div>
                <nav className="flex flex-col gap-1" aria-label="Mobile">
                  {[...NAV, { to: "/teams/new", label: "Start a team" }, { to: `/people/${me.user.id}`, label: "My profile" }, { to: "/profile", label: "Edit profile" }, { to: "/settings", label: "Settings" }].map((n) => (
                    <NavLink key={n.to} to={n.to} end onClick={() => setOpen(false)} className={({ isActive }) => cn("flex items-center justify-between rounded-xl px-4 py-3 text-[1rem] font-medium", isActive ? "bg-subtle" : "hover:bg-subtle")}>
                      {n.label}
                      {n.to === "/teams" && pending > 0 && <span className="rounded-full bg-needle px-2 text-[0.75rem] text-white">{pending}</span>}
                    </NavLink>
                  ))}
                </nav>
                <button onClick={signOut} className="mt-auto flex items-center gap-2 rounded-xl px-4 py-3 text-left font-medium text-ink-2 hover:bg-subtle">
                  <LogOut className="size-4" /> Sign out
                </button>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {me.recovery.state === "restored" && !me.recovery.acknowledged && (
          <div className="container-page pt-6">
            <WelcomeBackBanner recovery={me.recovery} />
          </div>
        )}
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-[0.82rem] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Code Compass</span>
          <span>Only signed-in members can see profiles. You control which contact details are shown.</span>
        </div>
      </footer>
    </div>
  );
}
