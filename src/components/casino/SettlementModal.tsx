import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Trophy, Download } from "lucide-react";
import type { Settlement, Transfer } from "@/types/casino";

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

  // Calculate minimal transfer pairs (greedy algorithm)
  const calculateTransfers = (): Transfer[] => {
    const transfers: Transfer[] = [];
    
    // Create copies of balances
    const balances = entries.map(e => ({
      playerId: e.playerId,
      playerName: e.playerName,
      balance: e.netChange,
    }));

    // Sort: debtors (negative) first, then creditors (positive)
    const debtors = balances.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);
    const creditors = balances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      
      const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      
      if (amount > 0.01) {
        transfers.push({
          from: debtor.playerId,
          fromName: debtor.playerName,
          to: creditor.playerId,
          toName: creditor.playerName,
          amount,
        });
      }
      
      debtor.balance += amount;
      creditor.balance -= amount;
      
      if (Math.abs(debtor.balance) < 0.01) i++;
      if (creditor.balance < 0.01) j++;
    }

    return transfers;
  };

  const transfers = calculateTransfers();

  // Download CSV
  const downloadCSV = () => {
    const headers = ['Player', 'Starting Chips', 'Final Chips', 'Chip Change', 'Starting Money', 'Final Money', 'Net P/L'];
    const rows = entries.map(e => [
      e.playerName,
      e.startingChips,
      e.finalChips,
      e.finalChips - e.startingChips,
      e.startingMoney.toFixed(2),
      e.finalMoney.toFixed(2),
      e.netChange.toFixed(2),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poker-settlement-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              const chipChange = entry.finalChips - entry.startingChips;

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
                        <span>{entry.startingChips.toLocaleString()} → {entry.finalChips.toLocaleString()} chips</span>
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
                    <p className={cn(
                      "text-xs",
                      isWinner && "text-emerald/70",
                      isLoser && "text-destructive/70",
                      isEven && "text-muted-foreground"
                    )}>
                      {chipChange > 0 && '+'}
                      {chipChange.toLocaleString()} chips
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
          {transfers.length > 0 && (
            <div className="bg-card border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2">
                💸 Settlement Transfers
              </p>
              <div className="space-y-2">
                {transfers.map((transfer, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
                  >
                    <span className="text-destructive">{transfer.fromName}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-emerald">{transfer.toName}</span>
                    <span className="font-bold">{formatMoney(transfer.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transfers.length === 0 && entries.every(e => e.netChange === 0) && (
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground">No transfers needed - everyone broke even!</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={downloadCSV} className="gap-2">
            <Download className="w-4 h-4" />
            Download CSV
          </Button>
          <Button variant="gold" className="flex-1" onClick={onClose}>
            Close Game
          </Button>
        </DialogFooter>

        {/* Attribution */}
        <p className="text-xs text-center text-muted-foreground mt-2">
          Created by Divyanshu Lila
        </p>
      </DialogContent>
    </Dialog>
  );
}