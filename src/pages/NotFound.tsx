import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { TerminalNav } from "@/components/TerminalNav";
import { Button } from "@/components/ui/button";
import { BlinkingCursor } from "@/components/BlinkingCursor";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background crt-scanlines">
      <TerminalNav />
      
      <main className="flex items-center justify-center min-h-[calc(100vh-64px)] px-4">
        <div className="text-center max-w-2xl mx-auto">
          <div className="ascii-divider mb-8">
            <pre className="text-terminal-dim-green text-xs md:text-sm">
{`
    ███████╗██████╗ ██████╗  ██████╗ ██████╗ 
    ██╔════╝██╔══██╗██╔══██╗██╔═══██╗██╔══██╗
    █████╗  ██████╔╝██████╔╝██║   ██║██████╔╝
    ██╔══╝  ██╔══██╗██╔══██╗██║   ██║██╔══██╗
    ███████╗██║  ██║██║  ██║╚██████╔╝██║  ██║
    ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝
                     404
`}
            </pre>
          </div>

          <div className="bg-black/50 border border-primary p-6 mb-8 font-mono text-left glow-secondary">
            <div className="text-accent mb-2">~/404_handler $</div>
            <div className="text-primary text-lg mb-2">
              ERROR: Route not found<BlinkingCursor />
            </div>
            <div className="text-muted-foreground text-sm mb-4">
              // Attempted to access: {location.pathname}
            </div>
            <div className="text-destructive text-sm">
              {">"} FileNotFoundError: The requested path does not exist in the system
            </div>
          </div>

          <div className="mb-8">
            <p className="text-primary font-mono mb-4">
              The page you're looking for has been moved or doesn't exist.
            </p>
            <p className="text-muted-foreground font-mono text-sm">
              Return to the main terminal to continue your hacking journey.
            </p>
          </div>

          <Link to="/">
            <Button variant="command" size="lg">
              {"> return_to_base"}
            </Button>
          </Link>

          <div className="mt-12 ascii-divider">
            <div className="text-terminal-dim-green text-xs">
              {'─'.repeat(40)}
            </div>
            <p className="text-muted-foreground text-xs mt-2 font-mono">
              Error logged at {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
