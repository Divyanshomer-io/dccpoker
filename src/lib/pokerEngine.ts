// src/lib/pokerEngine.ts
// Corrected poker / card-game engine utilities
// - Custom game flow with host-controlled card reveals
// - Blind acts first each betting round
// - Round ends only when all have acted AND turn returns to blind

import type {
  LobbyPlayer,
  GameRound,
  Pot,
  PlayerHandState,
  PokerAction,
  ActionValidation,
} from '@/types/casino';

// --------------------- CONSTANTS ---------------------

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;

// --------------------- DECK UTILITIES ---------------------

export function createDeck(): string[] {
  const deck: string[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  return deck;
}

export function shuffleDeck(deck: string[]): string[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --------------------- PLAYER STATE CHECKS ---------------------

/**
 * Active = not folded, not all-in, marked active (connected), and has chips
 */
export function isPlayerActive(player: LobbyPlayer, round: GameRound): boolean {
  const st = round.playerStates[player.id];
  if (!st) return false;
  if (st.hasFolded) return false;
  if (st.isAllIn) return false;
  if (!player.active) return false;
  return true;
}

/** Eligible to act (active players who still have chips) */
export function getEligiblePlayers(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer[] {
  return players
    .filter((p) => isPlayerActive(p, round) && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/** Non-folded players (includes all-in and active) */
export function getNonFoldedPlayers(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer[] {
  return players
    .filter((p) => {
      const st = round.playerStates[p.id];
      return !!st && !st.hasFolded && p.active;
    })
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

// --------------------- TURN ADVANCEMENT ---------------------

/**
 * Returns next eligible seat (clockwise) after fromSeat.
 * Skips folded and all-in players.
 */
export function findNextEligibleSeat(
  players: LobbyPlayer[],
  round: GameRound,
  fromSeat: number
): number | null {
  const eligible = getEligiblePlayers(players, round);
  if (eligible.length === 0) return null;
  
  const seats = eligible.map((p) => p.seatIndex).sort((a, b) => a - b);
  
  // Find first seat that is greater than fromSeat (clockwise)
  let next = seats.find((s) => s > fromSeat);
  
  // If none found, wrap around to first seat
  if (next === undefined) {
    next = seats[0];
  }
  
  return next;
}

// --------------------- ROUND & HAND TERMINATION ---------------------

/**
 * CUSTOM GAME RULE: Betting round completes when:
 * 1. Only 0-1 non-folded players remain (hand over), OR
 * 2. There are no active players (everyone all-in or folded), OR
 * 3. BOTH conditions are met:
 *    a) Every active player has hasActedThisRound = true
 *    b) Every active player has committed >= currentBet
 *    c) Current turn has returned to the betting round start seat (blind)
 */
export function isBettingRoundComplete(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getNonFoldedPlayers(players, round);
  
  // Hand is over if only 1 or 0 non-folded players
  if (nonFolded.length <= 1) {
    console.log('[ENGINE] Round complete: 1 or fewer non-folded players');
    return true;
  }

  const active = getEligiblePlayers(players, round);
  
  // All remaining are all-in or folded - no one can act
  if (active.length === 0) {
    console.log('[ENGINE] Round complete: no eligible players (all folded/all-in)');
    return true;
  }

  // Check all active players have acted
  for (const p of active) {
    const st = round.playerStates[p.id];
    if (!st) {
      console.log('[ENGINE] Round NOT complete: missing state for', p.id);
      return false;
    }
    if (!st.hasActedThisRound) {
      console.log('[ENGINE] Round NOT complete: player', p.id, 'has not acted');
      return false;
    }
    if (st.committed < round.currentBet) {
      console.log('[ENGINE] Round NOT complete: player', p.id, 'committed', st.committed, '< currentBet', round.currentBet);
      return false;
    }
  }

  // CRITICAL: Check if turn has returned to the betting round start seat
  // This ensures a full rotation has occurred
  const startSeat = round.bettingRoundStartSeat;
  if (startSeat !== undefined && startSeat !== null) {
    // Find if there's an eligible player at the start seat
    const startPlayer = active.find(p => p.seatIndex === startSeat);
    
    if (startPlayer) {
      // If we're at the start seat and they've acted, round is complete
      if (round.currentTurnSeatIndex === startSeat) {
        const startState = round.playerStates[startPlayer.id];
        if (startState?.hasActedThisRound && startState.committed >= round.currentBet) {
          console.log('[ENGINE] Round complete: full rotation, back at blind seat', startSeat);
          return true;
        }
      }
      
      // Not yet back at start seat
      console.log('[ENGINE] Round NOT complete: waiting for turn to return to blind seat', startSeat, 'current:', round.currentTurnSeatIndex);
      return false;
    }
  }

  // Fallback: if no bettingRoundStartSeat, just check all have acted
  console.log('[ENGINE] Round complete: all active players have acted and matched');
  return true;
}

/** Is the hand over (only one non-folded player) */
export function isGameOver(players: LobbyPlayer[], round: GameRound): boolean {
  return getNonFoldedPlayers(players, round).length <= 1;
}

export const isHandOver = isGameOver;

/** When all others fold, return the winner player object */
export function getWinnerByFold(
  players: LobbyPlayer[],
  round: GameRound
): LobbyPlayer | null {
  const nonFolded = getNonFoldedPlayers(players, round);
  return nonFolded.length === 1 ? nonFolded[0] : null;
}

/** Are all remaining players all-in (no one can act) */
export function allPlayersAllIn(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const eligible = getEligiblePlayers(players, round);
  return eligible.length === 0;
}

// --------------------- BLIND/DEALER POSITIONS ---------------------

/**
 * Next dealer seat clockwise among active players
 */
export function getNextDealerSeat(
  players: LobbyPlayer[],
  currentDealerSeat: number
): number {
  const active = players
    .filter((p) => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  if (active.length === 0) return currentDealerSeat;
  
  const seats = active.map((p) => p.seatIndex);
  const idx = seats.indexOf(currentDealerSeat);
  
  if (idx === -1) {
    // Current dealer not in active list, find next valid
    return seats.find((s) => s > currentDealerSeat) ?? seats[0];
  }
  
  // Move to next seat clockwise
  return seats[(idx + 1) % seats.length];
}

/**
 * Calculate SB and BB seats given dealer seat.
 * Heads-up rule: dealer is SB preflop (acts first preflop).
 */
export function calculateBlindPositions(
  players: LobbyPlayer[],
  dealerSeat: number
): { dealerSeat: number; sbSeat: number; bbSeat: number } {
  const active = players
    .filter((p) => p.active && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  if (active.length < 2) throw new Error('Need at least 2 players with chips');
  
  const seats = active.map((p) => p.seatIndex);
  let di = seats.indexOf(dealerSeat);
  if (di === -1) di = 0;
  
  if (seats.length === 2) {
    // Heads-up: dealer = SB, other = BB
    const sbSeat = seats[di];
    const bbSeat = seats[(di + 1) % 2];
    return { dealerSeat: sbSeat, sbSeat, bbSeat };
  } else {
    const sbSeat = seats[(di + 1) % seats.length];
    const bbSeat = seats[(di + 2) % seats.length];
    return { dealerSeat: seats[di], sbSeat, bbSeat };
  }
}

/**
 * CUSTOM GAME RULE: First to act is ALWAYS the blind (BB) for this custom game.
 * For preflop in multi-player, normally it's the player after BB, but in this
 * custom game, the blind (BB) acts first every round.
 * 
 * Set stage to 'preflop' for preflop or 'postflop' for flop/turn/river.
 */
export function getFirstToActSeat(
  players: LobbyPlayer[],
  round: GameRound,
  stage: GameRound['stage'] | 'preflop' | 'postflop' = 'preflop'
): number | null {
  const eligible = getEligiblePlayers(players, round);
  if (eligible.length === 0) return null;
  
  // CUSTOM GAME: Blind (BB) acts first each round
  // For preflop, use player after BB (standard poker)
  // For postflop, return BB seat
  
  if (stage === 'preflop') {
    const nonFolded = getNonFoldedPlayers(players, round);
    
    // Heads-up preflop: SB (dealer) acts first
    if (nonFolded.length === 2) {
      const sb = players.find((p) => p.seatIndex === round.smallBlindSeatIndex);
      if (sb && isPlayerActive(sb, round)) return sb.seatIndex;
    }
    
    // Multi-player preflop: player after BB acts first
    return findNextEligibleSeat(players, round, round.bigBlindSeatIndex);
  }
  
  // Postflop: In this custom game, blind (BB) acts first
  // But if BB is folded/all-in, find next eligible after dealer
  const bbPlayer = players.find(p => p.seatIndex === round.bigBlindSeatIndex);
  if (bbPlayer && isPlayerActive(bbPlayer, round)) {
    return round.bigBlindSeatIndex;
  }
  
  // BB is not active, find first eligible player after dealer (clockwise)
  return findNextEligibleSeat(players, round, round.dealerSeatIndex ?? round.bigBlindSeatIndex);
}

// --------------------- POT CALCULATION ---------------------

/**
 * Calculate main + side pots from playerStates.committed values.
 * Returns array of pots in order [main, side1, side2...]
 *
 * Each pot: { id, amount, contributors } where contributors are players who
 * put chips into that pot (whether folded or not - folded players just can't WIN).
 */
export function calculatePots(playerStates: Record<string, PlayerHandState>): Pot[] {
  // Build array of players with committed > 0
  const arr = Object.entries(playerStates)
    .map(([playerId, st]) => ({ playerId, committed: st.committed, hasFolded: st.hasFolded }))
    .filter((x) => x.committed > 0)
    .sort((a, b) => a.committed - b.committed);

  if (arr.length === 0) return [];

  const pots: Pot[] = [];
  let remaining = arr.map((p) => ({ ...p, remaining: p.committed }));
  let potIndex = 0;

  while (remaining.some((r) => r.remaining > 0)) {
    const nonZero = remaining.filter((r) => r.remaining > 0);
    const smallest = Math.min(...nonZero.map((n) => n.remaining));
    const contributors = nonZero.map((n) => n.playerId);
    const potAmount = smallest * nonZero.length;

    if (potAmount > 0) {
      pots.push({
        id: potIndex === 0 ? 'main' : `side-${potIndex}`,
        amount: potAmount,
        contributors: contributors,
      });
      potIndex++;
    }

    // Subtract smallest from each remaining contributor
    remaining = remaining.map((r) => ({
      ...r,
      remaining: Math.max(0, r.remaining - smallest),
    }));
  }

  return pots.filter((p) => p.amount > 0);
}

/**
 * Distribute a single pot to winnerIds array (tie split supported).
 * Deterministic remainder distribution uses clockwise seat order starting after dealerSeat.
 *
 * IMPORTANT: Winners must be non-folded, but we DON'T require them to be contributors
 * to the specific pot for the main pot. For side pots, the host selects from eligible.
 *
 * Returns a map: playerId -> chips won from this pot.
 */
export function distributePot(
  pot: Pot,
  winnerIds: string[],
  players: LobbyPlayer[],
  dealerSeat: number,
  playerStates?: Record<string, PlayerHandState>
): Record<string, number> {
  if (winnerIds.length === 0) return {};
  
  // Filter out folded players from winners
  let validWinners = winnerIds;
  if (playerStates) {
    validWinners = winnerIds.filter(id => {
      const state = playerStates[id];
      return state && !state.hasFolded;
    });
  }
  
  if (validWinners.length === 0) {
    // All selected winners have folded - this shouldn't happen but fallback
    console.warn('[ENGINE] All selected winners have folded, using original selection');
    validWinners = winnerIds;
  }
  
  if (validWinners.length === 1) {
    return { [validWinners[0]]: pot.amount };
  }

  // Build mapping of id -> seatIndex
  const seatMap = new Map<string, number>();
  players.forEach((p) => seatMap.set(p.id, p.seatIndex));

  // Create array of winners sorted clockwise from dealer
  const maxSeat = players.reduce((m, p) => Math.max(m, p.seatIndex), 0);
  const clockwiseOrder = [...validWinners].sort((a, b) => {
    const aSeat = seatMap.get(a) ?? 0;
    const bSeat = seatMap.get(b) ?? 0;
    const distA = (aSeat - dealerSeat + maxSeat + 1) % (maxSeat + 1);
    const distB = (bSeat - dealerSeat + maxSeat + 1) % (maxSeat + 1);
    return distA - distB;
  });

  const share = Math.floor(pot.amount / validWinners.length);
  const remainder = pot.amount % validWinners.length;
  const dist: Record<string, number> = {};
  
  clockwiseOrder.forEach((id, i) => {
    dist[id] = share + (i < remainder ? 1 : 0);
  });
  
  return dist;
}

// --------------------- ACTION VALIDATION & HELPERS ---------------------

/**
 * Helper: compute call amount (how much more this player must put to match currentBet)
 */
export function computeCallAmount(state: PlayerHandState, round: GameRound): number {
  return Math.max(0, round.currentBet - (state?.committed ?? 0));
}

/**
 * Reset hasActedThisRound for all players EXCEPT the raiser.
 * Folded/all-in players always have hasActedThisRound = true.
 */
export function resetHasActedAfterRaise(round: GameRound, raiserId: string) {
  for (const [pid, st] of Object.entries(round.playerStates)) {
    if (pid === raiserId) {
      round.playerStates[pid].hasActedThisRound = true;
    } else {
      // folded/all-in players should be considered 'acted' so they're skipped
      round.playerStates[pid].hasActedThisRound = st.hasFolded || st.isAllIn ? true : false;
    }
  }
}

/**
 * Validate action. NOTE: `amount` parameter is interpreted as TOTAL desired commit for raise/bet
 * (i.e., player's new committed amount), to avoid unit confusion.
 */
export function validateAction(
  player: LobbyPlayer,
  round: GameRound,
  action: PokerAction,
  amount?: number
): ActionValidation {
  const st = round.playerStates[player.id];
  if (!st) return { valid: false, reason: 'Player not present in round' };

  // CRITICAL: Folded players cannot act
  if (st.hasFolded) return { valid: false, reason: 'Player has folded' };
  
  // CRITICAL: All-in players cannot act
  if (st.isAllIn) return { valid: false, reason: 'Player is all-in' };
  
  if (player.chips <= 0) return { valid: false, reason: 'No chips' };

  const callAmount = computeCallAmount(st, round);
  const stack = player.chips;
  const minRaiseAmount = round.lastRaiseAmount && round.lastRaiseAmount > 0 ? round.lastRaiseAmount : round.minRaise;

  switch (action) {
    case 'fold':
      return { valid: true, callAmount };

    case 'check':
      if (callAmount > 0) return { valid: false, reason: 'Cannot check - must call or fold', callAmount };
      return { valid: true, callAmount: 0 };

    case 'call':
      if (callAmount === 0) return { valid: false, reason: 'Nothing to call - use check' };
      if (callAmount >= stack) {
        // call -> all-in
        return { valid: true, callAmount: stack };
      }
      return { valid: true, callAmount };

    case 'bet':
      if (round.currentBet > 0) return { valid: false, reason: 'Cannot bet - bet already exists' };
      if (amount === undefined) return { valid: false, reason: 'Bet amount required', minBet: round.minRaise };
      if (amount < round.minRaise) {
        if (stack <= round.minRaise) {
          // short-stack can bet all-in < minRaise
          return { valid: true, minBet: stack, maxBet: stack };
        }
        return { valid: false, reason: `Minimum bet is ${round.minRaise}`, minBet: round.minRaise, maxBet: stack };
      }
      if (amount > stack) return { valid: false, reason: 'Not enough chips', maxBet: stack };
      return { valid: true, minBet: round.minRaise, maxBet: stack };

    case 'raise':
      if (round.currentBet === 0) return { valid: false, reason: 'No bet to raise' };
      if (amount === undefined) return { valid: false, reason: 'Total commit amount required for raise' };

      const totalToCommit = amount;
      const added = totalToCommit - st.committed;
      if (added <= 0) return { valid: false, reason: 'Raise must increase your commitment' };
      if (added > stack) return { valid: false, reason: 'Not enough chips for raise', maxBet: st.committed + stack };

      // Minimum raise rule: raise must increase currentBet by at least minRaiseAmount
      const requiredTotal = round.currentBet + minRaiseAmount;
      const requiredAdded = requiredTotal - st.committed;

      // If player is going all-in with added < requiredAdded, allow it
      const isAllIn = added >= stack;
      if (!isAllIn && added < requiredAdded) {
        return { valid: false, reason: `Minimum raise is total to ${requiredTotal}`, minRaise: requiredAdded };
      }

      return { valid: true, minRaise: minRaiseAmount, callAmount: Math.max(0, round.currentBet - st.committed) };

    case 'allin':
      // all-in as an action - allowed always (stack > 0 checked earlier)
      return { valid: true, maxBet: player.chips };

    default:
      return { valid: false, reason: 'Unknown action' };
  }
}

/**
 * Return list of valid actions (for UI) with min/max amounts
 */
export function getValidActions(
  player: LobbyPlayer,
  round: GameRound
): { action: PokerAction; minAmount?: number; maxAmount?: number }[] {
  const st = round.playerStates[player.id];
  if (!st || st.hasFolded || st.isAllIn || player.chips <= 0) return [];
  
  const out: { action: PokerAction; minAmount?: number; maxAmount?: number }[] = [];

  const callAmount = computeCallAmount(st, round);
  const stack = player.chips;
  out.push({ action: 'fold' });

  if (callAmount === 0) {
    out.push({ action: 'check' });
  } else {
    out.push({ action: 'call', minAmount: Math.min(callAmount, stack), maxAmount: Math.min(callAmount, stack) });
  }

  if (round.currentBet === 0 && stack > 0) {
    // bet: min is round.minRaise, max is full stack
    out.push({ action: 'bet', minAmount: Math.min(round.minRaise, stack), maxAmount: stack });
  }

  // raise: compute required minimum total commit
  if (round.currentBet > 0) {
    const minRaiseAmt = (round.lastRaiseAmount && round.lastRaiseAmount > 0 ? round.lastRaiseAmount : round.minRaise);
    const requiredTotal = round.currentBet + minRaiseAmt;
    const raiseNeeded = requiredTotal - st.committed;
    if (stack >= raiseNeeded) {
      out.push({ action: 'raise', minAmount: Math.min(requiredTotal, st.committed + stack), maxAmount: st.committed + stack });
    }
  }

  // all-in
  if (stack > 0) out.push({ action: 'allin', minAmount: stack, maxAmount: stack });

  return out;
}

// --------------------- INITIALIZATION & BLINDS ---------------------

export function initializePlayerStates(players: LobbyPlayer[]): Record<string, PlayerHandState> {
  const states: Record<string, PlayerHandState> = {};
  for (const p of players) {
    states[p.id] = {
      playerId: p.id,
      committed: 0,
      hasFolded: false,
      isAllIn: false,
      hasActedThisRound: false,
    } as PlayerHandState;
  }
  return states;
}

/**
 * Post blinds and deduct chips from players' stacks.
 * Sets round.currentBet to bigBlind amount.
 */
export function postBlinds(
  players: LobbyPlayer[],
  round: GameRound,
  smallBlind: number,
  bigBlind: number
): { playerStates: Record<string, PlayerHandState>; chipDeductions: Record<string, number> } {
  const ps = { ...round.playerStates };
  const deductions: Record<string, number> = {};

  const sbPlayer = players.find((p) => p.seatIndex === round.smallBlindSeatIndex);
  const bbPlayer = players.find((p) => p.seatIndex === round.bigBlindSeatIndex);

  if (sbPlayer && ps[sbPlayer.id]) {
    const sbAmt = Math.min(smallBlind, sbPlayer.chips);
    ps[sbPlayer.id] = {
      ...ps[sbPlayer.id],
      committed: (ps[sbPlayer.id].committed ?? 0) + sbAmt,
      isAllIn: sbPlayer.chips <= sbAmt,
      hasActedThisRound: false,
    };
    deductions[sbPlayer.id] = (deductions[sbPlayer.id] ?? 0) + sbAmt;
  }

  if (bbPlayer && ps[bbPlayer.id]) {
    const bbAmt = Math.min(bigBlind, bbPlayer.chips);
    ps[bbPlayer.id] = {
      ...ps[bbPlayer.id],
      committed: (ps[bbPlayer.id].committed ?? 0) + bbAmt,
      isAllIn: bbPlayer.chips <= bbAmt,
      hasActedThisRound: false,
    };
    deductions[bbPlayer.id] = (deductions[bbPlayer.id] ?? 0) + bbAmt;
    // Crucial: initialize currentBet to big blind amount
    round.currentBet = Math.max(round.currentBet ?? 0, bbAmt);
  }

  return { playerStates: ps, chipDeductions: deductions };
}

/**
 * Reset per-round flags for new betting round. 
 * Folded & all-in players are considered acted (skipped).
 * Does NOT zero committed (committed persists across the hand).
 */
export function resetForNewBettingRound(playerStates: Record<string, PlayerHandState>): Record<string, PlayerHandState> {
  const next: Record<string, PlayerHandState> = {};
  for (const [pid, st] of Object.entries(playerStates)) {
    next[pid] = {
      ...st,
      hasActedThisRound: st.hasFolded || st.isAllIn ? true : false,
    };
  }
  return next;
}

// --------------------- GAME STAGE MANAGEMENT ---------------------

export function getRevealRoundNumber(stage: string): number {
  if (stage === 'preflop' || stage === 'awaiting_flop') return 0;
  if (stage === 'flop' || stage === 'awaiting_turn') return 1;
  if (stage === 'turn' || stage === 'awaiting_river') return 2;
  if (stage === 'river' || stage === 'showdown' || stage === 'settled') return 3;
  return 0;
}

// Next stage mapping with awaiting stages for host-controlled reveal
export function getNextStage(currentStage: string): string {
  const map: Record<string, string> = {
    preflop: 'awaiting_flop',
    awaiting_flop: 'flop',
    flop: 'awaiting_turn',
    awaiting_turn: 'turn',
    turn: 'awaiting_river',
    awaiting_river: 'river',
    river: 'showdown',
    showdown: 'settled',
    settled: 'settled',
    game_finished: 'game_finished',
  };
  return map[currentStage] ?? 'settled';
}

export function isAwaitingStage(stage: string): boolean {
  return ['awaiting_flop', 'awaiting_turn', 'awaiting_river'].includes(stage);
}

export function getCardsToReveal(stage: string): number {
  if (stage === 'awaiting_flop') return 3;
  if (stage === 'awaiting_turn') return 1;
  if (stage === 'awaiting_river') return 1;
  return 0;
}

export function shouldGameEndAfterReveal(stage: string): boolean {
  return stage === 'showdown';
}

export function getNextBlindSeat(players: LobbyPlayer[], currentBlindSeat: number): number {
  const active = players.filter((p) => p.active && p.chips > 0).sort((a, b) => a.seatIndex - b.seatIndex);
  if (active.length === 0) return currentBlindSeat;
  
  const seats = active.map((p) => p.seatIndex);
  const idx = seats.indexOf(currentBlindSeat);
  
  return idx === -1 ? (seats.find((s) => s > currentBlindSeat) ?? seats[0]) : seats[(idx + 1) % seats.length];
}

// --------------------- UTILITY / DEBUG ---------------------

/** Simple safe copy helper for PlayerHandState map */
export function clonePlayerStates(src: Record<string, PlayerHandState>): Record<string, PlayerHandState> {
  const out: Record<string, PlayerHandState> = {};
  for (const [k, v] of Object.entries(src)) out[k] = { ...(v as any) };
  return out;
}

/**
 * Get the seat that should start the betting round (for rotation tracking)
 */
export function getBettingRoundStartSeat(
  players: LobbyPlayer[],
  round: GameRound,
  stage: 'preflop' | 'postflop'
): number | null {
  return getFirstToActSeat(players, round, stage);
}
