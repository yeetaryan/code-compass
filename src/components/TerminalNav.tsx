import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "home", path: "/" },
  { label: "browse", path: "/browse" },
  { label: "teams", path: "/teams" },
  { label: "profile", path: "/profile" },
];

export function TerminalNav() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <nav className="terminal-nav px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className="text-accent font-mono">$</span>
          <span className="text-primary font-mono">Code_Compass</span>
          <span className="cursor animate-blink"></span>
        </div>
        
        <div className="flex items-center space-x-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "terminal-nav-item",
                location.pathname === item.path && "text-accent"
              )}
            >
              {item.label}
            </Link>
          ))}
          
          {user ? (
            <Button 
              variant="ghost" 
              onClick={signOut}
              className="text-muted-foreground hover:text-primary font-mono text-sm p-0 h-auto"
            >
              logout
            </Button>
          ) : (
            <Link 
              to="/auth" 
              className={cn(
                "terminal-nav-item",
                location.pathname === "/auth" && "text-accent"
              )}
            >
              login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}