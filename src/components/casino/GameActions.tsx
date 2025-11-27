import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { PokerAction } from "@/types/casino";

interface GameActionsProps {
  canAct: boolean;
  currentBet: number;
  playerBet: number;
  playerChips: number;
  minRaise: number;
  chipUnitValue: number;
  onAction: (action: PokerAction, amount?: number) => void;
}

export function GameActions({
  canAct,
  currentBet,
  playerBet,
  playerChips,
  minRaise,
  chipUnitValue,
  onAction,
}: GameActionsProps) {
  const [betAmount, setBetAmount] = useState(currentBet + minRaise);
  const [showBetSlider, setShowBetSlider] = useState(false);

  const callAmount = currentBet - playerBet;
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && callAmount <= playerChips;
  const canRaise = playerChips > callAmount;
  const canBet = currentBet === 0 && playerChips > 0;

  const handleAction = (action: PokerAction, amount?: number) => {
    setShowBetSlider(false);
    onAction(action, amount);
  };

  const maxBet = playerChips;
  const minBet = Math.max(currentBet + minRaise, minRaise);

  return (
    <div className={cn(
      "bg-card/95 backdrop-blur-sm border-t border-border p-4 space-y-3",
      !canAct && "opacity-50 pointer-events-none"
    )}>
      {/* Bet/Raise Slider */}
      {showBetSlider && (
        <div className="space-y-3 p-3 bg-muted rounded-lg animate-scale-in">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bet Amount</span>
            <span className="font-bold text-gold">
              {betAmount.toLocaleString()} chips
              <span className="text-muted-foreground ml-1">
                (₹{(betAmount * chipUnitValue).toFixed(2)})
              </span>
            </span>
          </div>
          <Slider
            value={[betAmount]}
            onValueChange={([value]) => setBetAmount(value)}
            min={minBet}
            max={maxBet}
            step={minRaise}
            className="py-2"
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBetAmount(minBet)}
              className="flex-1"
            >
              Min
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBetAmount(Math.floor(maxBet / 2))}
              className="flex-1"
            >
              1/2
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBetAmount(Math.floor(maxBet * 0.75))}
              className="flex-1"
            >
              3/4
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBetAmount(maxBet)}
              className="flex-1"
            >
              Max
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="touch"
              onClick={() => setShowBetSlider(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="raise"
              size="touch"
              onClick={() => handleAction(currentBet === 0 ? 'bet' : 'raise', betAmount)}
              className="flex-1"
            >
              {currentBet === 0 ? 'Bet' : 'Raise'} {betAmount.toLocaleString()}
            </Button>
          </div>
        </div>
      )}

      {/* Main Action Buttons */}
      {!showBetSlider && (
        <div className="flex gap-2">
          {/* Fold */}
          <Button
            variant="fold"
            size="touch"
            onClick={() => handleAction('fold')}
            className="flex-1"
          >
            Fold
          </Button>

          {/* Check/Call */}
          {canCheck ? (
            <Button
              variant="call"
              size="touch"
              onClick={() => handleAction('check')}
              className="flex-1"
            >
              Check
            </Button>
          ) : canCall ? (
            <Button
              variant="call"
              size="touch"
              onClick={() => handleAction('call')}
              className="flex-1"
            >
              <span className="flex flex-col items-center">
                <span>Call</span>
                <span className="text-xs opacity-80">{callAmount.toLocaleString()}</span>
              </span>
            </Button>
          ) : null}

          {/* Bet/Raise */}
          {(canBet || canRaise) && (
            <Button
              variant="raise"
              size="touch"
              onClick={() => setShowBetSlider(true)}
              className="flex-1"
            >
              {canBet ? 'Bet' : 'Raise'}
            </Button>
          )}

          {/* All-In */}
          <Button
            variant="gold"
            size="touch"
            onClick={() => handleAction('allin', playerChips)}
            className="flex-1"
          >
            <span className="flex flex-col items-center">
              <span>All-In</span>
              <span className="text-xs opacity-80">{playerChips.toLocaleString()}</span>
            </span>
          </Button>
        </div>
      )}

      {/* Info bar */}
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>Your chips: {playerChips.toLocaleString()}</span>
        <span>Current bet: {currentBet.toLocaleString()}</span>
      </div>
    </div>
  );
}
