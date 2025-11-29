import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import type { Settlement } from "@/types/casino";

interface SettlementModalProps {
  open: boolean;
  onClose: () => void;
  settlement: Settlement;
}

export function SettlementModal({
  open,
  onClose,
  settlement,
}: SettlementModalProps) {
  const { entries, chipUnitValue, currencyCode } = settlement;
  
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode || 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="w-6 h-6 text-gold" />
            Game Settlement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Header */}
          <div className="bg-gradient-to-r from-gold/20 to-emerald/20 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Game Complete</p>
            <p className="text-lg font-bold">Final Results</p>
          </div>

          {/* Players Table */}
          <div className="space-y-2">
            {entries.map((entry, index) => {
              const isWinner = entry.netChange > 0;
              const isLoser = entry.netChange < 0;
              const isEven = entry.netChange === 0;

              return (
                <div
                  key={entry.playerId}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    index === 0 && isWinner && "bg-gold/10 border-gold",
                    index > 0 && isWinner && "bg-emerald/5 border-emerald/30",
                    isLoser && "bg-destructive/5 border-destructive/30",
                    isEven && "bg-muted border-border"
                  )}
                >
                  {/* Player Info */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 text-lg">
                      {index === 0 && isWinner ? '🏆' : entry.playerAvatar || '🎰'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{entry.playerName}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>{entry.startingChips.toLocaleString()} → {entry.finalChips.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Change */}
                  <div className="text-right">
                    <div className={cn(
                      "flex items-center gap-1 font-bold",
                      isWinner && "text-emerald",
                      isLoser && "text-destructive",
                      isEven && "text-muted-foreground"
                    )}>
                      {isWinner && <TrendingUp className="w-4 h-4" />}
                      {isLoser && <TrendingDown className="w-4 h-4" />}
                      {isEven && <Minus className="w-4 h-4" />}
                      <span>
                        {isWinner && '+'}
                        {formatMoney(entry.netChange)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isWinner && '+'}
                      {(entry.finalChips - entry.startingChips).toLocaleString()} chips
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chip Value Info */}
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">
              Chip Value: 1 chip = {formatMoney(chipUnitValue)}
            </p>
          </div>

          {/* Settlement Instructions */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Settlement Instructions:</p>
            <ul className="list-disc list-inside space-y-1">
              {entries.filter(e => e.netChange < 0).map(loser => {
                const winners = entries.filter(e => e.netChange > 0);
                return winners.map(winner => {
                  const proportion = winner.netChange / entries.filter(e => e.netChange > 0).reduce((sum, w) => sum + w.netChange, 0);
                  const owes = Math.abs(loser.netChange) * proportion;
                  if (owes > 0.01) {
                    return (
                      <li key={`${loser.playerId}-${winner.playerId}`}>
                        {loser.playerName} pays {winner.playerName}: {formatMoney(owes)}
                      </li>
                    );
                  }
                  return null;
                });
              })}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="gold" className="w-full" onClick={onClose}>
            Close Game
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
