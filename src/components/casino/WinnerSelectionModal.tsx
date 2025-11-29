import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Trophy, Users } from "lucide-react";
import type { LobbyPlayer, Pot } from "@/types/casino";

interface WinnerSelectionModalProps {
  open: boolean;
  onClose: () => void;
  players: LobbyPlayer[];
  pots: Pot[];
  chipUnitValue: number;
  selectedWinners: string[];
  onSelectWinner: (playerId: string) => void;
  onConfirm: () => void;
}

export function WinnerSelectionModal({
  open,
  onClose,
  players,
  pots,
  chipUnitValue,
  selectedWinners,
  onSelectWinner,
  onConfirm,
}: WinnerSelectionModalProps) {
  const totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gold" />
            Select Winner(s)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pot Info */}
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-sm text-muted-foreground">Total Pot</p>
            <p className="text-2xl font-bold text-gold">{totalPot.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              ₹{(totalPot * chipUnitValue).toFixed(2)}
            </p>
          </div>

          {/* Side Pots */}
          {pots.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Side Pots:</p>
              {pots.map((pot, i) => (
                <div key={pot.id} className="flex justify-between text-xs bg-muted/50 p-2 rounded">
                  <span>{i === 0 ? 'Main Pot' : `Side Pot ${i}`}</span>
                  <span className="font-medium">{pot.amount.toLocaleString()} chips</span>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>Select one or more winners. For split pot, select multiple players.</span>
          </div>

          {/* Player Selection */}
          <div className="grid grid-cols-2 gap-2">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => onSelectWinner(player.id)}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all text-left",
                  selectedWinners.includes(player.id)
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
                {selectedWinners.includes(player.id) && (
                  <Trophy className="w-4 h-4 text-gold mt-2" />
                )}
              </button>
            ))}
          </div>

          {/* Split Info */}
          {selectedWinners.length > 1 && (
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Split Pot</p>
              <p className="text-lg font-bold">
                {Math.floor(totalPot / selectedWinners.length).toLocaleString()} each
              </p>
              {totalPot % selectedWinners.length !== 0 && (
                <p className="text-xs text-muted-foreground">
                  (+{totalPot % selectedWinners.length} remainder to first winner by seat)
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="gold" 
            onClick={onConfirm}
            disabled={selectedWinners.length === 0}
          >
            <Trophy className="w-4 h-4 mr-2" />
            Award Pot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
