import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PokerTable, PlayerList } from "@/components/casino/PokerTable";
import { GameActions } from "@/components/casino/GameActions";
import { BuyingModal } from "@/components/casino/BuyingModal";
import { PlayerCard } from "@/components/casino/PlayerCard";
import { useGameStore } from "@/store/gameStore";
import { useLobby } from "@/hooks/useLobby";
import { usePokerGame } from "@/hooks/usePokerGame";
import { toast } from "@/hooks/use-toast";
import type { PokerAction } from "@/types/casino";
import { 
  ArrowLeft, 
  Copy, 
  Play, 
  Settings, 
  Users,
  LogOut,
  Crown,
  Loader2,
  Trophy
} from "lucide-react";

export default function Lobby() {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const { 
    currentUser, 
    currentLobby, 
    players, 
    leaveLobby: clearLocalLobby
  } = useGameStore();

  const { fetchLobby, updatePlayerChips, leaveLobby, loading } = useLobby(lobbyId);
  
  const { 
    currentRound: gameRound,
    loading: gameLoading,
    startGame,
    handleAction: gameHandleAction,
    awardPot,
    startNewRound,
  } = usePokerGame({ 
    lobbyId: lobbyId || '', 
    players, 
    minBlind: currentLobby?.minBlind || 1 
  });

  const [showBuyingModal, setShowBuyingModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch lobby on mount
  useEffect(() => {
    if (lobbyId) {
      fetchLobby(lobbyId).then(() => {
        setInitialLoading(false);
      });
    }
  }, [lobbyId, fetchLobby]);

  // Redirect if lobby not found after loading
  useEffect(() => {
    if (!initialLoading && !currentLobby) {
      toast({ title: "Error", description: "Lobby not found", variant: "destructive" });
      navigate('/');
    }
  }, [initialLoading, currentLobby, navigate]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gold" />
          <p className="text-muted-foreground">Loading lobby...</p>
        </div>
      </div>
    );
  }

  if (!currentLobby || !currentUser) {
    return null;
  }

  const currentPlayer = players.find(p => p.userId === currentUser.id);
  const isHost = currentPlayer?.isHost;
  const isGameStarted = currentLobby.status === 'in_game' || gameRound !== null;
  const activeRound = gameRound && gameRound.stage !== 'settled' ? gameRound : null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const copyLobbyInfo = () => {
    const info = `Join my poker game!\nLobby ID: ${currentLobby.id}\nPassword: ${currentLobby.password}`;
    navigator.clipboard.writeText(info);
    toast({ title: "Copied!", description: "Lobby info copied to clipboard" });
  };

  const handleStartGame = async () => {
    if (players.length < 2) {
      toast({ title: "Error", description: "Need at least 2 players to start", variant: "destructive" });
      return;
    }

    const playersWithoutChips = players.filter(p => p.chips === 0);
    if (playersWithoutChips.length > 0) {
      toast({ 
        title: "Warning", 
        description: `${playersWithoutChips.length} player(s) need to buy chips first`,
        variant: "destructive"
      });
      return;
    }

    await startGame(0);
  };

  const handleBuy = async (optionId: string, quantity: number) => {
    if (!currentPlayer) return;
    
    const option = currentLobby.buyingOptions.find(o => o.id === optionId);
    if (!option) return;

    const chipsToAdd = option.chipsPerBuying * quantity;
    const newChips = currentPlayer.chips + chipsToAdd;
    const newBuyings = currentPlayer.buyingsBought + quantity;
    
    const success = await updatePlayerChips(currentPlayer.id, newChips, newBuyings);
    if (success) {
      toast({ 
        title: "Chips Added!", 
        description: `+${chipsToAdd.toLocaleString()} chips` 
      });
    }
  };

  const handleAction = async (action: PokerAction, amount?: number) => {
    await gameHandleAction(action, amount);
  };

  const handleLeave = async () => {
    if (currentPlayer) {
      await leaveLobby(currentPlayer.id);
    }
    clearLocalLobby();
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
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>ID:</span>
              <code className="text-foreground bg-muted px-2 py-1 rounded select-all break-all">{currentLobby.id}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(currentLobby.id, "Lobby ID")}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Password:</span>
              <code className="text-gold font-bold bg-muted px-2 py-1 rounded select-all">{currentLobby.password}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(currentLobby.password, "Password")}
              >
                <Copy className="w-3 h-3" />
              </Button>
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
                currentRound={gameRound}
                onBuyClick={() => setShowBuyingModal(true)}
              />
            </div>
          ) : (
            <PlayerList
              players={players}
              currentUserId={currentUser.id}
              chipUnitValue={currentLobby.chipUnitValue}
              currentRound={gameRound}
              onBuyClick={() => setShowBuyingModal(true)}
            />
          )}
        </div>

        {/* Action Area */}
        {activeRound && currentPlayer ? (
          <GameActions
            canAct={activeRound.currentTurnSeatIndex === currentPlayer.seatIndex}
            currentBet={activeRound.currentBet}
            playerBet={activeRound.playerBets[currentPlayer.id] || 0}
            playerChips={currentPlayer.chips}
            minRaise={activeRound.minRaise}
            chipUnitValue={currentLobby.chipUnitValue}
            onAction={handleAction}
          />
        ) : gameRound?.stage === 'showdown' && isHost ? (
          /* Showdown - Host selects winner */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm space-y-3">
            <h3 className="text-sm font-medium text-center">Showdown - Select Winner</h3>
            <div className="grid grid-cols-2 gap-2">
              {players
                .filter(p => !gameRound.foldedPlayers.includes(p.id))
                .map(player => (
                  <Button
                    key={player.id}
                    variant="outline"
                    size="sm"
                    onClick={() => awardPot(player.id)}
                    className="flex items-center gap-2"
                  >
                    <span>{player.user.avatar}</span>
                    <span>{player.user.name}</span>
                    <Trophy className="w-4 h-4 text-gold" />
                  </Button>
                ))}
            </div>
          </div>
        ) : gameRound?.stage === 'settled' ? (
          /* Round settled - Start new round */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm space-y-3">
            {isHost && (
              <Button
                variant="gold"
                size="touch"
                className="w-full"
                onClick={startNewRound}
                disabled={gameLoading}
              >
                <Play className="w-4 h-4 mr-2" />
                Next Round
              </Button>
            )}
          </div>
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
              
              {isHost && !isGameStarted && (
                <Button
                  variant="gold"
                  size="touch"
                  className="flex-1"
                  onClick={handleStartGame}
                  disabled={players.length < 2 || gameLoading}
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
