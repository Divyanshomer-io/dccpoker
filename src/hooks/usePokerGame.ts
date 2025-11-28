import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGameStore, generateId } from '@/store/gameStore';
import { toast } from '@/hooks/use-toast';
import type { GameRound, PokerAction, LobbyPlayer, GameStage } from '@/types/casino';

// Card deck utilities
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

function shuffleDeck(deck: string[]): string[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface UsePokerGameProps {
  lobbyId: string;
  players: LobbyPlayer[];
  minBlind: number;
}

export function usePokerGame({ lobbyId, players, minBlind }: UsePokerGameProps) {
  const { currentUser, setCurrentRound } = useGameStore();
  const [currentRound, setLocalRound] = useState<GameRound | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch current round from database
  const fetchCurrentRound = useCallback(async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      const round: GameRound = {
        id: data.id,
        lobbyId: data.lobby_id,
        roundNumber: data.round_number,
        dealerSeatIndex: data.dealer_seat_index,
        smallBlindSeatIndex: data.small_blind_seat_index,
        bigBlindSeatIndex: data.big_blind_seat_index,
        currentTurnSeatIndex: data.current_turn_seat_index,
        stage: data.stage as GameStage,
        pots: (data.pots as unknown) as GameRound['pots'],
        communityCards: (data.community_cards as unknown) as string[],
        currentBet: data.current_bet,
        minRaise: data.min_raise,
        playerBets: (data.player_bets as unknown) as Record<string, number>,
        foldedPlayers: (data.folded_players as unknown) as string[],
        allInPlayers: (data.all_in_players as unknown) as string[],
      };
      setLocalRound(round);
      setCurrentRound(round);
      return round;
    }
    return null;
  }, [lobbyId, setCurrentRound]);

  // Start a new game
  const startGame = async (dealerIndex: number = 0) => {
    if (!currentUser) return false;
    setLoading(true);

    try {
      // Get active players sorted by seat
      const activePlayers = players
        .filter(p => p.chips > 0 && p.active)
        .sort((a, b) => a.seatIndex - b.seatIndex);

      if (activePlayers.length < 2) {
        toast({ title: 'Error', description: 'Need at least 2 players with chips', variant: 'destructive' });
        return false;
      }

      // Calculate blind positions
      const numPlayers = activePlayers.length;
      const dealerSeat = activePlayers[dealerIndex % numPlayers].seatIndex;
      const sbIndex = (dealerIndex + 1) % numPlayers;
      const bbIndex = (dealerIndex + 2) % numPlayers;
      const sbSeat = activePlayers[sbIndex].seatIndex;
      const bbSeat = activePlayers[bbIndex].seatIndex;
      
      // First to act is after BB
      const firstToActIndex = (dealerIndex + 3) % numPlayers;
      const firstToActSeat = activePlayers[firstToActIndex].seatIndex;

      const smallBlind = minBlind;
      const bigBlind = minBlind * 2;

      // Deal cards
      const deck = shuffleDeck(createDeck());
      const playerHands: Record<string, string[]> = {};
      let cardIndex = 0;
      for (const player of activePlayers) {
        playerHands[player.id] = [deck[cardIndex], deck[cardIndex + 1]];
        cardIndex += 2;
      }

      // Set up community cards (not revealed yet)
      const flopCards = deck.slice(cardIndex, cardIndex + 3);
      const turnCard = deck[cardIndex + 3];
      const riverCard = deck[cardIndex + 4];

      // Create initial bets (blinds)
      const playerBets: Record<string, number> = {};
      const sbPlayer = activePlayers[sbIndex];
      const bbPlayer = activePlayers[bbIndex];
      
      playerBets[sbPlayer.id] = Math.min(smallBlind, sbPlayer.chips);
      playerBets[bbPlayer.id] = Math.min(bigBlind, bbPlayer.chips);

      const allInPlayers: string[] = [];
      if (sbPlayer.chips <= smallBlind) allInPlayers.push(sbPlayer.id);
      if (bbPlayer.chips <= bigBlind) allInPlayers.push(bbPlayer.id);

      // Calculate pot
      const potAmount = Object.values(playerBets).reduce((a, b) => a + b, 0);

      const roundId = generateId();
      const roundData = {
        id: roundId,
        lobby_id: lobbyId,
        round_number: 1,
        dealer_seat_index: dealerSeat,
        small_blind_seat_index: sbSeat,
        big_blind_seat_index: bbSeat,
        current_turn_seat_index: firstToActSeat,
        stage: 'preflop',
        pots: [{ id: 'main', amount: potAmount, contributors: activePlayers.map(p => p.id) }],
        community_cards: [],
        current_bet: bigBlind,
        min_raise: bigBlind,
        player_bets: playerBets,
        folded_players: [],
        all_in_players: allInPlayers,
        player_hands: playerHands,
      };

      // Insert round to database
      const { error } = await supabase.from('game_rounds').insert(roundData);
      if (error) throw error;

      // Update lobby status
      await supabase
        .from('lobbies')
        .update({ status: 'in_game', started_at: new Date().toISOString() })
        .eq('id', lobbyId);

      // Deduct blinds from player chips
      await supabase
        .from('lobby_players')
        .update({ chips: sbPlayer.chips - playerBets[sbPlayer.id] })
        .eq('id', sbPlayer.id);
      
      await supabase
        .from('lobby_players')
        .update({ chips: bbPlayer.chips - playerBets[bbPlayer.id] })
        .eq('id', bbPlayer.id);

      toast({ title: 'Game Started!', description: 'Good luck!' });
      await fetchCurrentRound();
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Get next player to act
  const getNextPlayerSeat = (round: GameRound, afterSeat: number): number | null => {
    const activePlayers = players
      .filter(p => 
        p.active && 
        !round.foldedPlayers.includes(p.id) && 
        !round.allInPlayers.includes(p.id)
      )
      .sort((a, b) => a.seatIndex - b.seatIndex);

    if (activePlayers.length === 0) return null;

    // Find next player after current seat
    const nextPlayer = activePlayers.find(p => p.seatIndex > afterSeat) || activePlayers[0];
    return nextPlayer.seatIndex;
  };

  // Check if betting round is complete
  const isBettingRoundComplete = (round: GameRound): boolean => {
    const activePlayers = players.filter(p => 
      p.active && 
      !round.foldedPlayers.includes(p.id) && 
      !round.allInPlayers.includes(p.id)
    );

    // All players have matched the current bet or folded/all-in
    for (const player of activePlayers) {
      const playerBet = round.playerBets[player.id] || 0;
      if (playerBet < round.currentBet) return false;
    }

    return true;
  };

  // Advance to next stage
  const advanceStage = async (round: GameRound): Promise<GameRound> => {
    const stages: GameStage[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentIndex = stages.indexOf(round.stage);
    const nextStage = stages[currentIndex + 1] || 'showdown';

    // Get community cards from database
    const { data: roundData } = await supabase
      .from('game_rounds')
      .select('player_hands')
      .eq('id', round.id)
      .single();

    let communityCards = [...round.communityCards];
    
    // Deal community cards based on stage
    if (nextStage === 'flop') {
      // For demo, generate cards - in real app, would use stored deck
      const deck = shuffleDeck(createDeck());
      communityCards = deck.slice(0, 3);
    } else if (nextStage === 'turn') {
      const deck = shuffleDeck(createDeck());
      communityCards.push(deck[0]);
    } else if (nextStage === 'river') {
      const deck = shuffleDeck(createDeck());
      communityCards.push(deck[0]);
    }

    // Reset bets for new round
    const resetBets: Record<string, number> = {};
    for (const playerId of Object.keys(round.playerBets)) {
      resetBets[playerId] = 0;
    }

    // Find first to act (first active player after dealer)
    const activePlayers = players
      .filter(p => 
        p.active && 
        !round.foldedPlayers.includes(p.id) && 
        !round.allInPlayers.includes(p.id)
      )
      .sort((a, b) => a.seatIndex - b.seatIndex);

    const dealerSeat = round.dealerSeatIndex;
    const firstToAct = activePlayers.find(p => p.seatIndex > dealerSeat) || activePlayers[0];

    return {
      ...round,
      stage: nextStage,
      communityCards,
      currentBet: 0,
      playerBets: resetBets,
      currentTurnSeatIndex: firstToAct?.seatIndex ?? round.currentTurnSeatIndex,
    };
  };

  // Handle player action
  const handleAction = async (action: PokerAction, amount?: number) => {
    if (!currentRound || !currentUser) return false;
    
    const currentPlayer = players.find(p => p.userId === currentUser.id);
    if (!currentPlayer) return false;

    // Verify it's player's turn
    if (currentRound.currentTurnSeatIndex !== currentPlayer.seatIndex) {
      toast({ title: 'Not your turn!', variant: 'destructive' });
      return false;
    }

    setLoading(true);
    try {
      let updatedRound = { ...currentRound };
      const playerId = currentPlayer.id;
      const currentPlayerBet = updatedRound.playerBets[playerId] || 0;
      let chipsToDeduct = 0;

      switch (action) {
        case 'fold':
          updatedRound.foldedPlayers = [...updatedRound.foldedPlayers, playerId];
          break;

        case 'check':
          if (currentPlayerBet < updatedRound.currentBet) {
            toast({ title: 'Cannot check', description: 'Must call or raise', variant: 'destructive' });
            return false;
          }
          break;

        case 'call':
          const callAmount = updatedRound.currentBet - currentPlayerBet;
          chipsToDeduct = Math.min(callAmount, currentPlayer.chips);
          updatedRound.playerBets[playerId] = currentPlayerBet + chipsToDeduct;
          
          if (currentPlayer.chips <= callAmount) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          }
          break;

        case 'bet':
        case 'raise':
          const betAmount = amount || updatedRound.minRaise;
          chipsToDeduct = betAmount - currentPlayerBet;
          updatedRound.playerBets[playerId] = betAmount;
          updatedRound.currentBet = betAmount;
          updatedRound.minRaise = betAmount * 2;
          
          if (currentPlayer.chips <= chipsToDeduct) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
            chipsToDeduct = currentPlayer.chips;
            updatedRound.playerBets[playerId] = currentPlayerBet + chipsToDeduct;
          }
          break;

        case 'allin':
          chipsToDeduct = currentPlayer.chips;
          updatedRound.playerBets[playerId] = currentPlayerBet + chipsToDeduct;
          if (currentPlayerBet + chipsToDeduct > updatedRound.currentBet) {
            updatedRound.currentBet = currentPlayerBet + chipsToDeduct;
          }
          updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          break;
      }

      // Update pot
      const totalBets = Object.values(updatedRound.playerBets).reduce((a, b) => a + b, 0);
      updatedRound.pots = [{ 
        id: 'main', 
        amount: totalBets, 
        contributors: players.filter(p => !updatedRound.foldedPlayers.includes(p.id)).map(p => p.id) 
      }];

      // Deduct chips if needed
      if (chipsToDeduct > 0) {
        await supabase
          .from('lobby_players')
          .update({ chips: currentPlayer.chips - chipsToDeduct })
          .eq('id', playerId);
      }

      // Check if only one player left
      const remainingPlayers = players.filter(p => 
        p.active && !updatedRound.foldedPlayers.includes(p.id)
      );

      if (remainingPlayers.length === 1) {
        // Winner by fold
        updatedRound.stage = 'settled';
        const winner = remainingPlayers[0];
        const potTotal = updatedRound.pots.reduce((sum, pot) => sum + pot.amount, 0);
        
        // Award pot to winner
        await supabase
          .from('lobby_players')
          .update({ chips: winner.chips + potTotal })
          .eq('id', winner.id);

        toast({ 
          title: `${winner.user.name} wins!`, 
          description: `Won ${potTotal} chips` 
        });
      } else {
        // Move to next player or next stage
        const nextSeat = getNextPlayerSeat(updatedRound, currentPlayer.seatIndex);
        
        if (nextSeat !== null) {
          updatedRound.currentTurnSeatIndex = nextSeat;
        }

        // Check if betting round complete
        if (isBettingRoundComplete(updatedRound) && action !== 'bet' && action !== 'raise') {
          if (updatedRound.stage === 'river') {
            updatedRound.stage = 'showdown';
          } else if (updatedRound.stage !== 'showdown') {
            updatedRound = await advanceStage(updatedRound);
          }
        }
      }

      // Save to database
      const { error } = await supabase
        .from('game_rounds')
        .update({
          current_turn_seat_index: updatedRound.currentTurnSeatIndex,
          stage: updatedRound.stage,
          pots: JSON.parse(JSON.stringify(updatedRound.pots)),
          community_cards: updatedRound.communityCards,
          current_bet: updatedRound.currentBet,
          min_raise: updatedRound.minRaise,
          player_bets: updatedRound.playerBets,
          folded_players: updatedRound.foldedPlayers,
          all_in_players: updatedRound.allInPlayers,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentRound.id);

      if (error) throw error;

      // Log action
      await supabase.from('game_actions').insert({
        id: generateId(),
        round_id: currentRound.id,
        player_id: playerId,
        action,
        amount: chipsToDeduct > 0 ? chipsToDeduct : null,
      });

      await fetchCurrentRound();
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Award pot to winner (for showdown)
  const awardPot = async (winnerId: string) => {
    if (!currentRound) return false;
    
    setLoading(true);
    try {
      const winner = players.find(p => p.id === winnerId);
      if (!winner) return false;

      const potTotal = currentRound.pots.reduce((sum, pot) => sum + pot.amount, 0);

      // Award chips
      await supabase
        .from('lobby_players')
        .update({ chips: winner.chips + potTotal })
        .eq('id', winnerId);

      // Mark round as settled
      await supabase
        .from('game_rounds')
        .update({ stage: 'settled' })
        .eq('id', currentRound.id);

      toast({ 
        title: `${winner.user.name} wins!`, 
        description: `Won ${potTotal} chips` 
      });

      await fetchCurrentRound();
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Start new round (after settlement)
  const startNewRound = async () => {
    if (!currentRound) return false;
    
    const newDealerIndex = (currentRound.dealerSeatIndex + 1) % players.length;
    return startGame(newDealerIndex);
  };

  // Subscribe to realtime updates
  useEffect(() => {
    if (!lobbyId) return;

    // Initial fetch
    fetchCurrentRound();

    const channel = supabase
      .channel(`game-${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rounds',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        () => {
          fetchCurrentRound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobbyId, fetchCurrentRound]);

  return {
    currentRound,
    loading,
    startGame,
    handleAction,
    awardPot,
    startNewRound,
    fetchCurrentRound,
  };
}
