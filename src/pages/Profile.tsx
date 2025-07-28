import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TerminalNav } from "@/components/TerminalNav";
import { TerminalCard } from "@/components/TerminalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BlinkingCursor } from "@/components/BlinkingCursor";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Profile = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: "",
    year: "",
    skills: "",
    interests: "",
    whatsapp: "",
    twitter: "",
    whatsappVisible: true,
    twitterVisible: true,
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }

    if (user) {
      // Load existing profile data
      const loadProfile = async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (data) {
          setFormData({
            name: data.name || "",
            year: data.year || "",
            skills: data.skills || "",
            interests: data.interests || "",
            whatsapp: data.whatsapp || "",
            twitter: data.twitter || "",
            whatsappVisible: data.whatsapp_visible ?? true,
            twitterVisible: data.twitter_visible ?? true,
          });
        }
      };

      loadProfile();
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          name: formData.name,
          year: formData.year,
          skills: formData.skills,
          interests: formData.interests,
          whatsapp: formData.whatsapp,
          twitter: formData.twitter,
          whatsapp_visible: formData.whatsappVisible,
          twitter_visible: formData.twitterVisible,
        });

      if (error) throw error;

      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
      
      toast({
        title: "Profile saved successfully",
        description: "Your profile has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error saving profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <TerminalNav />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-primary font-mono mb-4">
            Setup Profile
          </h1>
        </div>

        {isSubmitted && (
          <div className="mb-6 p-4 border border-primary bg-secondary/20 glow-secondary">
            <div className="terminal-success">Profile initialized successfully</div>
            <div className="text-muted-foreground text-sm font-mono mt-1">
              Ready to connect with fellow hackers...
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <TerminalCard title="personal_info.json">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-primary font-mono">
                  {">"} name:
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter your name"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="year" className="text-primary font-mono">
                  {">"} academic_year:
                </Label>
                <Input
                  id="year"
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                  placeholder="e.g., 2nd Year"
                  className="mt-1"
                />
              </div>
            </div>
          </TerminalCard>

          {/* Skills and Interests */}
          <TerminalCard title="technical_stack.yaml">
            <div className="space-y-4">
              <div>
                <Label htmlFor="skills" className="text-primary font-mono">
                  {">"} skills: []
                </Label>
                <Input
                  id="skills"
                  value={formData.skills}
                  onChange={(e) => setFormData(prev => ({ ...prev, skills: e.target.value }))}
                  placeholder="JavaScript, Python, React, Node.js (comma separated)"
                  className="mt-1"
                />
                <div className="text-muted-foreground text-xs mt-1 font-mono">
                  # Separate skills with commas
                </div>
              </div>
              
              <div>
                <Label htmlFor="interests" className="text-primary font-mono">
                  {">"} interests:
                </Label>
                <Textarea
                  id="interests"
                  value={formData.interests}
                  onChange={(e) => setFormData(prev => ({ ...prev, interests: e.target.value }))}
                  placeholder="Web development, AI/ML, Cybersecurity, Game dev..."
                  className="mt-1 min-h-20 terminal-input font-mono"
                />
              </div>
            </div>
          </TerminalCard>

          {/* Contact Information */}
          <TerminalCard title="contact_methods.cfg">
            <div className="space-y-4">
              <div>
                <Label htmlFor="whatsapp" className="text-primary font-mono">
                  {">"} whatsapp_number:
                </Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                  placeholder="+91XXXXXXXXXX (optional)"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="twitter" className="text-primary font-mono">
                  {">"} x_handle:
                </Label>
                <Input
                  id="twitter"
                  value={formData.twitter}
                  onChange={(e) => setFormData(prev => ({ ...prev, twitter: e.target.value }))}
                  placeholder="@username (optional)"
                  className="mt-1"
                />
              </div>
            </div>
          </TerminalCard>

          {/* Privacy Settings */}
          <TerminalCard title="privacy_settings.ini">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border border-muted">
                <div>
                  <Label className="text-primary font-mono">
                    --show-whatsapp
                  </Label>
                  <div className="text-muted-foreground text-sm font-mono">
                    Make WhatsApp visible to other users
                  </div>
                </div>
                <Switch
                  checked={formData.whatsappVisible}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, whatsappVisible: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between p-3 border border-muted">
                <div>
                  <Label className="text-primary font-mono">
                    --show-twitter
                  </Label>
                  <div className="text-muted-foreground text-sm font-mono">
                    Make X handle visible to other users
                  </div>
                </div>
                <Switch
                  checked={formData.twitterVisible}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, twitterVisible: checked }))
                  }
                />
              </div>
            </div>
          </TerminalCard>

          {/* Submit Button */}
          <div className="flex justify-center pt-6">
            <Button type="submit" variant="command" size="lg" disabled={isLoading}>
              {isLoading ? "Saving..." : "> save_profile --execute"}
            </Button>
          </div>
        </form>

        {/* Terminal footer */}
        <div className="mt-12 ascii-divider">
          <div className="text-terminal-dim-green text-xs">
            {'─'.repeat(60)}
          </div>
          <p className="text-muted-foreground text-xs mt-2 font-mono">
            Profile completion: {Object.values(formData).filter(v => v).length}/8 fields
          </p>
        </div>
      </main>
    </div>
  );
};

export default Profile;