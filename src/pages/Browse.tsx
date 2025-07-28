import { useState, useEffect } from "react";
import { TerminalNav } from "@/components/TerminalNav";
import { TerminalCard, SkillTag } from "@/components/TerminalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlinkingCursor } from "@/components/BlinkingCursor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  name: string | null;
  year: string | null;
  skills: string | null;
  interests: string | null;
  whatsapp: string | null;
  twitter: string | null;
  created_at: string;
  whatsapp_visible: boolean | null;
  twitter_visible: boolean | null;
}

const Browse = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to fetch profiles",
          variant: "destructive",
        });
        return;
      }

      const profilesWithData = data?.filter(profile => 
        profile.name && (profile.skills || profile.interests)
      ) || [];
      
      setProfiles(profilesWithData);
      setFilteredProfiles(profilesWithData);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (!term) {
      setFilteredProfiles(profiles);
      return;
    }
    
    const filtered = profiles.filter(profile => 
      profile.name?.toLowerCase().includes(term.toLowerCase()) ||
      profile.skills?.toLowerCase().includes(term.toLowerCase()) ||
      profile.interests?.toLowerCase().includes(term.toLowerCase())
    );
    setFilteredProfiles(filtered);
  };

  const getLastActive = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  return (
    <div className="min-h-screen bg-background">
      <TerminalNav />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-primary font-mono mb-4">
            Browse Coders
          </h1>
          
          {/* Search */}
          <div className="max-w-md">
            <Input
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, skills, or interests..."
              className="mb-4"
            />
          </div>
          
          <div className="text-muted-foreground text-sm font-mono">
            {loading ? "Loading profiles..." : `Found ${filteredProfiles.length} active hackers`}
          </div>
        </div>

        {/* Coders Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <TerminalCard key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded mb-4 w-3/4"></div>
                <div className="h-20 bg-muted rounded"></div>
              </TerminalCard>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProfiles.map((profile) => (
              <TerminalCard key={profile.id} className="hover:animate-crt-flicker">
                {/* Header */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-primary font-mono text-lg">{profile.name || "Anonymous"}</h3>
                    <span className="text-accent text-sm font-mono">#{profile.id.slice(-3)}</span>
                  </div>
                  <div className="text-muted-foreground text-sm font-mono">
                    Year: {profile.year || "N/A"} | Active: {getLastActive(profile.created_at)}
                  </div>
                </div>

                <div className="ascii-divider mb-4">
                  {'─'.repeat(25)}
                </div>

                {/* Skills */}
                {profile.skills && (
                  <div className="mb-4">
                    <div className="text-primary font-mono text-sm mb-2">
                      {">"} skills.list():
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.split(',').map((skill, index) => (
                        <SkillTag key={index} skill={skill.trim()} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Interests */}
                {profile.interests && (
                  <div className="mb-6">
                    <div className="text-primary font-mono text-sm mb-2">
                      {">"} interests:
                    </div>
                    <p className="text-muted-foreground text-sm font-mono leading-relaxed">
                      {profile.interests}
                    </p>
                  </div>
                )}

                {/* Contact Buttons */}
                <div className="space-y-2">
                  {profile.whatsapp && profile.whatsapp_visible && (
                    <Button 
                      variant="terminal" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => window.open(`https://wa.me/${profile.whatsapp?.replace(/\D/g, '')}`, '_blank')}
                    >
                      {">"} WhatsApp
                    </Button>
                  )}
                  {profile.twitter && profile.twitter_visible && (
                    <Button 
                      variant="terminal" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => window.open(`https://x.com/${profile.twitter?.replace('@', '')}`, '_blank')}
                    >
                      {">"} X Handle
                    </Button>
                  )}
                </div>

                {/* Status indicator */}
                <div className="mt-4 pt-3 border-t border-muted">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <span className="text-muted-foreground text-xs font-mono">
                      STATUS: ONLINE
                    </span>
                  </div>
                </div>
              </TerminalCard>
            ))}
          </div>
        )}

        {!loading && filteredProfiles.length === 0 && (
          <div className="text-center py-12">
            <div className="text-muted-foreground font-mono">
              {profiles.length === 0 ? (
                <>
                  <div className="text-lg mb-2">{">"} No profiles found</div>
                  <div className="text-sm">No users have created profiles yet</div>
                </>
              ) : (
                <>
                  <div className="text-lg mb-2">{">"} No results found</div>
                  <div className="text-sm">Try adjusting your search terms</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Terminal footer */}
        <div className="mt-12 ascii-divider">
          <div className="text-terminal-dim-green text-xs">
            {'─'.repeat(60)}
          </div>
          <p className="text-muted-foreground text-xs mt-2 font-mono">
            Query executed in 0.{Math.floor(Math.random() * 900 + 100)}ms | Memory usage: {Math.floor(Math.random() * 40 + 20)}MB
          </p>
        </div>
      </main>
    </div>
  );
};

export default Browse;