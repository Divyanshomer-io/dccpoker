import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PokerTable, PlayerList } from "@/components/casino/PokerTable";
import { GameActions } from "@/components/casino/GameActions";
import { BuyingModal } from "@/components/casino/BuyingModal";
import { PlayerCard } from "@/components/casino/PlayerCard";
import { useGameStore } from "@/store/gameStore";
import { toast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Copy, 
  Play, 
  Settings, 
  Users,
  LogOut,
  Crown
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Lobby() {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const { 
    currentUser, 
    currentLobby, 
    players, 
    currentRound,
    setCurrentRound,
    updatePlayer,
    leaveLobby 
  } = useGameStore();

  const [showBuyingModal, setShowBuyingModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');

  // Redirect if no lobby
  useEffect(() => {
    if (!currentLobby || currentLobby.id !== lobbyId) {
      navigate('/');
    }
  }, [currentLobby, lobbyId, navigate]);

  if (!currentLobby || !currentUser) {
    return null;
  }

  const currentPlayer = players.find(p => p.userId === currentUser.id);
  const isHost = currentPlayer?.isHost;
  const isGameStarted = currentLobby.status === 'in_game';

  const copyLobbyInfo = () => {
    const info = `Join my poker game!\nLobby ID: ${currentLobby.id}\nPassword: ${currentLobby.password}`;
    navigator.clipboard.writeText(info);
    toast({ title: "Copied!", description: "Lobby info copied to clipboard" });
  };

  const handleStartGame = () => {
    if (players.length < 2) {
      toast({ title: "Error", description: "Need at least 2 players to start", variant: "destructive" });
      return;
    }

    // Check if all players have chips
    const playersWithoutChips = players.filter(p => p.chips === 0);
    if (playersWithoutChips.length > 0) {
      toast({ 
        title: "Warning", 
        description: `${playersWithoutChips.length} player(s) need to buy chips first`,
        variant: "destructive"
      });
      return;
    }

    // Start the game (in real app, this would be a server call)
    setCurrentRound({
      id: `round-${Date.now()}`,
      lobbyId: currentLobby.id,
      roundNumber: 1,
      dealerSeatIndex: 0,
      smallBlindSeatIndex: 1,
      bigBlindSeatIndex: players.length > 2 ? 2 : 0,
      currentTurnSeatIndex: players.length > 2 ? 3 : 1,
      stage: 'preflop',
      pots: [{ id: 'main', amount: 0, contributors: [] }],
      communityCards: [],
      currentBet: currentLobby.minBlind * 2,
      minRaise: currentLobby.minBlind * 2,
      playerBets: {},
      foldedPlayers: [],
      allInPlayers: [],
    });

    toast({ title: "Game Started!", description: "Good luck!" });
  };

  const handleBuy = (optionId: string, quantity: number) => {
    if (!currentPlayer) return;
    
    const option = currentLobby.buyingOptions.find(o => o.id === optionId);
    if (!option) return;

    const chipsToAdd = option.chipsPerBuying * quantity;
    
    // Update player's chips (in real app, this would happen after payment)
    updatePlayer(currentPlayer.id, {
      chips: currentPlayer.chips + chipsToAdd,
      buyingsBought: currentPlayer.buyingsBought + quantity,
    });

    toast({ 
      title: "Chips Added!", 
      description: `+${chipsToAdd.toLocaleString()} chips` 
    });
  };

  const handleAction = (action: string, amount?: number) => {
    console.log('Action:', action, amount);
    // In real app, this would send to server via WebSocket
    toast({ title: "Action", description: `${action} ${amount || ''}` });
  };

  const handleLeave = () => {
    leaveLobby();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-3 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleLeave}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-bold text-sm">{currentLobby.name}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{players.length}/{currentLobby.maxPlayers}</span>
                {isHost && <Crown className="w-3 h-3 text-gold" />}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={copyLobbyInfo}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Lobby Info Bar */}
        {!isGameStarted && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-4 text-muted-foreground">
              <span>ID: <code className="text-foreground">{currentLobby.id.slice(0, 8)}...</code></span>
              <span>Pass: <code className="text-gold font-bold">{currentLobby.password}</code></span>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* View Toggle (mobile) */}
        <div className="p-2 flex justify-center gap-2 border-b border-border">
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            Table View
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            List View
          </Button>
        </div>

        {/* Game Area */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'table' ? (
            <div className="p-2">
              <PokerTable
                players={players}
                currentUserId={currentUser.id}
                chipUnitValue={currentLobby.chipUnitValue}
                currentRound={currentRound}
                onBuyClick={() => setShowBuyingModal(true)}
              />
            </div>
          ) : (
            <PlayerList
              players={players}
              currentUserId={currentUser.id}
              chipUnitValue={currentLobby.chipUnitValue}
              currentRound={currentRound}
              onBuyClick={() => setShowBuyingModal(true)}
            />
          )}
        </div>

        {/* Action Area */}
        {isGameStarted && currentPlayer && currentRound ? (
          <GameActions
            canAct={currentRound.currentTurnSeatIndex === currentPlayer.seatIndex}
            currentBet={currentRound.currentBet}
            playerBet={currentRound.playerBets[currentPlayer.id] || 0}
            playerChips={currentPlayer.chips}
            minRaise={currentRound.minRaise}
            chipUnitValue={currentLobby.chipUnitValue}
            onAction={handleAction}
          />
        ) : (
          /* Lobby Controls */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm space-y-3">
            {/* Current Player Card */}
            {currentPlayer && (
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <PlayerCard
                    player={currentPlayer}
                    chipUnitValue={currentLobby.chipUnitValue}
                    isCurrentUser
                    onBuyClick={() => setShowBuyingModal(true)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {currentPlayer && currentPlayer.chips === 0 && (
                <Button
                  variant="gold"
                  size="touch"
                  className="flex-1"
                  onClick={() => setShowBuyingModal(true)}
                >
                  Buy Chips to Play
                </Button>
              )}
              
              {isHost && (
                <Button
                  variant="gold"
                  size="touch"
                  className="flex-1"
                  onClick={handleStartGame}
                  disabled={players.length < 2}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Game
                </Button>
              )}

              {!isHost && (
                <Button
                  variant="outline"
                  size="touch"
                  className="flex-1"
                  onClick={handleLeave}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave Lobby
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Buying Modal */}
      <BuyingModal
        open={showBuyingModal}
        onClose={() => setShowBuyingModal(false)}
        buyingOptions={currentLobby.buyingOptions}
        chipUnitValue={currentLobby.chipUnitValue}
        currencyCode={currentLobby.currencyCode}
        currentBuyings={currentPlayer?.buyingsBought || 0}
        maxBuyings={10}
        onBuy={handleBuy}
      />
    </div>
  );
}
