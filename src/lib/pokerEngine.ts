// src/lib/pokerEngine.ts
// Corrected poker / card-game engine utilities
// - No-limit Texas Hold'em style flow adapted for your custom 3-reveal rounds
// - Host-controlled reveal stages: awaiting_flop / awaiting_turn / awaiting_river
// - Robust blind, turn, betting, side-pot, all-in, fold, and showdown helpers

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
 * Active = not folded, not all-in, and marked active (connected) and has chips
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
 * Skips folded and all-in players by relying on getEligiblePlayers.
 */
export function findNextEligibleSeat(
  players: LobbyPlayer[],
  round: GameRound,
  fromSeat: number
): number | null {
  const eligible = getEligiblePlayers(players, round);
  if (eligible.length === 0) return null;
  const seats = eligible.map((p) => p.seatIndex);
  let next = seats.find((s) => s > fromSeat);
  if (next === undefined) next = seats[0];
  return next;
}

// --------------------- ROUND & HAND TERMINATION ---------------------

/**
 * Betting round completes when:
 *  - Only 0-1 non-folded players remain (hand over), OR
 *  - There are no active players (everyone all-in or folded), OR
 *  - Every active player has acted in current cycle AND their committed >= currentBet
 *
 * Note: we rely on hasActedThisRound being reset properly on raises.
 */
export function isBettingRoundComplete(
  players: LobbyPlayer[],
  round: GameRound
): boolean {
  const nonFolded = getNonFoldedPlayers(players, round);
  if (nonFolded.length <= 1) return true;

  const active = getEligiblePlayers(players, round);
  if (active.length === 0) return true; // everyone all-in

  for (const p of active) {
    const st = round.playerStates[p.id];
    if (!st) return false;
    if (!st.hasActedThisRound) return false;
    if (st.committed < round.currentBet) return false; // hasn't matched
  }

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
    return seats.find((s) => s > currentDealerSeat) ?? seats[0];
  }
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
 * First to act seat for the betting round:
 * - Preflop heads-up: SB (dealer) acts first
 * - Preflop multi-player: player after BB acts first
 * - Postflop (flop/turn/river): player after dealer (left of dealer)
 *
 * This provides consistent behavior with standard rules, but you can
 * tweak it to match your "blind acts first each round" custom rule.
 */
export function getFirstToActSeat(
  players: LobbyPlayer[],
  round: GameRound,
  stage: GameRound['stage'] | 'preflop' | 'postflop' = 'preflop'
): number | null {
  const nonFolded = getNonFoldedPlayers(players, round);
  const eligible = getEligiblePlayers(players, round);
  if (eligible.length === 0) return null;

  // Heads-up preflop: dealer (small blind) acts first
  if (stage === 'preflop' && nonFolded.length === 2) {
    const sb = players.find((p) => p.seatIndex === round.smallBlindSeatIndex);
    if (sb && isPlayerActive(sb, round)) return sb.seatIndex;
  }

  if (stage === 'preflop') {
    // Normally, first to act preflop is the player left of BB
    // That is: seat after bigBlindSeatIndex
    return findNextEligibleSeat(players, round, round.bigBlindSeatIndex);
  }

  // Postflop: first to act is player to left of dealer
  return findNextEligibleSeat(players, round, round.dealerSeatIndex ?? round.bigBlindSeatIndex);
}

// --------------------- POT CALCULATION ---------------------

/**
 * Calculate main + side pots from playerStates.committed values.
 * Returns array of pots in order [main, side1, side2...]
 *
 * Each pot: { id, amount, contributors } where contributors are players who
 * are eligible to win that pot (i.e., contributed to it and didn't fold).
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

    // Eligible winners for this pot are those non-zero contributors who did NOT fold
    const eligibleWinners = nonZero.filter((n) => !n.hasFolded).map((n) => n.playerId);

    if (potAmount > 0 && eligibleWinners.length > 0) {
      pots.push({
        id: potIndex === 0 ? 'main' : `side-${potIndex}`,
        amount: potAmount,
        contributors: contributors, // contributors (all who put chips into this pot)
        eligibleWinners, // optional field; your type may not include this - adapt as needed
      } as unknown as Pot);
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
 * Returns a map: playerId -> chips won from this pot.
 */
export function distributePot(
  pot: Pot,
  winnerIds: string[],
  players: LobbyPlayer[],
  dealerSeat: number
): Record<string, number> {
  if (winnerIds.length === 0) return {};
  if (winnerIds.length === 1) return { [winnerIds[0]]: pot.amount };

  // Build mapping of id -> seatIndex
  const seatMap = new Map<string, number>();
  players.forEach((p) => seatMap.set(p.id, p.seatIndex));

  // Create array of winners sorted clockwise from dealer
  const maxSeat = players.reduce((m, p) => Math.max(m, p.seatIndex), 0);
  const clockwiseOrder = [...winnerIds].sort((a, b) => {
    const aSeat = seatMap.get(a) ?? 0;
    const bSeat = seatMap.get(b) ?? 0;
    const distA = (aSeat - dealerSeat + maxSeat + 1) % (maxSeat + 1);
    const distB = (bSeat - dealerSeat + maxSeat + 1) % (maxSeat + 1);
    return distA - distB;
  });

  const share = Math.floor(pot.amount / winnerIds.length);
  const remainder = pot.amount % winnerIds.length;
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
 * Reset hasActedThisRound for all players EXCEPT the raiser (should be called when a full valid raise occurs).
 */
export function resetHasActedAfterRaise(round: GameRound, raiserId: string) {
  for (const [pid, st] of Object.entries(round.playerStates)) {
    if (pid === raiserId) {
      round.playerStates[pid].hasActedThisRound = true; // raiser already acted
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

  if (st.hasFolded) return { valid: false, reason: 'Player has folded' };
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

      // amount here is total committed that player wants after raising
      const totalToCommit = amount;
      const added = totalToCommit - st.committed;
      if (added <= 0) return { valid: false, reason: 'Raise must increase your commitment' };
      if (added > stack) return { valid: false, reason: 'Not enough chips for raise', maxBet: st.committed + stack };

      // Minimum raise rule: raise must increase currentBet by at least minRaiseAmount
      const requiredTotal = round.currentBet + minRaiseAmount;
      const requiredAdded = requiredTotal - st.committed;

      // If player is going all-in with added < requiredAdded, allow it but mark it a partial all-in raise (OK),
      // but subsequent raises must be relative to last full raise.
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
 * Return list of valid actions (for UI) with min/max amounts (amounts are presented as TOTAL commit except call)
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
    // bet: min is round.minRaise, max is full stack (presented as TOTAL commit)
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
 * This function mutates and returns a copy of playerStates and a chipDeductions map (to be applied atomically by caller).
 *
 * VERY IMPORTANT: This function also sets round.currentBet = bigBlindAmount (so preflop can't be checked).
 *
 * smallBlind and bigBlind are integer chip amounts.
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
    // Crucial: initialize currentBet to big blind amount (others must at least call)
    round.currentBet = Math.max(round.currentBet ?? 0, bbAmt);
  }

  return { playerStates: ps, chipDeductions: deductions };
}

/**
 * Reset per-round flags for new betting round. Folded & all-in players are considered acted (skipped).
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
