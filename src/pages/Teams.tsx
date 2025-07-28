import { useState, useEffect } from "react";
import { TerminalNav } from "@/components/TerminalNav";
import { TerminalCard } from "@/components/TerminalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BlinkingCursor } from "@/components/BlinkingCursor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Team {
  id: string;
  team_name: string;
  hackathon_name: string;
  needed_skills: string | null;
  timeline: string | null;
  whatsapp_group: string | null;
  description: string | null;
  created_at: string;
  user_id: string;
}

const Teams = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    teamName: "",
    hackathonName: "",
    neededSkills: "",
    timeline: "",
    whatsappGroup: "",
    description: ""
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching teams:', error);
        return;
      }

      setTeams(data || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to create a team",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('teams')
        .insert({
          user_id: user.id,
          team_name: formData.teamName,
          hackathon_name: formData.hackathonName,
          needed_skills: formData.neededSkills,
          timeline: formData.timeline,
          whatsapp_group: formData.whatsappGroup,
          description: formData.description
        });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create team",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Team created successfully!",
      });

      setIsSubmitted(true);
      setFormData({
        teamName: "",
        hackathonName: "",
        neededSkills: "",
        timeline: "",
        whatsappGroup: "",
        description: ""
      });
      
      fetchTeams(); // Refresh the teams list
      setTimeout(() => setIsSubmitted(false), 3000);
    } catch (error) {
      console.error('Error creating team:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TerminalNav />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-primary font-mono mb-4">
            Create Team
          </h1>
          <p className="text-muted-foreground font-mono">
            Create a new team and recruit skilled coders for your project
          </p>
        </div>

        {isSubmitted && (
          <div className="mb-6 p-4 border border-primary bg-secondary/20 glow-secondary">
            <div className="terminal-success">Team creation request submitted</div>
            <div className="text-muted-foreground text-sm font-mono mt-1">
              Broadcasting to all active users...
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Team Basic Information */}
          <TerminalCard title="team_config.json">
            <div className="space-y-4">
              <div>
                <label className="text-primary font-mono text-sm mb-2 block">
                  {">"} team_name:
                </label>
                <Input
                  value={formData.teamName}
                  onChange={(e) => setFormData(prev => ({ ...prev, teamName: e.target.value }))}
                  placeholder="Enter your team name"
                  className="font-mono"
                />
              </div>
              
              <div>
                <label className="text-primary font-mono text-sm mb-2 block">
                  {">"} hackathon_event:
                </label>
                <Input
                  value={formData.hackathonName}
                  onChange={(e) => setFormData(prev => ({ ...prev, hackathonName: e.target.value }))}
                  placeholder="e.g., Smart India Hackathon 2024"
                  className="font-mono"
                />
              </div>
            </div>
          </TerminalCard>

          {/* Skills and Requirements */}
          <TerminalCard title="requirements.yaml">
            <div className="space-y-4">
              <div>
                <label className="text-primary font-mono text-sm mb-2 block">
                  {">"} required_skills: []
                </label>
                <Input
                  value={formData.neededSkills}
                  onChange={(e) => setFormData(prev => ({ ...prev, neededSkills: e.target.value }))}
                  placeholder="Frontend, Backend, UI/UX, Mobile Dev (comma separated)"
                  className="font-mono"
                />
                <div className="text-muted-foreground text-xs mt-1 font-mono">
                  # Specify the skills you need for your team
                </div>
              </div>
              
              <div>
                <label className="text-primary font-mono text-sm mb-2 block">
                  {">"} project_timeline:
                </label>
                <Input
                  value={formData.timeline}
                  onChange={(e) => setFormData(prev => ({ ...prev, timeline: e.target.value }))}
                  placeholder="e.g., 48 hours, 1 week, 1 month"
                  className="font-mono"
                />
              </div>
            </div>
          </TerminalCard>

          {/* Project Description */}
          <TerminalCard title="project_brief.md">
            <div>
              <label className="text-primary font-mono text-sm mb-2 block">
                {">"} description:
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe your project idea, goals, and what you're looking for in team members..."
                className="min-h-32 terminal-input font-mono"
              />
              <div className="text-muted-foreground text-xs mt-1 font-mono">
                # Markdown supported | Be specific about your vision
              </div>
            </div>
          </TerminalCard>

          {/* Communication */}
          <TerminalCard title="communication.cfg">
            <div>
              <label className="text-primary font-mono text-sm mb-2 block">
                {">"} whatsapp_group_link:
              </label>
              <Input
                value={formData.whatsappGroup}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsappGroup: e.target.value }))}
                placeholder="https://chat.whatsapp.com/... (optional)"
                className="font-mono"
              />
              <div className="text-muted-foreground text-xs mt-1 font-mono">
                # Optional: Pre-created group link for instant team coordination
              </div>
            </div>
          </TerminalCard>

          {/* ASCII Art Divider */}
          <div className="ascii-divider">
            <pre className="text-terminal-dim-green text-xs">
{`
    ╔═══════════════════════════════════════╗
    ║         EXECUTE TEAM FORMATION        ║
    ╚═══════════════════════════════════════╝
`}
            </pre>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center pt-6">
            <Button type="submit" variant="command" size="lg" className="px-8">
              {"> deploy_team --broadcast"}
            </Button>
          </div>
        </form>

        {/* Active Teams Section */}
        <div className="mt-16">
          <div className="text-primary font-mono text-lg mb-6">
            {">"} active_teams.list()<BlinkingCursor />
          </div>
          
          {loading ? (
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <TerminalCard key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-3 bg-muted rounded mb-4 w-3/4"></div>
                  <div className="h-20 bg-muted rounded"></div>
                </TerminalCard>
              ))}
            </div>
          ) : teams.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {teams.map((team) => (
                <TerminalCard key={team.id}>
                  <div className="mb-3">
                    <h3 className="text-primary font-mono">{team.team_name}</h3>
                    <div className="text-muted-foreground text-sm font-mono">
                      Event: {team.hackathon_name}
                    </div>
                  </div>
                  <div className="ascii-divider mb-3">{'─'.repeat(20)}</div>
                  {team.needed_skills && (
                    <div className="text-muted-foreground text-sm font-mono mb-3">
                      Looking for: {team.needed_skills}
                    </div>
                  )}
                  {team.description && (
                    <div className="text-muted-foreground text-xs font-mono mb-3 line-clamp-2">
                      {team.description}
                    </div>
                  )}
                  <div className="text-xs font-mono text-terminal-dim-green">
                    Timeline: {team.timeline || "TBD"} | Created: {new Date(team.created_at).toLocaleDateString()}
                  </div>
                  {team.whatsapp_group && (
                    <div className="mt-3">
                      <Button 
                        variant="terminal" 
                        size="sm" 
                        className="w-full justify-start"
                        onClick={() => window.open(team.whatsapp_group!, '_blank')}
                      >
                        {">"} Join WhatsApp Group
                      </Button>
                    </div>
                  )}
                </TerminalCard>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-muted-foreground font-mono">
                <div className="text-lg mb-2">{">"} No active teams found</div>
                <div className="text-sm">Be the first to create a team!</div>
              </div>
            </div>
          )}
        </div>

        {/* Terminal footer */}
        <div className="mt-12 ascii-divider">
          <div className="text-terminal-dim-green text-xs">
            {'─'.repeat(60)}
          </div>
          <p className="text-muted-foreground text-xs mt-2 font-mono">
            Active teams: {teams.length} | Total projects: {teams.length} | Response rate: 92.1%
          </p>
        </div>
      </main>
    </div>
  );
};

export default Teams;