import { cn } from "@/lib/utils";
import { ChipStack } from "./Chip";
import { Button } from "@/components/ui/button";
import { Crown, Wifi, WifiOff, ShoppingCart } from "lucide-react";
import type { LobbyPlayer } from "@/types/casino";

interface PlayerCardProps {
  player: LobbyPlayer;
  chipUnitValue: number;
  isCurrentTurn?: boolean;
  isCurrentUser?: boolean;
  onBuyClick?: () => void;
  compact?: boolean;
}

export function PlayerCard({
  player,
  chipUnitValue,
  isCurrentTurn = false,
  isCurrentUser = false,
  onBuyClick,
  compact = false,
}: PlayerCardProps) {
  const needsChips = player.chips === 0 && player.buyingsBought < 10;

  return (
    <div
      className={cn(
        "player-seat border rounded-xl transition-all duration-300",
        isCurrentTurn && "current-turn border-primary",
        !isCurrentTurn && "border-border",
        isCurrentUser && "ring-2 ring-primary/30",
        needsChips && "opacity-60",
        compact ? "p-2" : "p-3"
      )}
    >
      {/* Header: Avatar, Name, Status */}
      <div className="flex items-center gap-2 mb-2">
        {/* Avatar */}
        <div className={cn(
          "flex items-center justify-center rounded-full bg-muted",
          compact ? "w-8 h-8 text-lg" : "w-10 h-10 text-xl"
        )}>
          {player.user.avatar || '🎰'}
        </div>

        {/* Name and indicators */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {player.isHost && (
              <Crown className="w-3 h-3 text-gold flex-shrink-0" />
            )}
            <span className={cn(
              "font-semibold truncate",
              compact ? "text-xs" : "text-sm"
            )}>
              {player.user.name}
            </span>
            {isCurrentUser && (
              <span className="text-xs text-muted-foreground">(You)</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {player.isConnected ? (
              <Wifi className="w-3 h-3 text-emerald" />
            ) : (
              <WifiOff className="w-3 h-3 text-destructive" />
            )}
            <span>Seat {player.seatIndex + 1}</span>
          </div>
        </div>
      </div>

      {/* Chip Stack */}
      <div className="flex items-center justify-between">
        <ChipStack 
          chips={player.chips} 
          chipUnitValue={chipUnitValue}
          className={compact ? "scale-90" : ""}
        />

        {/* Buy Button (only for current user when they need chips) */}
        {isCurrentUser && needsChips && onBuyClick && (
          <Button
            variant="gold"
            size="sm"
            onClick={onBuyClick}
            className="animate-pulse-glow"
          >
            <ShoppingCart className="w-4 h-4" />
            Buy
          </Button>
        )}
      </div>

      {/* Turn Indicator */}
      {isCurrentTurn && (
        <div className="mt-2 text-center">
          <span className="text-xs font-semibold text-gold animate-pulse">
            Your Turn
          </span>
        </div>
      )}

      {/* Out of chips indicator */}
      {needsChips && !isCurrentUser && (
        <div className="mt-2 text-center">
          <span className="text-xs text-muted-foreground">
            Needs to buy in
          </span>
        </div>
      )}
    </div>
  );
}
