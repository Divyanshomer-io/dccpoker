// Texas Hold'em Poker Engine - AUTHORITATIVE VERSION
// Fixes: folding, betting round detection, all-in handling, pot management
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

// ==================== ELIGIBILITY CHECKS ====================

/**
 * CRITICAL: Check if player is eligible to act
 * A player can act ONLY if:
 * - Not folded
 * - Not all-in
 * - Has chips remaining
 */
export function isEligibleToAct(player: LobbyPlayer, state: PlayerHandState | undefined): boolean {
  if (!state) return false;
  if (state.hasFolded) return false;
  if (state.isAllIn) return false;
  if (player.chips <= 0) return false;
  return true;
}

/**
 * Get eligible players (can still act in this betting round)
 */
export function getEligiblePlayers(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer[] {
  return players
    .filter(p => isEligibleToAct(p, round.playerStates[p.id]))
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/**
 * Get non-folded players (includes all-in, for pot eligibility)
 */
export function getNonFoldedPlayers(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer[] {
  return players
    .filter(p => {
      const state = round.playerStates[p.id];
      return state && !state.hasFolded && p.active;
    })
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

// ==================== TURN ADVANCEMENT ====================

/**
 * Find next eligible seat clockwise from a given seat
 * CRITICAL: Only returns players who can act (not folded, not all-in, has chips)
 */
export function findNextEligibleSeat(
  players: LobbyPlayer[],
  round: GameRound,
  fromSeat: number
): number | null {
  const eligible = getEligiblePlayers(players, round);
  if (eligible.length === 0) return null;

  const seats = eligible.map(p => p.seatIndex).sort((a, b) => a - b);
  
  // Find first seat after fromSeat
  let nextSeat = seats.find(s => s > fromSeat);
  
  // Wrap around if needed
  if (nextSeat === undefined) {
    nextSeat = seats[0];
  }
  
  return nextSeat;
}

// ==================== BETTING ROUND COMPLETION ====================

/**
 * CRITICAL: Check if betting round is complete
 * Round ends when:
 * 1. Only 0-1 players can act (others folded/all-in), OR
 * 2. All eligible players have acted AND all have matched currentBet
 */
export function isBettingRoundComplete(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getNonFoldedPlayers(players, round);
  
  // If only 1 player left (others folded), hand is over
  if (nonFolded.length <= 1) return true;

  const eligible = getEligiblePlayers(players, round);
  
  // If no one can act (all folded/all-in), round is complete
  if (eligible.length === 0) return true;

  // If only 1 player can act and they've matched the bet, round is complete
  if (eligible.length === 1) {
    const player = eligible[0];
    const state = round.playerStates[player.id];
    return state.hasActedThisRound && state.committed >= round.currentBet;
  }

  // Check if all eligible players have:
  // 1. Acted this round
  // 2. Matched the current bet
  for (const player of eligible) {
    const state = round.playerStates[player.id];
    if (!state.hasActedThisRound) return false;
    if (state.committed < round.currentBet) return false;
  }

  return true;
}

/**
 * Check if hand is over (only one player remaining)
 */
export function isHandOver(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getNonFoldedPlayers(players, round);
  return nonFolded.length <= 1;
}

/**
 * Get winner when all others have folded
 */
export function getWinnerByFold(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer | null {
  const nonFolded = getNonFoldedPlayers(players, round);
  return nonFolded.length === 1 ? nonFolded[0] : null;
}

/**
 * Check if all remaining players are all-in
 */
export function allPlayersAllIn(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getNonFoldedPlayers(players, round);
  if (nonFolded.length <= 1) return false;

  const eligible = getEligiblePlayers(players, round);
  return eligible.length <= 1; // 0 or 1 can act = others all-in
}

// ==================== BLIND POSITIONS ====================

export function getNextDealerSeat(
  players: LobbyPlayer[],
  currentDealerSeat: number
): number {
  const active = players
    .filter(p => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  
  if (active.length === 0) return currentDealerSeat;
  
  const seats = active.map(p => p.seatIndex);
  const idx = seats.indexOf(currentDealerSeat);
  
  if (idx === -1) {
    return seats.find(s => s > currentDealerSeat) || seats[0];
  }
  
  return seats[(idx + 1) % seats.length];
}

export function calculateBlindPositions(
  players: LobbyPlayer[],
  dealerSeat: number
): { dealerSeat: number; sbSeat: number; bbSeat: number } {
  const active = players
    .filter(p => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  
  if (active.length < 2) {
    throw new Error('Need at least 2 players with chips');
  }

  const seats = active.map(p => p.seatIndex);
  let dealerIndex = seats.indexOf(dealerSeat);
  
  if (dealerIndex === -1) dealerIndex = 0;

  const numPlayers = active.length;
  
  if (numPlayers === 2) {
    // Heads-up: dealer = SB, other = BB
    const sbSeat = seats[dealerIndex];
    const bbSeat = seats[(dealerIndex + 1) % numPlayers];
    return { dealerSeat: sbSeat, sbSeat, bbSeat };
  } else {
    // 3+: normal positions
    const sbIndex = (dealerIndex + 1) % numPlayers;
    const bbIndex = (dealerIndex + 2) % numPlayers;
    return {
      dealerSeat: seats[dealerIndex],
      sbSeat: seats[sbIndex],
      bbSeat: seats[bbIndex],
    };
  }
}

export function getFirstToActSeat(
  players: LobbyPlayer[],
  round: GameRound,
  stage: 'preflop' | 'postflop'
): number | null {
  const eligible = getEligiblePlayers(players, round);
  if (eligible.length === 0) return null;

  const nonFolded = getNonFoldedPlayers(players, round);
  const isHeadsUp = nonFolded.length === 2;

  if (stage === 'preflop') {
    if (isHeadsUp) {
      // Heads-up preflop: SB acts first
      const sb = eligible.find(p => p.seatIndex === round.smallBlindSeatIndex);
      if (sb) return sb.seatIndex;
    } else {
      // 3+: after BB
      return findNextEligibleSeat(players, round, round.bigBlindSeatIndex);
    }
  } else {
    // Postflop
    if (isHeadsUp) {
      // Heads-up postflop: BB acts first
      const bb = eligible.find(p => p.seatIndex === round.bigBlindSeatIndex);
      if (bb) return bb.seatIndex;
    }
    return findNextEligibleSeat(players, round, round.dealerSeatIndex);
  }
  
  return eligible[0]?.seatIndex || null;
}

// ==================== POT CALCULATION ====================

export function calculatePots(playerStates: Record<string, PlayerHandState>): Pot[] {
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

    remaining = remaining.map(p => ({
      ...p,
      remaining: p.remaining >= smallest ? p.remaining - smallest : p.remaining,
    }));
  }

  return pots.filter(p => p.amount > 0);
}

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

// ==================== ACTION VALIDATION ====================

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

  // CRITICAL: Cannot act if folded
  if (state.hasFolded) {
    return { valid: false, reason: 'Player has folded' };
  }

  // CRITICAL: Cannot act if all-in
  if (state.isAllIn) {
    return { valid: false, reason: 'Player is all-in' };
  }

  // CRITICAL: Cannot act if no chips
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
      return { valid: true, callAmount: Math.min(callAmount, playerStack) };

    case 'bet':
      if (round.currentBet > 0) {
        return { valid: false, reason: 'Cannot bet - there is already a bet' };
      }
      const minBet = round.minRaise;
      if (amount === undefined || amount < minBet) {
        if (playerStack < minBet) {
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
        return { valid: false, reason: 'Cannot raise - no bet to raise' };
      }
      
      const minRaiseTotal = round.currentBet + minRaiseAmount;
      const amountNeeded = minRaiseTotal - playerCommitted;
      
      if (amount === undefined) {
        return { valid: false, reason: 'Raise amount required', minRaise: minRaiseAmount };
      }

      const raiseAmount = amount - playerCommitted;
      
      if (raiseAmount > playerStack) {
        return { valid: false, reason: 'Not enough chips', maxBet: playerStack + playerCommitted };
      }

      if (amount <= round.currentBet) {
        return { valid: false, reason: 'Raise must be higher than current bet' };
      }

      if (raiseAmount < amountNeeded && raiseAmount < playerStack) {
        return { valid: false, reason: `Minimum raise is to ${minRaiseTotal}`, minRaise: amountNeeded };
      }

      return { valid: true, minRaise: minRaiseAmount };

    case 'allin':
      return { valid: true, maxBet: playerStack };

    default:
      return { valid: false, reason: 'Unknown action' };
  }
}

export function getValidActions(
  player: LobbyPlayer,
  round: GameRound
): { action: PokerAction; minAmount?: number; maxAmount?: number }[] {
  const state = round.playerStates[player.id];
  if (!state || state.hasFolded || state.isAllIn || player.chips <= 0) return [];

  const actions: { action: PokerAction; minAmount?: number; maxAmount?: number }[] = [];
  const callAmount = Math.max(0, round.currentBet - state.committed);
  const playerStack = player.chips;

  actions.push({ action: 'fold' });

  if (callAmount === 0) {
    actions.push({ action: 'check' });
  }

  if (callAmount > 0 && playerStack > 0) {
    actions.push({ action: 'call', minAmount: Math.min(callAmount, playerStack) });
  }

  if (round.currentBet === 0 && playerStack > 0) {
    const minBet = Math.min(round.minRaise, playerStack);
    actions.push({ action: 'bet', minAmount: minBet, maxAmount: playerStack });
  }

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

  if (playerStack > 0) {
    actions.push({ action: 'allin', minAmount: playerStack });
  }

  return actions;
}

// ==================== INITIALIZATION ====================

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

  const sbPlayer = players.find(p => p.seatIndex === round.smallBlindSeatIndex);
  const bbPlayer = players.find(p => p.seatIndex === round.bigBlindSeatIndex);

  if (sbPlayer && playerStates[sbPlayer.id]) {
    const sbAmount = Math.min(smallBlind, sbPlayer.chips);
    playerStates[sbPlayer.id] = {
      ...playerStates[sbPlayer.id],
      committed: sbAmount,
      isAllIn: sbPlayer.chips <= smallBlind,
      hasActedThisRound: false, // SB can still act
    };
    chipDeductions[sbPlayer.id] = sbAmount;
  }

  if (bbPlayer && playerStates[bbPlayer.id]) {
    const bbAmount = Math.min(bigBlind, bbPlayer.chips);
    playerStates[bbPlayer.id] = {
      ...playerStates[bbPlayer.id],
      committed: bbAmount,
      isAllIn: bbPlayer.chips <= bigBlind,
      hasActedThisRound: false, // BB can still act
    };
    chipDeductions[bbPlayer.id] = bbAmount;
  }

  return { playerStates, chipDeductions };
}

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
 * Get next stage - now uses awaiting stages for host-controlled reveal
 */
export function getNextStage(currentStage: string): string {
  // Preflop -> awaiting_flop (host reveals flop)
  // awaiting_flop -> flop (betting)
  // flop -> awaiting_turn (host reveals turn)
  // etc.
  const stageMap: Record<string, string> = {
    'preflop': 'awaiting_flop',
    'awaiting_flop': 'flop',
    'flop': 'awaiting_turn',
    'awaiting_turn': 'turn',
    'turn': 'awaiting_river',
    'awaiting_river': 'river',
    'river': 'showdown',
    'showdown': 'settled',
    'settled': 'settled',
  };
  return stageMap[currentStage] || 'settled';
}

/**
 * Check if stage is an awaiting stage (host needs to reveal cards)
 */
export function isAwaitingStage(stage: string): boolean {
  return stage === 'awaiting_flop' || stage === 'awaiting_turn' || stage === 'awaiting_river';
}

/**
 * Get the number of community cards to reveal for a given awaiting stage
 */
export function getCardsToReveal(stage: string): number {
  if (stage === 'awaiting_flop') return 3;
  if (stage === 'awaiting_turn') return 1;
  if (stage === 'awaiting_river') return 1;
  return 0;
}
