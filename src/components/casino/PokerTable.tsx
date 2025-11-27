import { cn } from "@/lib/utils";
import { PlayerCard } from "./PlayerCard";
import { ChipStack } from "./Chip";
import type { LobbyPlayer, GameRound, Pot } from "@/types/casino";

interface PokerTableProps {
  players: LobbyPlayer[];
  currentUserId: string;
  chipUnitValue: number;
  currentRound?: GameRound | null;
  onBuyClick?: () => void;
}

export function PokerTable({
  players,
  currentUserId,
  chipUnitValue,
  currentRound,
  onBuyClick,
}: PokerTableProps) {
  // Sort players by seat index
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  
  // Calculate total pot
  const totalPot = currentRound?.pots.reduce((sum, pot) => sum + pot.amount, 0) || 0;

  // Position players around an ellipse for mobile
  const getPlayerPosition = (index: number, total: number) => {
    // For mobile, we use a more compact layout
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // Start from top
    const radiusX = 42; // % of container width
    const radiusY = 38; // % of container height
    
    return {
      left: `${50 + radiusX * Math.cos(angle)}%`,
      top: `${50 + radiusY * Math.sin(angle)}%`,
    };
  };

  return (
    <div className="relative w-full aspect-[4/3] max-w-lg mx-auto">
      {/* Felt Table Surface */}
      <div className="absolute inset-4 rounded-[50%] felt-surface shadow-2xl overflow-hidden">
        {/* Inner ring decoration */}
        <div className="absolute inset-4 rounded-[50%] border-2 border-emerald-light/20" />
        
        {/* Center pot area */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            {totalPot > 0 ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  <ChipStack chips={totalPot} chipUnitValue={chipUnitValue} showValue={false} />
                </div>
                <div className="bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1">
                  <div className="text-sm font-bold text-gold">{totalPot.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    ₹{(totalPot * chipUnitValue).toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground/50 text-sm">
                No Pot
              </div>
            )}
          </div>
        </div>

        {/* Stage indicator */}
        {currentRound && currentRound.stage !== 'waiting' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <span className="bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-gold uppercase">
              {currentRound.stage}
            </span>
          </div>
        )}
      </div>

      {/* Player positions */}
      {sortedPlayers.map((player, index) => {
        const position = getPlayerPosition(index, sortedPlayers.length);
        const isCurrentTurn = currentRound?.currentTurnSeatIndex === player.seatIndex;
        const isCurrentUser = player.userId === currentUserId;

        return (
          <div
            key={player.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-28"
            style={position}
          >
            <PlayerCard
              player={player}
              chipUnitValue={chipUnitValue}
              isCurrentTurn={isCurrentTurn}
              isCurrentUser={isCurrentUser}
              onBuyClick={isCurrentUser ? onBuyClick : undefined}
              compact
            />
          </div>
        );
      })}

      {/* Empty seats indicator */}
      {players.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-4xl mb-2">🎰</div>
            <div className="text-sm">Waiting for players...</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Mobile list view for smaller screens
export function PlayerList({
  players,
  currentUserId,
  chipUnitValue,
  currentRound,
  onBuyClick,
}: PokerTableProps) {
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);

  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {sortedPlayers.map((player) => {
        const isCurrentTurn = currentRound?.currentTurnSeatIndex === player.seatIndex;
        const isCurrentUser = player.userId === currentUserId;

        return (
          <PlayerCard
            key={player.id}
            player={player}
            chipUnitValue={chipUnitValue}
            isCurrentTurn={isCurrentTurn}
            isCurrentUser={isCurrentUser}
            onBuyClick={isCurrentUser ? onBuyClick : undefined}
            compact
          />
        );
      })}
    </div>
  );
}
