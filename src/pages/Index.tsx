import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TerminalNav } from "@/components/TerminalNav";
import { BlinkingCursor } from "@/components/BlinkingCursor";

const Index = () => {
  const [displayText, setDisplayText] = useState("");
  const fullText = "> find_your_hack_partner();";

  useEffect(() => {
    let currentIndex = 0;
    const timer = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(timer);
      }
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TerminalNav />
      
      <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4">
        <div className="text-center max-w-4xl mx-auto">
          {/* App Title */}
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-mono text-primary mb-2">
              Code Compass
            </h1>
            <p className="text-muted-foreground font-mono">
              Find your hack partner at MUJ
            </p>
          </div>

          {/* Main Terminal Command */}
          <div className="bg-black/50 border border-primary p-6 mb-8 font-mono text-left max-w-2xl mx-auto glow-secondary">
            <div className="text-accent mb-2">~/MUJ/hackathons $</div>
            <div className="text-primary text-xl md:text-2xl mb-4">
              {displayText}
              {displayText.length === fullText.length && <BlinkingCursor />}
            </div>
            <div className="text-muted-foreground text-sm">
              // Find coding partners for hackathons and projects
            </div>
          </div>

          {/* Description */}
          <div className="mb-8 space-y-4">
            <p className="text-lg text-primary font-mono">
              Connect with fellow MUJ students who share your passion for coding.
            </p>
            <p className="text-muted-foreground font-mono">
              Match based on skills, interests, and hackathon goals.
            </p>
          </div>

          {/* Terminal Command Buttons */}
          <div className="space-y-4 md:space-y-0 md:space-x-4 md:flex md:justify-center">
            <Link to="/profile">
              <Button variant="command" size="lg" className="w-full md:w-auto">
                {"> start_matching"}
              </Button>
            </Link>
            <Link to="/browse">
              <Button variant="terminal" size="lg" className="w-full md:w-auto">
                {"> browse_coders"}
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            <div className="bg-card border border-primary p-6">
              <h3 className="text-primary font-mono text-lg mb-3">Skill Matching</h3>
              <p className="text-muted-foreground text-sm">
                Find coders with complementary skills for your projects
              </p>
            </div>
            
            <div className="bg-card border border-primary p-6">
              <h3 className="text-primary font-mono text-lg mb-3">Team Building</h3>
              <p className="text-muted-foreground text-sm">
                Create and join teams for hackathons and competitions
              </p>
            </div>
            
            <div className="bg-card border border-primary p-6">
              <h3 className="text-primary font-mono text-lg mb-3">Easy Connect</h3>
              <p className="text-muted-foreground text-sm">
                Direct contact through WhatsApp and social platforms
              </p>
            </div>
          </div>

          {/* Terminal footer */}
          <div className="mt-12 ascii-divider">
            <div className="text-terminal-dim-green text-xs">
              {'═'.repeat(60)}
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              System Status: ONLINE | Active Users: 127 | Last Updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
