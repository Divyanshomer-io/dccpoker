// Texas Hold'em Poker Engine - Authoritative game rules
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
 * Get the next active seat clockwise from a given seat
 * Active means: player exists, has chips or is all-in, hasn't folded
 */
export function getNextActiveSeat(
  players: LobbyPlayer[],
  round: GameRound,
  afterSeat: number,
  includeAllIn: boolean = false
): number | null {
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const activePlayers = sortedPlayers.filter(p => {
    const state = round.playerStates[p.id];
    if (!state) return false;
    if (state.hasFolded) return false;
    if (!includeAllIn && state.isAllIn) return false;
    return true;
  });

  if (activePlayers.length === 0) return null;

  // Find next player after the given seat (clockwise)
  let nextPlayer = activePlayers.find(p => p.seatIndex > afterSeat);
  if (!nextPlayer) {
    nextPlayer = activePlayers[0]; // Wrap around
  }
  
  return nextPlayer.seatIndex;
}

/**
 * Get the next seat clockwise (simple rotation)
 */
export function getNextSeat(
  players: LobbyPlayer[],
  currentSeat: number
): number {
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const activeSeats = sortedPlayers.filter(p => p.active).map(p => p.seatIndex);
  
  const currentIndex = activeSeats.indexOf(currentSeat);
  if (currentIndex === -1) return activeSeats[0];
  
  const nextIndex = (currentIndex + 1) % activeSeats.length;
  return activeSeats[nextIndex];
}

/**
 * Calculate dealer, SB, BB seats based on dealer position
 */
export function calculateBlindPositions(
  players: LobbyPlayer[],
  dealerSeat: number
): { dealerSeat: number; sbSeat: number; bbSeat: number } {
  const activePlayers = players.filter(p => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  
  if (activePlayers.length < 2) {
    throw new Error('Need at least 2 players with chips');
  }

  const numPlayers = activePlayers.length;
  const dealerIndex = activePlayers.findIndex(p => p.seatIndex === dealerSeat) 
    || 0;
  
  if (numPlayers === 2) {
    // Heads-up: Dealer posts SB, other posts BB
    const sbSeat = activePlayers[dealerIndex].seatIndex;
    const bbSeat = activePlayers[(dealerIndex + 1) % numPlayers].seatIndex;
    return { dealerSeat: sbSeat, sbSeat, bbSeat };
  } else {
    // 3+ players: normal positions
    const sbIndex = (dealerIndex + 1) % numPlayers;
    const bbIndex = (dealerIndex + 2) % numPlayers;
    return {
      dealerSeat: activePlayers[dealerIndex].seatIndex,
      sbSeat: activePlayers[sbIndex].seatIndex,
      bbSeat: activePlayers[bbIndex].seatIndex,
    };
  }
}

/**
 * Get the first-to-act seat for a betting round
 */
export function getFirstToActSeat(
  players: LobbyPlayer[],
  round: GameRound,
  stage: 'preflop' | 'postflop'
): number | null {
  const activePlayers = players.filter(p => {
    const state = round.playerStates[p.id];
    return p.active && state && !state.hasFolded && !state.isAllIn;
  }).sort((a, b) => a.seatIndex - b.seatIndex);

  if (activePlayers.length === 0) return null;

  const numPlayers = players.filter(p => p.active).length;
  const isHeadsUp = numPlayers === 2;

  if (stage === 'preflop') {
    if (isHeadsUp) {
      // Heads-up: SB (dealer) acts first preflop
      return round.smallBlindSeatIndex;
    } else {
      // 3+ players: player after BB acts first
      return getNextActiveSeat(players, round, round.bigBlindSeatIndex, false);
    }
  } else {
    // Post-flop: first active player after dealer
    if (isHeadsUp) {
      // Heads-up postflop: BB acts first (non-dealer)
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
      const minBet = round.minRaise; // First bet must be at least BB
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
      
      // Minimum raise: must add at least minRaiseAmount to current bet
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

      // Amount is the total chips player wants to commit
      const raiseAmount = amount - playerCommitted;
      
      if (raiseAmount > playerStack) {
        return { valid: false, reason: 'Not enough chips', maxBet: playerStack + playerCommitted };
      }

      if (amount <= round.currentBet) {
        return { valid: false, reason: 'Raise must be higher than current bet' };
      }

      // Check minimum raise (unless it's an all-in)
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
 * Algorithm from the spec: sort by commitment, create pots layer by layer
 */
export function calculatePots(playerStates: Record<string, PlayerHandState>): Pot[] {
  // Get non-folded players with commitments
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
    // Find smallest non-zero remaining
    const nonZero = remaining.filter(p => p.remaining > 0);
    if (nonZero.length === 0) break;

    const smallest = Math.min(...nonZero.map(p => p.remaining));
    
    // Contributors are all players with remaining >= smallest
    const contributors = nonZero.map(p => p.playerId);
    
    // Eligible winners are non-folded contributors
    const eligibleWinners = nonZero
      .filter(p => !p.hasFolded)
      .map(p => p.playerId);
    
    const potAmount = smallest * contributors.length;
    
    pots.push({
      id: potIndex === 0 ? 'main' : `side-${potIndex}`,
      amount: potAmount,
      contributors: eligibleWinners, // Only non-folded can win
    });
    potIndex++;

    // Subtract smallest from each contributor
    remaining = remaining.map(p => ({
      ...p,
      remaining: p.remaining >= smallest ? p.remaining - smallest : p.remaining,
    }));
  }

  // Combine any pots with same contributors
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

    // Calculate distance from dealer (clockwise)
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
 */
export function isBettingRoundComplete(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const activePlayers = players.filter(p => {
    const state = round.playerStates[p.id];
    return p.active && state && !state.hasFolded && !state.isAllIn;
  });

  // If no one can act, round is complete
  if (activePlayers.length === 0) return true;

  // If only one player left (others folded), round complete
  const nonFolded = players.filter(p => {
    const state = round.playerStates[p.id];
    return p.active && state && !state.hasFolded;
  });
  if (nonFolded.length <= 1) return true;

  // Check if all active players have acted and matched current bet
  for (const player of activePlayers) {
    const state = round.playerStates[player.id];
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
  const nonFolded = players.filter(p => {
    const state = round.playerStates[p.id];
    return p.active && state && !state.hasFolded;
  });
  return nonFolded.length <= 1;
}

/**
 * Get the winner when all others have folded
 */
export function getWinnerByFold(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer | null {
  const nonFolded = players.filter(p => {
    const state = round.playerStates[p.id];
    return p.active && state && !state.hasFolded;
  });
  return nonFolded.length === 1 ? nonFolded[0] : null;
}

/**
 * Check if all remaining players are all-in (no more betting possible)
 */
export function allPlayersAllIn(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = players.filter(p => {
    const state = round.playerStates[p.id];
    return p.active && state && !state.hasFolded;
  });

  // At most one player can still act (have chips and not all-in)
  const canAct = nonFolded.filter(p => {
    const state = round.playerStates[p.id];
    return !state.isAllIn && p.chips > 0;
  });

  return canAct.length <= 1;
}

// ==================== STAGE PROGRESSION ====================

export function getNextStage(currentStage: GameRound['stage']): GameRound['stage'] {
  const stages: GameRound['stage'][] = ['preflop', 'flop', 'turn', 'river', 'showdown', 'settled'];
  const currentIndex = stages.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= stages.length - 1) return 'settled';
  return stages[currentIndex + 1];
}

export function getCommunityCardsForStage(
  deck: string[],
  stage: GameRound['stage'],
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
    };
    chipDeductions[sbPlayer.id] = sbAmount;
  }

  if (bbPlayer && playerStates[bbPlayer.id]) {
    const bbAmount = Math.min(bigBlind, bbPlayer.chips);
    playerStates[bbPlayer.id] = {
      ...playerStates[bbPlayer.id],
      committed: bbAmount,
      isAllIn: bbPlayer.chips <= bigBlind,
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
    };
  }
  
  return newStates;
}
