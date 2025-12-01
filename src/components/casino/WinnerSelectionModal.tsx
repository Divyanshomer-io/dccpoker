import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Trophy, Users, ChevronRight, Check } from "lucide-react";
import type { LobbyPlayer, Pot } from "@/types/casino";

interface WinnerSelectionModalProps {
  open: boolean;
  onClose: () => void;
  players: LobbyPlayer[];
  pots: Pot[];
  chipUnitValue: number;
  onConfirm: (potWinners: Record<string, string[]>) => void;
}

export function WinnerSelectionModal({
  open,
  onClose,
  players,
  pots,
  chipUnitValue,
  onConfirm,
}: WinnerSelectionModalProps) {
  const [currentPotIndex, setCurrentPotIndex] = useState(0);
  const [potWinners, setPotWinners] = useState<Record<string, string[]>>({});
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCurrentPotIndex(0);
      setPotWinners({});
    }
  }, [open]);

  const totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0);
  const currentPot = pots[currentPotIndex];
  const selectedWinnersForCurrentPot = currentPot ? (potWinners[currentPot.id] || []) : [];
  
  // Get eligible players for current pot
  const eligiblePlayers = currentPot 
    ? players.filter(p => currentPot.contributors.includes(p.id))
    : players;

  const handleSelectWinner = (playerId: string) => {
    if (!currentPot) return;
    
    const currentSelected = potWinners[currentPot.id] || [];
    const newSelected = currentSelected.includes(playerId)
      ? currentSelected.filter(id => id !== playerId)
      : [...currentSelected, playerId];
    
    setPotWinners(prev => ({
      ...prev,
      [currentPot.id]: newSelected,
    }));
  };

  const handleNextPot = () => {
    if (selectedWinnersForCurrentPot.length === 0) return;
    
    if (currentPotIndex < pots.length - 1) {
      setCurrentPotIndex(prev => prev + 1);
    } else {
      // All pots assigned - confirm
      onConfirm(potWinners);
    }
  };

  const isLastPot = currentPotIndex === pots.length - 1;

  if (!currentPot || pots.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gold" />
            Select Winner(s)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total Pot Overview */}
          <div className="bg-gradient-to-r from-gold/20 to-emerald/20 rounded-lg p-3 text-center">
            <p className="text-sm text-muted-foreground">Total Pot</p>
            <p className="text-2xl font-bold text-gold">{totalPot.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              ₹{(totalPot * chipUnitValue).toFixed(2)}
            </p>
          </div>

          {/* Pot Navigation (if multiple pots) */}
          {pots.length > 1 && (
            <div className="flex items-center justify-center gap-2">
              {pots.map((pot, idx) => (
                <button
                  key={pot.id}
                  onClick={() => setCurrentPotIndex(idx)}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                    idx === currentPotIndex
                      ? "bg-gold text-gold-foreground"
                      : potWinners[pot.id]?.length > 0
                      ? "bg-emerald/20 text-emerald"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {potWinners[pot.id]?.length > 0 ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    idx + 1
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Current Pot Info */}
          <div className="bg-muted rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">
                {currentPotIndex === 0 ? 'Main Pot' : `Side Pot ${currentPotIndex}`}
              </span>
              <span className="text-lg font-bold text-gold">
                {currentPot.amount.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Eligible: {eligiblePlayers.map(p => p.user.name).join(', ')}
            </p>
          </div>

          {/* Instructions */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>Select winner(s). For split pot, select multiple players.</span>
          </div>

          {/* Player Selection */}
          <div className="grid grid-cols-2 gap-2">
            {eligiblePlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleSelectWinner(player.id)}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all text-left",
                  selectedWinnersForCurrentPot.includes(player.id)
                    ? "border-gold bg-gold/10"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{player.user.avatar || '🎰'}</span>
                  <div>
                    <p className="font-medium text-sm">{player.user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Seat {player.seatIndex + 1}
                    </p>
                  </div>
                </div>
                {selectedWinnersForCurrentPot.includes(player.id) && (
                  <Trophy className="w-4 h-4 text-gold mt-2" />
                )}
              </button>
            ))}
          </div>

          {/* Split Info */}
          {selectedWinnersForCurrentPot.length > 1 && (
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Split Pot</p>
              <p className="text-lg font-bold">
                {Math.floor(currentPot.amount / selectedWinnersForCurrentPot.length).toLocaleString()} each
              </p>
              {currentPot.amount % selectedWinnersForCurrentPot.length !== 0 && (
                <p className="text-xs text-muted-foreground">
                  (+{currentPot.amount % selectedWinnersForCurrentPot.length} remainder to first by seat)
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {pots.length === 1 ? (
            <Button 
              variant="gold" 
              onClick={() => onConfirm(potWinners)}
              disabled={selectedWinnersForCurrentPot.length === 0}
            >
              <Trophy className="w-4 h-4 mr-2" />
              Award Pot
            </Button>
          ) : (
            <Button 
              variant="gold" 
              onClick={handleNextPot}
              disabled={selectedWinnersForCurrentPot.length === 0}
            >
              {isLastPot ? (
                <>
                  <Trophy className="w-4 h-4 mr-2" />
                  Award All Pots
                </>
              ) : (
                <>
                  Next Pot
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
