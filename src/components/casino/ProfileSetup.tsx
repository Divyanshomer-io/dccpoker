import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AVATAR_EMOJIS } from "@/types/casino";
import { useGameStore, generateId } from "@/store/gameStore";

interface ProfileSetupProps {
  open: boolean;
  onComplete: () => void;
}

export function ProfileSetup({ open, onComplete }: ProfileSetupProps) {
  const { currentUser, setCurrentUser } = useGameStore();
  const [name, setName] = useState(currentUser?.name || "");
  const [avatar, setAvatar] = useState(currentUser?.avatar || "🎰");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name");
      return;
    }
    if (trimmedName.length > 20) {
      setError("Name must be 20 characters or less");
      return;
    }

    setCurrentUser({
      id: currentUser?.id || generateId(),
      name: trimmedName,
      avatar,
      createdAt: currentUser?.createdAt || new Date(),
    });

    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md bg-card border-border" hideClose>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gradient-gold">
            Welcome to Daddy Chill Casino
          </DialogTitle>
          <DialogDescription>
            Set up your profile to start playing
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Avatar Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Choose Your Avatar</Label>
            <div className="grid grid-cols-8 gap-2">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={cn(
                    "w-10 h-10 text-xl rounded-lg transition-all",
                    "flex items-center justify-center",
                    avatar === emoji
                      ? "bg-primary/20 ring-2 ring-primary scale-110"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Display Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="Enter your name"
              className="h-12 text-lg"
              maxLength={20}
              autoComplete="off"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Preview */}
          <div className="bg-muted rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2">Preview</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 text-2xl rounded-full bg-card flex items-center justify-center">
                {avatar}
              </div>
              <span className="text-lg font-semibold">
                {name || "Your Name"}
              </span>
            </div>
          </div>

          <Button type="submit" variant="gold" size="lg" className="w-full">
            Let's Play
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
