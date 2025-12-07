import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PokerTable, PlayerList } from "@/components/casino/PokerTable";
import { GameActions } from "@/components/casino/GameActions";
import { BuyingModal } from "@/components/casino/BuyingModal";
import { PlayerCard } from "@/components/casino/PlayerCard";
import { WinnerSelectionModal } from "@/components/casino/WinnerSelectionModal";
import { SettlementModal } from "@/components/casino/SettlementModal";
import { EndGameModal } from "@/components/casino/EndGameModal";
import { useGameStore } from "@/store/gameStore";
import { useLobby } from "@/hooks/useLobby";
import { usePokerGame } from "@/hooks/usePokerGame";
import { toast } from "@/hooks/use-toast";
import type { PokerAction, Settlement, SettlementEntry } from "@/types/casino";
import { isAwaitingStage } from "@/lib/pokerEngine";
import { 
  ArrowLeft, 
  Copy, 
  Play, 
  Users,
  LogOut,
  Crown,
  Loader2,
  XCircle,
  Clock,
  Eye,
  Ban
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
    endGame,
    revealCommunityCards,
  } = usePokerGame({ 
    lobbyId: lobbyId || '', 
    players, 
    minBlind: currentLobby?.minBlind || 1,
    chipUnitValue: currentLobby?.chipUnitValue || 1,
    currencyCode: currentLobby?.currencyCode || 'INR',
    buyingOptions: currentLobby?.buyingOptions || [],
  });

  const [showBuyingModal, setShowBuyingModal] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [settlementData, setSettlementData] = useState<Settlement | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const [initialLoading, setInitialLoading] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState(3);

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

  // Countdown for auto next round
  useEffect(() => {
    if (gameRound?.stage === 'settled') {
      setCountdownSeconds(3);
      const interval = setInterval(() => {
        setCountdownSeconds(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameRound?.stage]);

  // Show settlement modal when game ends (from DB status)
  useEffect(() => {
    if (currentLobby?.status === 'game_finished' && !settlementData) {
      // Calculate settlement from current state if we don't have it
      const entries: SettlementEntry[] = players.map(player => {
        const startingChips = player.buyingsBought * (currentLobby.buyingOptions[0]?.chipsPerBuying || 0);
        const finalChips = player.chips;
        const startingMoney = startingChips * currentLobby.chipUnitValue;
        const finalMoney = finalChips * currentLobby.chipUnitValue;
        const netChange = finalMoney - startingMoney;
        
        return {
          playerId: player.id,
          playerName: player.user.name,
          playerAvatar: player.user.avatar,
          startingChips,
          finalChips,
          startingMoney,
          finalMoney,
          netChange,
          netChangePercent: startingMoney > 0 ? (netChange / startingMoney) * 100 : 0,
        };
      }).sort((a, b) => b.netChange - a.netChange);

      setSettlementData({
        entries,
        transfers: [],
        chipUnitValue: currentLobby.chipUnitValue,
        currencyCode: currentLobby.currencyCode,
      });
      setShowSettlementModal(true);
    }
  }, [currentLobby?.status, players, currentLobby, settlementData]);

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
  const isGameStarted = currentLobby.status === 'in_game' || (gameRound !== null && gameRound.stage !== 'waiting');
  
  // Determine if we're in an active betting stage (not awaiting, not showdown, not settled)
  // Active betting stages where players can act
  const isBettingStage = gameRound && 
    ['preflop', 'flop', 'turn', 'river'].includes(gameRound.stage);

  const isAwaitingReveal = gameRound && isAwaitingStage(gameRound.stage);

  const currentPlayerState =
    currentPlayer && gameRound?.playerStates
      ? gameRound.playerStates[currentPlayer.id]
      : undefined;

  const hasFolded = currentPlayerState?.hasFolded || false;
  const isAllIn = currentPlayerState?.isAllIn || false;

  const canCurrentPlayerAct =
    isBettingStage &&
    !!currentPlayer &&
    gameRound?.currentTurnSeatIndex === currentPlayer.seatIndex &&
    currentPlayer.chips > 0 &&
    !hasFolded &&
    !isAllIn;

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

  const handleEndGame = async () => {
    setShowEndGameModal(false);
    const settlement = await endGame();
    if (settlement) {
      setSettlementData(settlement);
      setShowSettlementModal(true);
    }
  };

  const handleRevealCards = async () => {
    await revealCommunityCards();
  };

  // Handle winner selection with per-pot support
  const handleSelectWinners = async (potWinners: Record<string, string[]>) => {
    const allWinners = new Set<string>();
    Object.values(potWinners).forEach(winners => {
      winners.forEach(w => allWinners.add(w));
    });

    if (allWinners.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one winner', variant: 'destructive' });
      return;
    }

    await awardPot(Array.from(allWinners));
    setShowWinnerModal(false);
  };

  // Get non-folded players for winner selection
  const getNonFoldedPlayersForSelection = () => {
    if (!gameRound) return [];
    return players.filter(p => {
      const state = gameRound.playerStates[p.id];
      return state && !state.hasFolded && p.active;
    });
  };

  // Get player's committed chips for display
  const getPlayerCommitted = (playerId: string) => {
    if (!gameRound?.playerStates) return 0;
    return gameRound.playerStates[playerId]?.committed || 0;
  };

  // Get stage display name
  const getStageDisplayName = () => {
    if (!gameRound) return '';
    const stageNames: Record<string, string> = {
      'preflop': 'Pre-Flop',
      'awaiting_flop': 'Reveal Flop',
      'flop': 'Flop',
      'awaiting_turn': 'Reveal Turn',
      'turn': 'Turn',
      'awaiting_river': 'Reveal River',
      'river': 'River',
      'showdown': 'Showdown',
      'settled': 'Hand Complete',
    };
    return stageNames[gameRound.stage] || gameRound.stage;
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
                {gameRound && <span className="text-gold">• {getStageDisplayName()}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isHost && isGameStarted && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowEndGameModal(true)}
                className="text-xs"
              >
                <XCircle className="w-4 h-4 mr-1" />
                End Game
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={copyLobbyInfo}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Lobby Info Bar - Only show when not in game */}
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
        {/* Show folded indicator for folded players */}
        {hasFolded && gameRound && gameRound.stage !== 'settled' && gameRound.stage !== 'game_finished' && (
          <div className="p-4 border-t border-border bg-destructive/10 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <Ban className="w-5 h-5" />
              <span className="font-medium">You folded this hand</span>
            </div>
          </div>
        )}

        {/* Show all-in indicator */}
        {isAllIn && !hasFolded && gameRound && gameRound.stage !== 'settled' && gameRound.stage !== 'showdown' && gameRound.stage !== 'game_finished' && (
          <div className="p-4 border-t border-border bg-gold/10 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 text-gold">
              <span className="text-lg">🔥</span>
              <span className="font-medium">You are All-In!</span>
            </div>
          </div>
        )}

        {/* Betting Actions */}
        {isBettingStage && currentPlayer && !hasFolded && !isAllIn ? (
          <GameActions
            canAct={canCurrentPlayerAct}
            currentBet={gameRound?.currentBet || 0}
            playerBet={getPlayerCommitted(currentPlayer.id)}
            playerChips={currentPlayer.chips}
            minRaise={gameRound?.lastRaiseAmount || gameRound?.minRaise || currentLobby.minBlind * 2}
            chipUnitValue={currentLobby.chipUnitValue}
            onAction={handleAction}
          />
        ) : isAwaitingReveal ? (
          /* Awaiting card reveal - Host reveals cards */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm space-y-3">
            <h3 className="text-sm font-medium text-center text-gold">
              🃏 {getStageDisplayName()}
            </h3>
            {isHost ? (
              <>
                <p className="text-xs text-center text-muted-foreground">
                  Click to reveal community cards and start next betting round
                </p>
                <Button
                  variant="gold"
                  size="touch"
                  className="w-full"
                  onClick={handleRevealCards}
                  disabled={gameLoading}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {gameRound?.stage === 'awaiting_flop' && 'Reveal 3 Cards (Flop)'}
                  {gameRound?.stage === 'awaiting_turn' && 'Reveal Turn Card'}
                  {gameRound?.stage === 'awaiting_river' && 'Reveal River Card'}
                </Button>
              </>
            ) : (
              <p className="text-xs text-center text-muted-foreground">
                Waiting for host to reveal cards...
              </p>
            )}
          </div>
        ) : gameRound?.stage === 'showdown' ? (
          /* Showdown - Host selects winner */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm space-y-3">
            <h3 className="text-sm font-medium text-center text-gold">🎯 Showdown!</h3>
            {isHost ? (
              <>
                <p className="text-xs text-center text-muted-foreground">
                  Select the winner(s) of this hand
                </p>
                <Button
                  variant="gold"
                  size="touch"
                  className="w-full"
                  onClick={() => setShowWinnerModal(true)}
                >
                  Select Winner
                </Button>
              </>
            ) : (
              <p className="text-xs text-center text-muted-foreground">
                Waiting for host to select winner...
              </p>
            )}
          </div>
        ) : gameRound?.stage === 'settled' ? (
          /* Round settled - Auto next round countdown */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Next hand in {countdownSeconds}...</span>
            </div>
          </div>
        ) : !isGameStarted ? (
          /* Lobby Controls */
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm space-y-3">
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

              {!isHost && !isGameStarted && (
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
        ) : null}
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

      {/* Winner Selection Modal */}
      <WinnerSelectionModal
        open={showWinnerModal}
        onClose={() => setShowWinnerModal(false)}
        players={getNonFoldedPlayersForSelection()}
        pots={gameRound?.pots || []}
        chipUnitValue={currentLobby.chipUnitValue}
        onConfirm={handleSelectWinners}
      />

      {/* End Game Confirmation Modal */}
      <EndGameModal
        open={showEndGameModal}
        onClose={() => setShowEndGameModal(false)}
        onConfirm={handleEndGame}
        loading={gameLoading}
      />

      {/* Settlement Modal */}
      {settlementData && (
        <SettlementModal
          open={showSettlementModal}
          onClose={() => {
            setShowSettlementModal(false);
            navigate('/');
          }}
          settlement={settlementData}
        />
      )}
    </div>
  );
}