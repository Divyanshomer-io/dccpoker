// Texas Hold'em Poker Engine - Authoritative game rules
// VERSION 2.0 - All bugs fixed per specification
import type { LobbyPlayer, GameRound, Pot, PlayerHandState, PokerAction, ActionValidation } from '@/types/casino';

// ==================== CONSTANTS ====================

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

// ==================== DECK UTILITIES ====================

export function createDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function shuffleDeck(deck: string[]): string[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ==================== SEAT/POSITION UTILITIES ====================

/**
 * Get active players (not folded, optionally not all-in)
 */
export function getActivePlayers(
  players: LobbyPlayer[],
  round: GameRound,
  includeAllIn: boolean = false
): LobbyPlayer[] {
  return players
    .filter(p => {
      const state = round.playerStates[p.id];
      if (!state) return false;
      if (state.hasFolded) return false;
      if (!includeAllIn && state.isAllIn) return false;
      return p.active;
    })
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/**
 * Get the next active seat clockwise from a given seat
 * CRITICAL FIX: Proper clockwise rotation that doesn't prematurely end rounds
 */
export function getNextActiveSeat(
  players: LobbyPlayer[],
  round: GameRound,
  afterSeat: number,
  includeAllIn: boolean = false
): number | null {
  const activePlayers = getActivePlayers(players, round, includeAllIn);
  if (activePlayers.length === 0) return null;

  // Find next player clockwise after the given seat
  const sortedSeats = activePlayers.map(p => p.seatIndex).sort((a, b) => a - b);
  
  // Find the first seat that is greater than afterSeat
  let nextSeat = sortedSeats.find(seat => seat > afterSeat);
  
  // If no seat found after, wrap around to first seat
  if (nextSeat === undefined) {
    nextSeat = sortedSeats[0];
  }
  
  return nextSeat;
}

/**
 * Get the next dealer seat (for rotating dealer)
 */
export function getNextDealerSeat(
  players: LobbyPlayer[],
  currentDealerSeat: number
): number {
  const activePlayers = players
    .filter(p => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  
  if (activePlayers.length === 0) return currentDealerSeat;
  
  const seats = activePlayers.map(p => p.seatIndex);
  const currentIndex = seats.indexOf(currentDealerSeat);
  
  if (currentIndex === -1) {
    // Dealer left, pick next available
    const nextSeat = seats.find(s => s > currentDealerSeat) || seats[0];
    return nextSeat;
  }
  
  return seats[(currentIndex + 1) % seats.length];
}

/**
 * Calculate dealer, SB, BB seats based on dealer position
 * Handles 2-player (heads-up) correctly
 */
export function calculateBlindPositions(
  players: LobbyPlayer[],
  dealerSeat: number
): { dealerSeat: number; sbSeat: number; bbSeat: number } {
  const activePlayers = players
    .filter(p => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  
  if (activePlayers.length < 2) {
    throw new Error('Need at least 2 players with chips');
  }

  const seats = activePlayers.map(p => p.seatIndex);
  let dealerIndex = seats.indexOf(dealerSeat);
  
  // If dealer seat not found, use first available
  if (dealerIndex === -1) {
    dealerIndex = 0;
  }

  const numPlayers = activePlayers.length;
  
  if (numPlayers === 2) {
    // HEADS-UP SPECIAL RULE:
    // Dealer posts SB and acts first preflop
    // Non-dealer posts BB and acts first postflop
    const sbSeat = seats[dealerIndex];
    const bbSeat = seats[(dealerIndex + 1) % numPlayers];
    return { dealerSeat: sbSeat, sbSeat, bbSeat };
  } else {
    // 3+ players: normal positions
    const sbIndex = (dealerIndex + 1) % numPlayers;
    const bbIndex = (dealerIndex + 2) % numPlayers;
    return {
      dealerSeat: seats[dealerIndex],
      sbSeat: seats[sbIndex],
      bbSeat: seats[bbIndex],
    };
  }
}

/**
 * Get the first-to-act seat for a betting round
 * CRITICAL: Handles heads-up correctly
 */
export function getFirstToActSeat(
  players: LobbyPlayer[],
  round: GameRound,
  stage: 'preflop' | 'postflop'
): number | null {
  const activePlayers = getActivePlayers(players, round, false);
  if (activePlayers.length === 0) return null;

  const allNonFolded = getActivePlayers(players, round, true);
  const isHeadsUp = allNonFolded.length === 2;

  if (stage === 'preflop') {
    if (isHeadsUp) {
      // HEADS-UP PREFLOP: Small blind (dealer) acts first
      const sbPlayer = activePlayers.find(p => p.seatIndex === round.smallBlindSeatIndex);
      if (sbPlayer) return sbPlayer.seatIndex;
      return activePlayers[0]?.seatIndex || null;
    } else {
      // 3+ PLAYERS: Player after BB acts first
      return getNextActiveSeat(players, round, round.bigBlindSeatIndex, false);
    }
  } else {
    // POSTFLOP: First active player after dealer
    if (isHeadsUp) {
      // HEADS-UP POSTFLOP: Big blind acts first (non-dealer)
      const bbPlayer = activePlayers.find(p => p.seatIndex === round.bigBlindSeatIndex);
      if (bbPlayer) return bbPlayer.seatIndex;
    }
    return getNextActiveSeat(players, round, round.dealerSeatIndex, false);
  }
}

// ==================== ACTION VALIDATION ====================

/**
 * Validate and compute allowed actions for a player
 */
export function validateAction(
  player: LobbyPlayer,
  round: GameRound,
  action: PokerAction,
  amount?: number
): ActionValidation {
  const state = round.playerStates[player.id];
  if (!state) {
    return { valid: false, reason: 'Player not in hand' };
  }

  if (state.hasFolded) {
    return { valid: false, reason: 'Player has folded' };
  }

  if (state.isAllIn) {
    return { valid: false, reason: 'Player is all-in' };
  }

  // ZERO STACK CHECK: Player with 0 chips cannot act
  if (player.chips <= 0) {
    return { valid: false, reason: 'Player has no chips' };
  }

  const playerStack = player.chips;
  const playerCommitted = state.committed;
  const callAmount = Math.max(0, round.currentBet - playerCommitted);
  const minRaiseAmount = round.lastRaiseAmount || round.minRaise;

  switch (action) {
    case 'fold':
      return { valid: true, callAmount, minRaise: minRaiseAmount };

    case 'check':
      if (callAmount > 0) {
        return { valid: false, reason: 'Cannot check - must call, raise, or fold', callAmount };
      }
      return { valid: true, callAmount: 0 };

    case 'call':
      if (callAmount === 0) {
        return { valid: false, reason: 'Nothing to call - use check instead' };
      }
      if (callAmount > playerStack) {
        // This becomes an all-in
        return { valid: true, callAmount: playerStack };
      }
      return { valid: true, callAmount };

    case 'bet':
      if (round.currentBet > 0) {
        return { valid: false, reason: 'Cannot bet - there is already a bet. Use raise.' };
      }
      const minBet = round.minRaise;
      if (amount === undefined || amount < minBet) {
        if (playerStack < minBet) {
          // All-in bet is allowed
          return { valid: true, minBet: playerStack, maxBet: playerStack };
        }
        return { valid: false, reason: `Minimum bet is ${minBet}`, minBet, maxBet: playerStack };
      }
      if (amount > playerStack) {
        return { valid: false, reason: 'Not enough chips', maxBet: playerStack };
      }
      return { valid: true, minBet, maxBet: playerStack };

    case 'raise':
      if (round.currentBet === 0) {
        return { valid: false, reason: 'Cannot raise - no bet to raise. Use bet.' };
      }
      
      const minRaiseTotal = round.currentBet + minRaiseAmount;
      const amountNeeded = minRaiseTotal - playerCommitted;
      
      if (amount === undefined) {
        return { 
          valid: false, 
          reason: 'Raise amount required',
          minRaise: minRaiseAmount,
          callAmount,
        };
      }

      const raiseAmount = amount - playerCommitted;
      
      if (raiseAmount > playerStack) {
        return { valid: false, reason: 'Not enough chips', maxBet: playerStack + playerCommitted };
      }

      if (amount <= round.currentBet) {
        return { valid: false, reason: 'Raise must be higher than current bet' };
      }

      // All-in exception: can raise any amount when going all-in
      if (raiseAmount < amountNeeded && raiseAmount < playerStack) {
        return { 
          valid: false, 
          reason: `Minimum raise is to ${minRaiseTotal}`,
          minRaise: amountNeeded,
        };
      }

      return { valid: true, minRaise: minRaiseAmount };

    case 'allin':
      return { valid: true, maxBet: playerStack };

    default:
      return { valid: false, reason: 'Unknown action' };
  }
}

/**
 * Get all valid actions for a player
 */
export function getValidActions(
  player: LobbyPlayer,
  round: GameRound
): { action: PokerAction; minAmount?: number; maxAmount?: number }[] {
  const state = round.playerStates[player.id];
  if (!state || state.hasFolded || state.isAllIn) return [];
  if (player.chips <= 0) return [];

  const actions: { action: PokerAction; minAmount?: number; maxAmount?: number }[] = [];
  const callAmount = Math.max(0, round.currentBet - state.committed);
  const playerStack = player.chips;

  // Fold is always available
  actions.push({ action: 'fold' });

  // Check if can check
  if (callAmount === 0) {
    actions.push({ action: 'check' });
  }

  // Check if can call
  if (callAmount > 0 && playerStack > 0) {
    actions.push({ action: 'call', minAmount: Math.min(callAmount, playerStack) });
  }

  // Check if can bet (only if no current bet)
  if (round.currentBet === 0 && playerStack > 0) {
    const minBet = Math.min(round.minRaise, playerStack);
    actions.push({ action: 'bet', minAmount: minBet, maxAmount: playerStack });
  }

  // Check if can raise
  if (round.currentBet > 0 && playerStack > callAmount) {
    const minRaiseTotal = round.currentBet + (round.lastRaiseAmount || round.minRaise);
    const minRaiseNeeded = minRaiseTotal - state.committed;
    if (minRaiseNeeded <= playerStack || playerStack > callAmount) {
      actions.push({
        action: 'raise',
        minAmount: Math.min(minRaiseNeeded, playerStack) + state.committed,
        maxAmount: playerStack + state.committed,
      });
    }
  }

  // All-in is always available if player has chips
  if (playerStack > 0) {
    actions.push({ action: 'allin', minAmount: playerStack });
  }

  return actions;
}

// ==================== POT CALCULATION ====================

/**
 * Calculate pots from player commitments (handles side pots)
 * CRITICAL FIX: Proper side pot calculation
 */
export function calculatePots(playerStates: Record<string, PlayerHandState>): Pot[] {
  // Get all players with commitments (including folded - they still contributed)
  const players = Object.entries(playerStates)
    .filter(([_, state]) => state.committed > 0)
    .map(([playerId, state]) => ({
      playerId,
      committed: state.committed,
      hasFolded: state.hasFolded,
    }))
    .sort((a, b) => a.committed - b.committed);

  if (players.length === 0) return [];

  const pots: Pot[] = [];
  let remaining = players.map(p => ({ ...p, remaining: p.committed }));
  let potIndex = 0;

  while (remaining.some(p => p.remaining > 0)) {
    const nonZero = remaining.filter(p => p.remaining > 0);
    if (nonZero.length === 0) break;

    const smallest = Math.min(...nonZero.map(p => p.remaining));
    const contributors = nonZero.map(p => p.playerId);
    
    // Eligible winners are non-folded contributors
    const eligibleWinners = nonZero
      .filter(p => !p.hasFolded)
      .map(p => p.playerId);
    
    const potAmount = smallest * contributors.length;
    
    if (potAmount > 0 && eligibleWinners.length > 0) {
      pots.push({
        id: potIndex === 0 ? 'main' : `side-${potIndex}`,
        amount: potAmount,
        contributors: eligibleWinners,
      });
      potIndex++;
    }

    // Subtract smallest from each contributor
    remaining = remaining.map(p => ({
      ...p,
      remaining: p.remaining >= smallest ? p.remaining - smallest : p.remaining,
    }));
  }

  return pots.filter(p => p.amount > 0);
}

/**
 * Distribute a pot among winners with remainder handling
 * Uses seat order for remainder chips (clockwise from dealer)
 */
export function distributePot(
  pot: Pot,
  winnerIds: string[],
  players: LobbyPlayer[],
  dealerSeat: number
): Record<string, number> {
  if (winnerIds.length === 0) return {};
  if (winnerIds.length === 1) {
    return { [winnerIds[0]]: pot.amount };
  }

  // Sort winners by seat index clockwise from dealer
  const sortedWinners = [...winnerIds].sort((a, b) => {
    const playerA = players.find(p => p.id === a);
    const playerB = players.find(p => p.id === b);
    if (!playerA || !playerB) return 0;

    const maxSeat = Math.max(...players.map(p => p.seatIndex));
    const distA = (playerA.seatIndex - dealerSeat + maxSeat + 1) % (maxSeat + 1);
    const distB = (playerB.seatIndex - dealerSeat + maxSeat + 1) % (maxSeat + 1);
    return distA - distB;
  });

  const share = Math.floor(pot.amount / winnerIds.length);
  const remainder = pot.amount % winnerIds.length;

  const distribution: Record<string, number> = {};
  sortedWinners.forEach((winnerId, index) => {
    distribution[winnerId] = share + (index < remainder ? 1 : 0);
  });

  return distribution;
}

// ==================== BETTING ROUND MANAGEMENT ====================

/**
 * Check if the current betting round is complete
 * CRITICAL FIX: Proper detection of when betting round ends
 */
export function isBettingRoundComplete(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getActivePlayers(players, round, true);
  
  // If only one player left (others folded), hand is over
  if (nonFolded.length <= 1) return true;

  // Get players who can still act (not folded, not all-in)
  const canAct = getActivePlayers(players, round, false);
  
  // If no one can act, round is complete
  if (canAct.length === 0) return true;

  // If only one player can act and they've matched the bet, round is complete
  if (canAct.length === 1) {
    const player = canAct[0];
    const state = round.playerStates[player.id];
    if (state && state.committed >= round.currentBet && state.hasActedThisRound) {
      return true;
    }
  }

  // Check if all active players have acted and matched current bet
  for (const player of canAct) {
    const state = round.playerStates[player.id];
    if (!state) return false;
    if (!state.hasActedThisRound) return false;
    if (state.committed < round.currentBet) return false;
  }

  return true;
}

/**
 * Check if the hand is over (only one player remaining)
 */
export function isHandOver(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getActivePlayers(players, round, true);
  return nonFolded.length <= 1;
}

/**
 * Get the winner when all others have folded
 */
export function getWinnerByFold(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer | null {
  const nonFolded = getActivePlayers(players, round, true);
  return nonFolded.length === 1 ? nonFolded[0] : null;
}

/**
 * Check if all remaining players are all-in (no more betting possible)
 */
export function allPlayersAllIn(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getActivePlayers(players, round, true);
  if (nonFolded.length <= 1) return false;

  // Count players who can still act
  const canAct = getActivePlayers(players, round, false);
  
  // If 0 or 1 player can act, all others are all-in
  return canAct.length <= 1;
}

/**
 * Get pending reveal count for community cards
 */
export function getPendingRevealCount(
  currentStage: string,
  currentCommunityCards: number
): number {
  switch (currentStage) {
    case 'flop':
      return currentCommunityCards === 0 ? 3 : 0;
    case 'turn':
      return currentCommunityCards === 3 ? 1 : 0;
    case 'river':
      return currentCommunityCards === 4 ? 1 : 0;
    default:
      return 0;
  }
}

// ==================== STAGE PROGRESSION ====================

export function getNextStage(currentStage: string): string {
  const stages = ['preflop', 'flop', 'turn', 'river', 'showdown', 'settled'];
  const currentIndex = stages.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= stages.length - 1) return 'settled';
  return stages[currentIndex + 1];
}

export function getCommunityCardsForStage(
  deck: string[],
  stage: string,
  existingCards: string[]
): string[] {
  switch (stage) {
    case 'flop':
      return deck.slice(0, 3);
    case 'turn':
      return [...existingCards, deck[existingCards.length]];
    case 'river':
      return [...existingCards, deck[existingCards.length]];
    default:
      return existingCards;
  }
}

// ==================== INITIALIZATION ====================

/**
 * Initialize player states for a new hand
 */
export function initializePlayerStates(
  players: LobbyPlayer[]
): Record<string, PlayerHandState> {
  const states: Record<string, PlayerHandState> = {};
  
  for (const player of players) {
    if (player.active && player.chips > 0) {
      states[player.id] = {
        playerId: player.id,
        committed: 0,
        hasFolded: false,
        isAllIn: false,
        hasActedThisRound: false,
      };
    }
  }
  
  return states;
}

/**
 * Post blinds for a new hand
 */
export function postBlinds(
  players: LobbyPlayer[],
  round: GameRound,
  smallBlind: number,
  bigBlind: number
): {
  playerStates: Record<string, PlayerHandState>;
  chipDeductions: Record<string, number>;
} {
  const playerStates = { ...round.playerStates };
  const chipDeductions: Record<string, number> = {};

  // Find SB and BB players
  const sbPlayer = players.find(p => p.seatIndex === round.smallBlindSeatIndex);
  const bbPlayer = players.find(p => p.seatIndex === round.bigBlindSeatIndex);

  if (sbPlayer && playerStates[sbPlayer.id]) {
    const sbAmount = Math.min(smallBlind, sbPlayer.chips);
    playerStates[sbPlayer.id] = {
      ...playerStates[sbPlayer.id],
      committed: sbAmount,
      isAllIn: sbPlayer.chips <= smallBlind,
      // SB has NOT acted yet - they still need to act preflop
      hasActedThisRound: false,
    };
    chipDeductions[sbPlayer.id] = sbAmount;
  }

  if (bbPlayer && playerStates[bbPlayer.id]) {
    const bbAmount = Math.min(bigBlind, bbPlayer.chips);
    playerStates[bbPlayer.id] = {
      ...playerStates[bbPlayer.id],
      committed: bbAmount,
      isAllIn: bbPlayer.chips <= bigBlind,
      // BB has NOT acted yet - they can still raise
      hasActedThisRound: false,
    };
    chipDeductions[bbPlayer.id] = bbAmount;
  }

  return { playerStates, chipDeductions };
}

/**
 * Reset player states for a new betting round
 */
export function resetForNewBettingRound(
  playerStates: Record<string, PlayerHandState>
): Record<string, PlayerHandState> {
  const newStates: Record<string, PlayerHandState> = {};
  
  for (const [playerId, state] of Object.entries(playerStates)) {
    newStates[playerId] = {
      ...state,
      hasActedThisRound: false,
      lastAction: undefined,
    };
  }
  
  return newStates;
}

/**
 * Check if player should be auto-folded (0 chips during hand)
 */
export function shouldAutoFold(player: LobbyPlayer, round: GameRound): boolean {
  const state = round.playerStates[player.id];
  if (!state) return false;
  if (state.hasFolded || state.isAllIn) return false;
  return player.chips <= 0;
}
