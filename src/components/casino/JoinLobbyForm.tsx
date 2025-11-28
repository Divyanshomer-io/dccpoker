import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, LogIn } from "lucide-react";
import { useGameStore } from "@/store/gameStore";
import { useLobby } from "@/hooks/useLobby";
import { toast } from "@/hooks/use-toast";

export function JoinLobbyForm() {
  const navigate = useNavigate();
  const { currentUser } = useGameStore();
  const { joinLobby, loading } = useLobby();
  
  const [lobbyId, setLobbyId] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      toast({ title: "Error", description: "Please set up your profile first", variant: "destructive" });
      return;
    }

    if (!lobbyId.trim() || !password.trim()) {
      toast({ title: "Error", description: "Please enter lobby ID and password", variant: "destructive" });
      return;
    }

    const success = await joinLobby(lobbyId.trim(), password.trim());
    if (success) {
      navigate(`/lobby/${lobbyId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-gradient-gold">Join Lobby</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <LogIn className="w-5 h-5 text-gold" />
                Enter Lobby Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lobbyId">Lobby ID</Label>
                <Input
                  id="lobbyId"
                  value={lobbyId}
                  onChange={(e) => setLobbyId(e.target.value)}
                  placeholder="Enter full lobby ID"
                  className="h-12 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Paste the complete lobby ID shared by the host
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.toUpperCase())}
                  placeholder="Enter password"
                  className="h-12 font-mono tracking-widest"
                  maxLength={8}
                />
              </div>

              <Button 
                type="submit" 
                variant="gold" 
                size="xl" 
                className="w-full"
                disabled={loading}
              >
                {loading ? "Joining..." : "Join Lobby"}
              </Button>
            </CardContent>
          </Card>
        </form>

        {/* Info */}
        <Card className="glass-card">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Ask the host for the Lobby ID and Password to join their game.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
