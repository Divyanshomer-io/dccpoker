import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGameStore, generateId } from '@/store/gameStore';
import { toast } from '@/hooks/use-toast';
import type { GameRound, PokerAction, LobbyPlayer, GameStage, PlayerHandState, Pot, Settlement, SettlementEntry } from '@/types/casino';
import {
  createDeck,
  shuffleDeck,
  calculateBlindPositions,
  getFirstToActSeat,
  findNextEligibleSeat,
  getNextDealerSeat,
  validateAction,
  calculatePots,
  distributePot,
  isBettingRoundComplete,
  isHandOver,
  getWinnerByFold,
  allPlayersAllIn,
  getNextStage,
  initializePlayerStates,
  postBlinds,
  resetForNewBettingRound,
  getEligiblePlayers,
  getNonFoldedPlayers,
  isAwaitingStage,
} from '@/lib/pokerEngine';

interface UsePokerGameProps {
  lobbyId: string;
  players: LobbyPlayer[];
  minBlind: number;
  chipUnitValue?: number;
  currencyCode?: string;
  buyingOptions?: { chipsPerBuying: number }[];
}

const AUTO_NEXT_ROUND_DELAY = 3000;

export function usePokerGame({ lobbyId, players, minBlind, chipUnitValue = 1, currencyCode = 'INR', buyingOptions = [] }: UsePokerGameProps) {
  const { currentUser, setCurrentRound } = useGameStore();
  const [currentRound, setLocalRound] = useState<GameRound | null>(null);
  const [loading, setLoading] = useState(false);
  const autoNextRoundTimer = useRef<NodeJS.Timeout | null>(null);
  const deckRef = useRef<string[]>([]);

  const parseRoundFromDB = useCallback((data: any): GameRound => {
    const rawPlayerStates = data.player_states as Record<string, any> | null;
    const foldedPlayers = (data.folded_players as string[]) || [];
    const allInPlayers = (data.all_in_players as string[]) || [];
    const playerBets = (data.player_bets as Record<string, number>) || {};

    let playerStates: Record<string, PlayerHandState> = {};
    
    if (rawPlayerStates && Object.keys(rawPlayerStates).length > 0) {
      playerStates = { ...rawPlayerStates } as Record<string, PlayerHandState>;

      // CRITICAL: Always sync hasFolded / isAllIn flags from arrays
      for (const [playerId, state] of Object.entries(playerStates)) {
        playerStates[playerId] = {
          ...state,
          hasFolded: foldedPlayers.includes(playerId),
          isAllIn: allInPlayers.includes(playerId),
        };
      }
    } else {
      for (const playerId of Object.keys(playerBets)) {
        playerStates[playerId] = {
          playerId,
          committed: playerBets[playerId] || 0,
          hasFolded: foldedPlayers.includes(playerId),
          isAllIn: allInPlayers.includes(playerId),
          hasActedThisRound: true,
        };
      }
    }
    
    return {
      id: data.id,
      lobbyId: data.lobby_id,
      roundNumber: data.round_number,
      dealerSeatIndex: data.dealer_seat_index,
      smallBlindSeatIndex: data.small_blind_seat_index,
      bigBlindSeatIndex: data.big_blind_seat_index,
      currentTurnSeatIndex: data.current_turn_seat_index,
      stage: data.stage as GameStage,
      pots: (data.pots as Pot[]) || [],
      communityCards: (data.community_cards as string[]) || [],
      currentBet: data.current_bet || 0,
      minRaise: data.min_raise || minBlind * 2,
      lastRaiseAmount: data.last_raise_amount || data.min_raise || minBlind * 2,
      playerBets: (data.player_bets as Record<string, number>) || {},
      playerStates,
      foldedPlayers: (data.folded_players as string[]) || [],
      allInPlayers: (data.all_in_players as string[]) || [],
      playerHands: data.player_hands as Record<string, string[]> | undefined,
      bettingRoundStartSeat: data.betting_round_start_seat,
      lastAggressorSeat: data.last_aggressor_seat,
    };
  }, [minBlind]);

  const fetchCurrentRound = useCallback(async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && !error) {
      const round = parseRoundFromDB(data);
      setLocalRound(round);
      setCurrentRound(round);
      return round;
    }
    return null;
  }, [lobbyId, setCurrentRound, parseRoundFromDB]);

  // Fetch fresh players from DB
  const fetchFreshPlayers = useCallback(async (): Promise<LobbyPlayer[]> => {
    const { data } = await supabase
      .from('lobby_players')
      .select('*')
      .eq('lobby_id', lobbyId)
      .eq('active', true);

    if (!data) return [];

    return data.map((p: any) => ({
      id: p.id,
      lobbyId: p.lobby_id,
      userId: p.user_id,
      user: {
        id: p.user_id,
        name: p.user_name,
        avatar: p.user_avatar,
        createdAt: new Date(p.joined_at),
      },
      seatIndex: p.seat_index,
      chips: p.chips,
      buyingsBought: p.buyings_bought,
      isHost: p.is_host,
      joinedAt: new Date(p.joined_at),
      active: p.active,
      isConnected: p.is_connected,
      startingChips: p.buyings_bought * (buyingOptions[0]?.chipsPerBuying || 0),
    }));
  }, [lobbyId, buyingOptions]);

  const createNewDeck = useCallback(() => {
    deckRef.current = shuffleDeck(createDeck());
    return deckRef.current;
  }, []);

  const startGame = async (dealerIndex: number = 0) => {
    if (!currentUser) return false;
    setLoading(true);

    try {
      const activePlayers = players
        .filter(p => p.chips > 0 && p.active)
        .sort((a, b) => a.seatIndex - b.seatIndex);

      if (activePlayers.length < 2) {
        toast({ title: 'Error', description: 'Need at least 2 players with chips', variant: 'destructive' });
        return false;
      }

      const smallBlind = minBlind;
      const bigBlind = minBlind * 2;

      const firstDealerSeat = activePlayers[dealerIndex % activePlayers.length].seatIndex;
      const { dealerSeat, sbSeat, bbSeat } = calculateBlindPositions(activePlayers, firstDealerSeat);

      const playerStates = initializePlayerStates(activePlayers);

      const roundId = generateId();
      const initialRound: GameRound = {
        id: roundId,
        lobbyId,
        roundNumber: (currentRound?.roundNumber || 0) + 1,
        dealerSeatIndex: dealerSeat,
        smallBlindSeatIndex: sbSeat,
        bigBlindSeatIndex: bbSeat,
        currentTurnSeatIndex: 0,
        stage: 'preflop',
        pots: [],
        communityCards: [],
        currentBet: bigBlind,
        minRaise: bigBlind,
        lastRaiseAmount: bigBlind,
        playerBets: {},
        playerStates,
        foldedPlayers: [],
        allInPlayers: [],
      };

      const { playerStates: statesAfterBlinds, chipDeductions } = postBlinds(
        activePlayers,
        initialRound,
        smallBlind,
        bigBlind
      );

      const allInPlayers = Object.entries(statesAfterBlinds)
        .filter(([_, s]) => s.isAllIn)
        .map(([id]) => id);
      
      const pots = calculatePots(statesAfterBlinds);

      const deck = createNewDeck();
      const playerHands: Record<string, string[]> = {};
      let cardIndex = 0;
      for (const player of activePlayers) {
        playerHands[player.id] = [deck[cardIndex], deck[cardIndex + 1]];
        cardIndex += 2;
      }

      const roundWithBlinds: GameRound = {
        ...initialRound,
        playerStates: statesAfterBlinds,
        allInPlayers,
        pots,
      };
      
      const firstToActSeat = getFirstToActSeat(activePlayers, roundWithBlinds, 'preflop');

      const roundData = {
        id: roundId,
        lobby_id: lobbyId,
        round_number: (currentRound?.roundNumber || 0) + 1,
        dealer_seat_index: dealerSeat,
        small_blind_seat_index: sbSeat,
        big_blind_seat_index: bbSeat,
        current_turn_seat_index: firstToActSeat ?? sbSeat,
        stage: 'preflop',
        pots: JSON.parse(JSON.stringify(pots)),
        community_cards: [],
        current_bet: bigBlind,
        min_raise: bigBlind,
        last_raise_amount: bigBlind,
        player_bets: {},
        player_states: JSON.parse(JSON.stringify(statesAfterBlinds)),
        folded_players: [],
        all_in_players: allInPlayers,
        player_hands: playerHands,
        betting_round_start_seat: firstToActSeat,
      };

      const { error } = await supabase.from('game_rounds').insert(roundData);
      if (error) throw error;

      await supabase
        .from('lobbies')
        .update({ status: 'in_game', started_at: new Date().toISOString() })
        .eq('id', lobbyId);

      for (const [playerId, amount] of Object.entries(chipDeductions)) {
        const player = activePlayers.find(p => p.id === playerId);
        if (player) {
          await supabase
            .from('lobby_players')
            .update({ chips: player.chips - amount })
            .eq('id', playerId);
        }
      }

      toast({ title: 'Hand Started!', description: 'Good luck!' });
      await fetchCurrentRound();
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: PokerAction, amount?: number) => {
    if (!currentRound || !currentUser) return false;

    const currentPlayer = players.find(p => p.userId === currentUser.id);
    if (!currentPlayer) return false;

    if (currentRound.currentTurnSeatIndex !== currentPlayer.seatIndex) {
      toast({ title: 'Not your turn!', variant: 'destructive' });
      return false;
    }

    const playerState = currentRound.playerStates[currentPlayer.id];
    
    if (playerState?.hasFolded) {
      toast({ title: 'You have folded', variant: 'destructive' });
      return false;
    }

    if (playerState?.isAllIn) {
      toast({ title: 'You are all-in', variant: 'destructive' });
      return false;
    }

    if (currentPlayer.chips <= 0) {
      toast({ title: 'You need chips to play', description: 'Buy chips to continue', variant: 'destructive' });
      return false;
    }

    const validation = validateAction(currentPlayer, currentRound, action, amount);
    if (!validation.valid) {
      toast({ title: 'Invalid action', description: validation.reason, variant: 'destructive' });
      return false;
    }

    setLoading(true);
    try {
      const playerId = currentPlayer.id;
      const pState = currentRound.playerStates[playerId] || {
        playerId,
        committed: 0,
        hasFolded: false,
        isAllIn: false,
        hasActedThisRound: false,
      };

      let updatedRound = { ...currentRound };
      let updatedStates = { ...currentRound.playerStates };
      let chipsToDeduct = 0;

      switch (action) {
        case 'fold':
          updatedStates[playerId] = {
            ...pState,
            hasFolded: true,
            hasActedThisRound: true,
            lastAction: 'fold',
          };
          updatedRound.foldedPlayers = [...updatedRound.foldedPlayers, playerId];
          break;

        case 'check':
          updatedStates[playerId] = {
            ...pState,
            hasActedThisRound: true,
            lastAction: 'check',
          };
          break;

        case 'call': {
          const callAmount = Math.min(
            updatedRound.currentBet - pState.committed,
            currentPlayer.chips
          );
          chipsToDeduct = callAmount;
          const newCommitted = pState.committed + callAmount;
          const isAllIn = callAmount >= currentPlayer.chips;

          updatedStates[playerId] = {
            ...pState,
            committed: newCommitted,
            hasActedThisRound: true,
            isAllIn,
            lastAction: 'call',
          };

          if (isAllIn) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          }
          break;
        }

        case 'bet': {
          const betAmount = amount || updatedRound.minRaise;
          chipsToDeduct = betAmount;
          
          updatedStates[playerId] = {
            ...pState,
            committed: pState.committed + betAmount,
            hasActedThisRound: true,
            isAllIn: betAmount >= currentPlayer.chips,
            lastAction: 'bet',
          };

          updatedRound.currentBet = pState.committed + betAmount;
          updatedRound.lastRaiseAmount = betAmount;
          updatedRound.lastAggressorSeat = currentPlayer.seatIndex;

          for (const [pid, state] of Object.entries(updatedStates)) {
            if (pid !== playerId && !state.hasFolded && !state.isAllIn) {
              updatedStates[pid] = { ...state, hasActedThisRound: false };
            }
          }

          if (betAmount >= currentPlayer.chips) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          }
          break;
        }

        case 'raise': {
          const raiseTotal = amount || (updatedRound.currentBet + updatedRound.lastRaiseAmount);
          const raiseAdded = raiseTotal - pState.committed;
          chipsToDeduct = Math.min(raiseAdded, currentPlayer.chips);
          
          const actualRaiseTotal = pState.committed + chipsToDeduct;
          const raiseAmount = actualRaiseTotal - updatedRound.currentBet;

          updatedStates[playerId] = {
            ...pState,
            committed: actualRaiseTotal,
            hasActedThisRound: true,
            isAllIn: chipsToDeduct >= currentPlayer.chips,
            lastAction: 'raise',
          };

          updatedRound.currentBet = actualRaiseTotal;
          if (raiseAmount >= updatedRound.lastRaiseAmount) {
            updatedRound.lastRaiseAmount = raiseAmount;
          }
          updatedRound.lastAggressorSeat = currentPlayer.seatIndex;

          for (const [pid, state] of Object.entries(updatedStates)) {
            if (pid !== playerId && !state.hasFolded && !state.isAllIn) {
              updatedStates[pid] = { ...state, hasActedThisRound: false };
            }
          }

          if (chipsToDeduct >= currentPlayer.chips) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          }
          break;
        }

        case 'allin': {
          chipsToDeduct = currentPlayer.chips;
          const allinTotal = pState.committed + chipsToDeduct;

          updatedStates[playerId] = {
            ...pState,
            committed: allinTotal,
            hasActedThisRound: true,
            isAllIn: true,
            lastAction: 'allin',
          };

          if (allinTotal > updatedRound.currentBet) {
            const allinRaise = allinTotal - updatedRound.currentBet;
            updatedRound.currentBet = allinTotal;
            
            if (allinRaise >= updatedRound.lastRaiseAmount) {
              updatedRound.lastRaiseAmount = allinRaise;
            }
            updatedRound.lastAggressorSeat = currentPlayer.seatIndex;

            for (const [pid, state] of Object.entries(updatedStates)) {
              if (pid !== playerId && !state.hasFolded && !state.isAllIn) {
                updatedStates[pid] = { ...state, hasActedThisRound: false };
              }
            }
          }

          updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          break;
        }
      }

      updatedRound.playerStates = updatedStates;

      if (chipsToDeduct > 0) {
        await supabase
          .from('lobby_players')
          .update({ chips: currentPlayer.chips - chipsToDeduct })
          .eq('id', playerId);
      }

      updatedRound.pots = calculatePots(updatedStates);

      // Check if hand is over (all but one folded)
      if (isHandOver(players, updatedRound)) {
        const winner = getWinnerByFold(players, updatedRound);
        if (winner) {
          const potTotal = updatedRound.pots.reduce((sum, pot) => sum + pot.amount, 0);

          const winnerPlayer = players.find(p => p.id === winner.id);
          if (winnerPlayer) {
            await supabase
              .from('lobby_players')
              .update({ chips: winnerPlayer.chips + potTotal })
              .eq('id', winner.id);
          }

          updatedRound.stage = 'settled';
          toast({ title: `${winner.user.name} wins!`, description: `Won ${potTotal.toLocaleString()} chips` });
        }
      } else if (isBettingRoundComplete(players, updatedRound)) {
        // Betting round complete - check if all-in runout or normal progression
        if (allPlayersAllIn(players, updatedRound)) {
          // All players all-in - go directly to showdown, reveal all cards
          updatedRound.stage = 'showdown';
          
          if (deckRef.current.length === 0) {
            deckRef.current = shuffleDeck(createDeck());
          }
          const deck = deckRef.current;
          const startIndex = Object.keys(updatedRound.playerHands || {}).length * 2;
          
          // Reveal all 5 community cards
          if (updatedRound.communityCards.length < 5) {
            updatedRound.communityCards = deck.slice(startIndex, startIndex + 5);
          }
        } else {
          // Normal progression - go to awaiting stage for host to reveal
          const nextStage = getNextStage(updatedRound.stage);
          updatedRound.stage = nextStage as GameStage;
          
          // Reset for new betting round
          updatedRound.currentBet = 0;
          updatedRound.lastRaiseAmount = minBlind * 2;
          updatedRound.lastAggressorSeat = undefined;
          updatedRound.playerStates = resetForNewBettingRound(updatedStates);
        }
      } else {
        // Continue betting - find next eligible player
        const nextSeat = findNextEligibleSeat(players, updatedRound, currentPlayer.seatIndex);
        if (nextSeat !== null) {
          updatedRound.currentTurnSeatIndex = nextSeat;
        } else {
          // No eligible players - advance stage
          const nextStage = getNextStage(updatedRound.stage);
          updatedRound.stage = nextStage as GameStage;
        }
      }

      // Update database
      const { error } = await supabase
        .from('game_rounds')
        .update({
          current_turn_seat_index: updatedRound.currentTurnSeatIndex,
          stage: updatedRound.stage,
          pots: JSON.parse(JSON.stringify(updatedRound.pots)),
          community_cards: updatedRound.communityCards,
          current_bet: updatedRound.currentBet,
          min_raise: updatedRound.minRaise,
          last_raise_amount: updatedRound.lastRaiseAmount,
          player_states: JSON.parse(JSON.stringify(updatedRound.playerStates)),
          folded_players: updatedRound.foldedPlayers,
          all_in_players: updatedRound.allInPlayers,
          last_aggressor_seat: updatedRound.lastAggressorSeat,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentRound.id);

      if (error) throw error;

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

  /**
   * Host reveals community cards and starts next betting round
   */
  const revealCommunityCards = async () => {
    if (!currentRound || !currentUser) return false;

    const stage = currentRound.stage;
    if (!isAwaitingStage(stage)) {
      toast({ title: 'Cannot reveal cards now', variant: 'destructive' });
      return false;
    }

    setLoading(true);
    try {
      let updatedRound = { ...currentRound };
      
      // Ensure we have a deck
      if (deckRef.current.length === 0) {
        deckRef.current = shuffleDeck(createDeck());
      }
      const deck = deckRef.current;
      const startIndex = Object.keys(updatedRound.playerHands || {}).length * 2;

      // Reveal cards based on stage
      if (stage === 'awaiting_flop') {
        updatedRound.communityCards = deck.slice(startIndex, startIndex + 3);
        updatedRound.stage = 'flop';
      } else if (stage === 'awaiting_turn') {
        updatedRound.communityCards = [...updatedRound.communityCards, deck[startIndex + 3]];
        updatedRound.stage = 'turn';
      } else if (stage === 'awaiting_river') {
        updatedRound.communityCards = [...updatedRound.communityCards, deck[startIndex + 4]];
        updatedRound.stage = 'river';
      }

      // Reset betting for new round
      updatedRound.currentBet = 0;
      updatedRound.lastRaiseAmount = minBlind * 2;
      updatedRound.lastAggressorSeat = undefined;
      updatedRound.playerStates = resetForNewBettingRound(currentRound.playerStates);

      // Set first to act for postflop
      const firstToAct = getFirstToActSeat(players, updatedRound, 'postflop');
      if (firstToAct !== null) {
        updatedRound.currentTurnSeatIndex = firstToAct;
      }

      // Update database
      const { error } = await supabase
        .from('game_rounds')
        .update({
          stage: updatedRound.stage,
          community_cards: updatedRound.communityCards,
          current_bet: updatedRound.currentBet,
          last_raise_amount: updatedRound.lastRaiseAmount,
          last_aggressor_seat: updatedRound.lastAggressorSeat,
          player_states: JSON.parse(JSON.stringify(updatedRound.playerStates)),
          current_turn_seat_index: updatedRound.currentTurnSeatIndex,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentRound.id);

      if (error) throw error;

      await fetchCurrentRound();
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const awardPot = async (winnerIds: string | string[], potId?: string) => {
    if (!currentRound) return false;

    const winners = Array.isArray(winnerIds) ? winnerIds : [winnerIds];
    
    setLoading(true);
    try {
      const chipsAwarded: Record<string, number> = {};

      for (const pot of currentRound.pots) {
        if (potId && pot.id !== potId) continue;

        const eligibleWinners = winners.filter(w => pot.contributors.includes(w));
        const actualWinners = eligibleWinners.length > 0 ? eligibleWinners : winners.filter(w => {
          const state = currentRound.playerStates[w];
          return state && !state.hasFolded;
        });
        
        if (actualWinners.length === 0) continue;

        const distribution = distributePot(pot, actualWinners, players, currentRound.dealerSeatIndex);
        
        for (const [winnerId, chips] of Object.entries(distribution)) {
          chipsAwarded[winnerId] = (chipsAwarded[winnerId] || 0) + chips;
        }
      }

      // Fetch fresh player data to avoid stale chips
      const freshPlayers = await fetchFreshPlayers();

      for (const [winnerId, chips] of Object.entries(chipsAwarded)) {
        const winner = freshPlayers.find(p => p.id === winnerId);
        if (winner && chips > 0) {
          await supabase
            .from('lobby_players')
            .update({ chips: winner.chips + chips })
            .eq('id', winnerId);
        }
      }

      await supabase
        .from('game_rounds')
        .update({ stage: 'settled' })
        .eq('id', currentRound.id);

      const winnerNames = winners
        .map(id => players.find(p => p.id === id)?.user.name)
        .filter(Boolean)
        .join(', ');

      const totalPot = currentRound.pots.reduce((sum, p) => sum + p.amount, 0);
      toast({ 
        title: winners.length > 1 ? 'Split Pot!' : `${winnerNames} wins!`,
        description: `Pot of ${totalPot.toLocaleString()} chips awarded`
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

  const startNewRound = useCallback(async () => {
    if (!currentRound) return false;

    const { data: freshPlayers } = await supabase
      .from('lobby_players')
      .select('*')
      .eq('lobby_id', lobbyId)
      .eq('active', true);

    const activePlayers = (freshPlayers || [])
      .filter((p: any) => p.chips > 0)
      .sort((a: any, b: any) => a.seat_index - b.seat_index);

    if (activePlayers.length < 2) {
      toast({ title: 'Game Over', description: 'Not enough players with chips to continue' });
      await supabase
        .from('lobbies')
        .update({ status: 'game_finished', ended_at: new Date().toISOString() })
        .eq('id', lobbyId);
      return false;
    }

    const nextDealerSeat = getNextDealerSeat(
      activePlayers.map((p: any) => ({
        ...p,
        seatIndex: p.seat_index,
        active: p.active,
        chips: p.chips,
      })),
      currentRound.dealerSeatIndex
    );

    const dealerIndex = activePlayers.findIndex((p: any) => p.seat_index === nextDealerSeat);
    
    deckRef.current = [];
    
    return startGame(dealerIndex >= 0 ? dealerIndex : 0);
  }, [currentRound, lobbyId, players, startGame]);

  /**
   * End game and calculate settlement
   * Returns settlement data for immediate display
   */
  const endGame = async (): Promise<Settlement | null> => {
    if (!lobbyId) return null;

    setLoading(true);
    try {
      // Handle unsettled pots if round is active
      if (currentRound && currentRound.stage !== 'settled' && currentRound.stage !== 'game_finished') {
        const nonFolded = getNonFoldedPlayers(players, currentRound);
        if (nonFolded.length > 0 && currentRound.pots.length > 0) {
          const totalPot = currentRound.pots.reduce((sum, pot) => sum + pot.amount, 0);
          const sharePerPlayer = Math.floor(totalPot / nonFolded.length);
          const remainder = totalPot % nonFolded.length;

          for (let i = 0; i < nonFolded.length; i++) {
            const player = nonFolded[i];
            const chips = sharePerPlayer + (i < remainder ? 1 : 0);
            await supabase
              .from('lobby_players')
              .update({ chips: player.chips + chips })
              .eq('id', player.id);
          }
        }

        await supabase
          .from('game_rounds')
          .update({ stage: 'game_finished' })
          .eq('id', currentRound.id);
      }

      // Mark lobby as finished
      await supabase
        .from('lobbies')
        .update({ 
          status: 'game_finished',
          ended_at: new Date().toISOString()
        })
        .eq('id', lobbyId);

      // CRITICAL: Fetch fresh player data for accurate settlement
      const freshPlayers = await fetchFreshPlayers();

      // Calculate settlement with fresh data
      const entries: SettlementEntry[] = freshPlayers.map(player => {
        const startingChips = player.buyingsBought * (buyingOptions[0]?.chipsPerBuying || 0);
        const finalChips = player.chips;
        const startingMoney = startingChips * chipUnitValue;
        const finalMoney = finalChips * chipUnitValue;
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

      const settlement: Settlement = {
        entries,
        transfers: [],
        chipUnitValue,
        currencyCode,
      };

      toast({ title: 'Game Ended', description: 'Final settlement is ready' });
      
      return settlement;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Auto-start next round when settled
  useEffect(() => {
    if (currentRound?.stage === 'settled' && !loading) {
      if (autoNextRoundTimer.current) {
        clearTimeout(autoNextRoundTimer.current);
      }

      autoNextRoundTimer.current = setTimeout(() => {
        startNewRound();
      }, AUTO_NEXT_ROUND_DELAY);
    }

    return () => {
      if (autoNextRoundTimer.current) {
        clearTimeout(autoNextRoundTimer.current);
      }
    };
  }, [currentRound?.stage, loading, startNewRound]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!lobbyId) return;

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobby_players',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        () => {
          // Refresh when player data changes
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
    endGame,
    revealCommunityCards,
    fetchCurrentRound,
  };
}