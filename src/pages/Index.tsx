import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/casino/Chip";
import { ProfileSetup } from "@/components/casino/ProfileSetup";
import { useGameStore } from "@/store/gameStore";
import { Users, UserPlus, Settings, Sparkles } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  const { currentUser } = useGameStore();
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);

  useEffect(() => {
    // Check if user needs to set up profile
    if (!currentUser && pendingAction) {
      setShowProfileSetup(true);
    }
  }, [currentUser, pendingAction]);

  const handleAction = (action: 'create' | 'join') => {
    if (!currentUser) {
      setPendingAction(action);
      setShowProfileSetup(true);
    } else {
      navigate(action === 'create' ? '/create' : '/join');
    }
  };

  const handleProfileComplete = () => {
    setShowProfileSetup(false);
    if (pendingAction) {
      navigate(pendingAction === 'create' ? '/create' : '/join');
      setPendingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Chip color="gold" size="sm" />
          <span className="font-bold text-lg text-gradient-gold">DCC</span>
        </div>
        {currentUser && (
          <button 
            onClick={() => setShowProfileSetup(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            <span className="text-xl">{currentUser.avatar}</span>
            <span className="text-sm font-medium">{currentUser.name}</span>
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        {/* Floating Chips Animation */}
        <div className="relative mb-8">
          <div className="absolute -top-4 -left-8 animate-float" style={{ animationDelay: '0s' }}>
            <Chip color="red" size="md" />
          </div>
          <div className="absolute -top-8 right-0 animate-float" style={{ animationDelay: '0.5s' }}>
            <Chip color="blue" size="sm" />
          </div>
          <div className="absolute top-4 -right-6 animate-float" style={{ animationDelay: '1s' }}>
            <Chip color="green" size="md" />
          </div>
          <div className="relative z-10">
            <Chip color="gold" size="lg" value={100} />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 animate-fade-in-up">
          <span className="text-gradient-gold">Daddy Chill</span>
          <br />
          <span className="text-foreground">Casino</span>
        </h1>

        {/* Tagline */}
        <p className="text-xl text-muted-foreground mb-2 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          Chips, Not Games.
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          Bring real friends, not random tables. Buy chips, sit at a table, and settle later — all on mobile.
        </p>

        {/* CTA Buttons */}
        <div className="w-full max-w-xs space-y-3 stagger-children">
          <Button
            variant="gold"
            size="xl"
            className="w-full"
            onClick={() => handleAction('create')}
          >
            <Users className="w-5 h-5 mr-2" />
            Create Lobby
          </Button>
          
          <Button
            variant="outline"
            size="xl"
            className="w-full"
            onClick={() => handleAction('join')}
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Join Lobby
          </Button>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-3 gap-4 text-center max-w-sm animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="space-y-1">
            <div className="w-10 h-10 mx-auto rounded-full bg-emerald/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald" />
            </div>
            <p className="text-xs text-muted-foreground">Real-time sync</p>
          </div>
          <div className="space-y-1">
            <div className="w-10 h-10 mx-auto rounded-full bg-gold/20 flex items-center justify-center">
              <span className="text-lg">💰</span>
            </div>
            <p className="text-xs text-muted-foreground">Easy settlement</p>
          </div>
          <div className="space-y-1">
            <div className="w-10 h-10 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-lg">📱</span>
            </div>
            <p className="text-xs text-muted-foreground">Mobile-first</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-muted-foreground">
        For friends playing poker together. Not a gambling service.
      </footer>

      {/* Profile Setup Modal */}
      <ProfileSetup 
        open={showProfileSetup} 
        onComplete={handleProfileComplete}
      />
    </div>
  );
}
