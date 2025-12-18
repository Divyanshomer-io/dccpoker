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
  isGameOver,
  getWinnerByFold,
  allPlayersAllIn,
  getNextStage,
  initializePlayerStates,
  postBlinds,
  resetForNewBettingRound,
  getEligiblePlayers,
  getNonFoldedPlayers,
  isAwaitingStage,
  getNextBlindSeat,
  getBettingRoundStartSeat,
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

      const firstDealerSeat = activePlayers[dealerIndex % activePlayers.length].seatIndex;
      const { dealerSeat, sbSeat, bbSeat } = calculateBlindPositions(activePlayers, firstDealerSeat);

      const playerStates = initializePlayerStates(activePlayers);

      const roundId = generateId();

      const deck = createNewDeck();
      const playerHands: Record<string, string[]> = {};
      let cardIndex = 0;
      for (const player of activePlayers) {
        playerHands[player.id] = [deck[cardIndex], deck[cardIndex + 1]];
        cardIndex += 2;
      }

      // NO AUTO-BLIND POSTING: Blind player bets manually (>= minBlind)
      // First to act is the blind player (BB seat)
      const firstToActSeat = bbSeat;
      
      console.log('[GAME] Starting game - dealer:', dealerSeat, 'SB:', sbSeat, 'BB (blind):', bbSeat, 'First to act:', firstToActSeat);

      const roundData = {
        id: roundId,
        lobby_id: lobbyId,
        round_number: (currentRound?.roundNumber || 0) + 1,
        dealer_seat_index: dealerSeat,
        small_blind_seat_index: sbSeat,
        big_blind_seat_index: bbSeat,
        current_turn_seat_index: firstToActSeat,
        stage: 'preflop',
        pots: [],
        community_cards: [],
        current_bet: 0, // No blinds posted automatically
        min_raise: minBlind, // Min bet is the minBlind
        last_raise_amount: minBlind,
        player_bets: {},
        player_states: JSON.parse(JSON.stringify(playerStates)),
        folded_players: [],
        all_in_players: [],
        player_hands: playerHands,
        betting_round_start_seat: firstToActSeat,
      };

      const { error } = await supabase.from('game_rounds').insert(roundData);
      if (error) throw error;

      await supabase
        .from('lobbies')
        .update({ status: 'in_game', started_at: new Date().toISOString() })
        .eq('id', lobbyId);

      toast({ title: 'Game Started!', description: 'Blind player bets first!' });
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

    // CRITICAL: Check if it's actually this player's turn
    if (currentRound.currentTurnSeatIndex !== currentPlayer.seatIndex) {
      toast({ title: 'Not your turn!', variant: 'destructive' });
      return false;
    }

    const playerState = currentRound.playerStates[currentPlayer.id];
    
    // CRITICAL: Folded players CANNOT act
    if (playerState?.hasFolded) {
      toast({ title: 'You have folded', description: 'Wait for next game', variant: 'destructive' });
      return false;
    }

    // CRITICAL: All-in players CANNOT act
    if (playerState?.isAllIn) {
      toast({ title: 'You are all-in', description: 'Wait for game to finish', variant: 'destructive' });
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
          console.log('[GAME] Player folded:', playerId);
          break;

        case 'check':
          updatedStates[playerId] = {
            ...pState,
            hasActedThisRound: true,
            lastAction: 'check',
          };
          console.log('[GAME] Player checked:', playerId);
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
          console.log('[GAME] Player called:', playerId, 'amount:', callAmount, 'isAllIn:', isAllIn);
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

          // Reset hasActedThisRound for other ACTIVE players (not folded, not all-in)
          for (const [pid, state] of Object.entries(updatedStates)) {
            if (pid !== playerId && !state.hasFolded && !state.isAllIn) {
              updatedStates[pid] = { ...state, hasActedThisRound: false };
            }
          }

          if (betAmount >= currentPlayer.chips) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          }
          console.log('[GAME] Player bet:', playerId, 'amount:', betAmount);
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

          // Reset hasActedThisRound for other ACTIVE players
          for (const [pid, state] of Object.entries(updatedStates)) {
            if (pid !== playerId && !state.hasFolded && !state.isAllIn) {
              updatedStates[pid] = { ...state, hasActedThisRound: false };
            }
          }

          if (chipsToDeduct >= currentPlayer.chips) {
            updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          }
          console.log('[GAME] Player raised:', playerId, 'to:', actualRaiseTotal);
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

            // Reset hasActedThisRound for other ACTIVE players
            for (const [pid, state] of Object.entries(updatedStates)) {
              if (pid !== playerId && !state.hasFolded && !state.isAllIn) {
                updatedStates[pid] = { ...state, hasActedThisRound: false };
              }
            }
          }

          updatedRound.allInPlayers = [...updatedRound.allInPlayers, playerId];
          console.log('[GAME] Player all-in:', playerId, 'total:', allinTotal);
          break;
        }
      }

      updatedRound.playerStates = updatedStates;

      // Deduct chips from player
      if (chipsToDeduct > 0) {
        await supabase
          .from('lobby_players')
          .update({ chips: currentPlayer.chips - chipsToDeduct })
          .eq('id', playerId);
      }

      // Recalculate pots
      updatedRound.pots = calculatePots(updatedStates);

      // === STEP 1: Check if game is over (all but one folded) ===
      if (isGameOver(players, updatedRound)) {
        const winner = getWinnerByFold(players, updatedRound);
        if (winner) {
          const potTotal = updatedRound.pots.reduce((sum, pot) => sum + pot.amount, 0);

          // Fetch fresh chip count before awarding
          const { data: freshWinner } = await supabase
            .from('lobby_players')
            .select('chips')
            .eq('id', winner.id)
            .single();

          if (freshWinner) {
            await supabase
              .from('lobby_players')
              .update({ chips: freshWinner.chips + potTotal })
              .eq('id', winner.id);
          }

          updatedRound.stage = 'settled';
          console.log('[GAME] Game over - winner by fold:', winner.user.name, 'wins', potTotal);
          toast({ title: `${winner.user.name} wins!`, description: `Won ${potTotal.toLocaleString()} chips` });
        }
      } 
      // === STEP 2: Check if betting round is complete ===
      else {
        // First, find the next seat
        const nextSeat = findNextEligibleSeat(players, updatedRound, currentPlayer.seatIndex);
        
        if (nextSeat !== null) {
          updatedRound.currentTurnSeatIndex = nextSeat;
        }
        
        // Now check if betting round is complete with the updated turn
        if (isBettingRoundComplete(players, updatedRound)) {
          console.log('[GAME] Betting round complete, current stage:', updatedRound.stage);
          
          // Check if all remaining players are all-in
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
            console.log('[GAME] All players all-in, going to showdown');
          } else {
            // Normal progression - go to awaiting stage for host to reveal
            const nextStage = getNextStage(updatedRound.stage);
            updatedRound.stage = nextStage as GameStage;
            console.log('[GAME] Advancing to stage:', nextStage);
          }
        } else if (nextSeat === null) {
          // No eligible players found - round should be complete
          console.log('[GAME] SAFETY: No eligible seat found, forcing stage advance');
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
   * Round 1: Reveal 3 cards (flop)
   * Round 2: Reveal 1 card (turn)
   * Round 3: Reveal 1 card (river)
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
        // Round 1: Reveal 3 cards
        updatedRound.communityCards = deck.slice(startIndex, startIndex + 3);
        updatedRound.stage = 'flop';
        console.log('[GAME] Revealing flop (3 cards)');
      } else if (stage === 'awaiting_turn') {
        // Round 2: Reveal 1 card
        updatedRound.communityCards = [...updatedRound.communityCards, deck[startIndex + 3]];
        updatedRound.stage = 'turn';
        console.log('[GAME] Revealing turn (1 card)');
      } else if (stage === 'awaiting_river') {
        // Round 3: Reveal 1 card
        updatedRound.communityCards = [...updatedRound.communityCards, deck[startIndex + 4]];
        updatedRound.stage = 'river';
        console.log('[GAME] Revealing river (1 card)');
      }

      // Reset betting for new round - but POT DOES NOT RESET
      updatedRound.currentBet = 0;
      updatedRound.lastRaiseAmount = minBlind * 2;
      updatedRound.lastAggressorSeat = undefined;
      updatedRound.playerStates = resetForNewBettingRound(currentRound.playerStates);

      // Check if anyone can actually act in the new round
      const eligible = getEligiblePlayers(players, updatedRound);
      console.log('[GAME] After card reveal, eligible players:', eligible.length);
      
      if (eligible.length === 0) {
        // No one can act - all remaining players are all-in or folded
        const nonFolded = getNonFoldedPlayers(players, updatedRound);
        if (nonFolded.length <= 1) {
          // Game over - one player left
          console.log('[GAME] Only one non-folded player, game over');
          updatedRound.stage = 'showdown';
        } else {
          // All remaining are all-in - go to showdown, reveal remaining cards
          console.log('[GAME] All players all-in - going to showdown');
          updatedRound.stage = 'showdown';
          
          // Reveal all remaining community cards
          if (updatedRound.communityCards.length < 5) {
            const remainingCards = 5 - updatedRound.communityCards.length;
            const nextCardIndex = startIndex + updatedRound.communityCards.length;
            for (let i = 0; i < remainingCards; i++) {
              updatedRound.communityCards.push(deck[nextCardIndex + i]);
            }
          }
        }
        // No betting round start seat needed since no one can act
        updatedRound.bettingRoundStartSeat = undefined;
      } else {
        // CUSTOM GAME RULE: Blind (BB) acts first each round after card reveal
        // Use postflop logic which returns BB if eligible, or next eligible after dealer
        const firstToAct = getFirstToActSeat(players, updatedRound, 'postflop');
        if (firstToAct !== null) {
          updatedRound.currentTurnSeatIndex = firstToAct;
          updatedRound.bettingRoundStartSeat = firstToAct; // Track for round completion
          console.log('[GAME] First to act after reveal (blind):', firstToAct);
        }
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
          betting_round_start_seat: updatedRound.bettingRoundStartSeat,
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

        // For split pots or manual selection, use the selected winners
        // Filter to only non-folded players
        const validWinners = winners.filter(w => {
          const state = currentRound.playerStates[w];
          return state && !state.hasFolded;
        });
        
        if (validWinners.length === 0) {
          console.warn('[GAME] No valid winners for pot', pot.id);
          continue;
        }

        const distribution = distributePot(pot, validWinners, players, currentRound.dealerSeatIndex, currentRound.playerStates);
        
        for (const [winnerId, chips] of Object.entries(distribution)) {
          chipsAwarded[winnerId] = (chipsAwarded[winnerId] || 0) + chips;
          console.log('[GAME] Awarding', chips, 'chips to', winnerId, 'from pot', pot.id);
        }
      }

      // Fetch fresh player data to avoid stale chips
      const freshPlayers = await fetchFreshPlayers();

      for (const [winnerId, chips] of Object.entries(chipsAwarded)) {
        const winner = freshPlayers.find(p => p.id === winnerId);
        if (winner && chips > 0) {
          const newChips = winner.chips + chips;
          await supabase
            .from('lobby_players')
            .update({ chips: newChips })
            .eq('id', winnerId);
          console.log('[GAME] Updated', winnerId, 'chips from', winner.chips, 'to', newChips);
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

  /**
   * Start next game with blind shifting clockwise
   */
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

    // Shift dealer clockwise for next game
    const mappedPlayers = activePlayers.map((p: any) => ({
      ...p,
      seatIndex: p.seat_index,
      active: p.active,
      chips: p.chips,
    }));
    
    const nextDealerSeat = getNextDealerSeat(mappedPlayers, currentRound.dealerSeatIndex);
    const dealerIndex = activePlayers.findIndex((p: any) => p.seat_index === nextDealerSeat);
    
    console.log('[GAME] Starting new game - previous dealer:', currentRound.dealerSeatIndex, 'new dealer:', nextDealerSeat);
    
    // Reset deck for new game
    deckRef.current = [];
    
    return startGame(dealerIndex >= 0 ? dealerIndex : 0);
  }, [currentRound, lobbyId, startGame]);

  /**
   * End game and calculate settlement
   */
  const endGame = async (): Promise<Settlement | null> => {
    if (!lobbyId) return null;

    setLoading(true);
    try {
      // Handle unsettled pots if game is active
      if (currentRound && currentRound.stage !== 'settled' && currentRound.stage !== 'game_finished') {
        const nonFolded = getNonFoldedPlayers(players, currentRound);
        if (nonFolded.length > 0 && currentRound.pots.length > 0) {
          const totalPot = currentRound.pots.reduce((sum, pot) => sum + pot.amount, 0);
          const sharePerPlayer = Math.floor(totalPot / nonFolded.length);
          const remainder = totalPot % nonFolded.length;

          // Fetch fresh player data
          const freshPlayers = await fetchFreshPlayers();

          // Award pot to remaining players
          for (let i = 0; i < nonFolded.length; i++) {
            const player = nonFolded[i];
            const chips = sharePerPlayer + (i < remainder ? 1 : 0);
            const freshPlayer = freshPlayers.find(p => p.id === player.id);
            if (freshPlayer) {
              await supabase
                .from('lobby_players')
                .update({ chips: freshPlayer.chips + chips })
                .eq('id', player.id);
            }
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

      // Fetch fresh player data for accurate settlement
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

  // Auto-start next game when settled
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
