// Core types for Daddy Chill Casino - Texas Hold'em

export interface User {
  id: string;
  name: string;
  avatar?: string;
  createdAt: Date;
}

export interface BuyingOption {
  id: string;
  lobbyId: string;
  chipsPerBuying: number;
  pricePerBuying: number;
}

export interface Lobby {
  id: string;
  name: string;
  hostUserId: string;
  password: string;
  maxPlayers: number;
  status: 'open' | 'in_game' | 'closed' | 'game_finished';
  currencyCode: string;
  chipUnitValue: number;
  minBlind: number;
  buyingOptions: BuyingOption[];
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface LobbyPlayer {
  id: string;
  lobbyId: string;
  userId: string;
  user: User;
  seatIndex: number;
  chips: number;
  buyingsBought: number;
  isHost: boolean;
  joinedAt: Date;
  active: boolean;
  isConnected: boolean;
  startingChips?: number;
}

export type GameStage = 
  | 'waiting' 
  | 'preflop' 
  | 'awaiting_flop'
  | 'flop' 
  | 'awaiting_turn'
  | 'turn' 
  | 'awaiting_river'
  | 'river' 
  | 'showdown' 
  | 'settled'
  | 'game_finished';

export interface Pot {
  id: string;
  amount: number;
  contributors: string[];
}

export interface PlayerHandState {
  playerId: string;
  committed: number;
  hasFolded: boolean;
  isAllIn: boolean;
  hasActedThisRound: boolean;
  lastAction?: PokerAction;
}

export interface GameRound {
  id: string;
  lobbyId: string;
  roundNumber: number;
  dealerSeatIndex: number;
  smallBlindSeatIndex: number;
  bigBlindSeatIndex: number;
  currentTurnSeatIndex: number;
  stage: GameStage;
  currentBet: number;
  minRaise: number;
  lastRaiseAmount: number;
  pots: Pot[];
  communityCards: string[];
  playerHands?: Record<string, string[]>;
  playerStates: Record<string, PlayerHandState>;
  playerBets: Record<string, number>;
  foldedPlayers: string[];
  allInPlayers: string[];
  bettingRoundStartSeat?: number;
  lastAggressorSeat?: number;
}

export type PokerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface GameAction {
  id: string;
  roundId: string;
  playerId: string;
  action: PokerAction;
  amount?: number;
  totalCommitted?: number;
  timestamp: Date;
}

export interface SettlementEntry {
  playerId: string;
  playerName: string;
  playerAvatar?: string;
  startingChips: number;
  finalChips: number;
  startingMoney: number;
  finalMoney: number;
  netChange: number;
  netChangePercent: number;
}

export interface Transfer {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface Settlement {
  entries: SettlementEntry[];
  transfers: Transfer[];
  chipUnitValue: number;
  currencyCode: string;
}

export interface CreateLobbyForm {
  name: string;
  maxPlayers: number;
  minBlind: number;
  currencyCode: string;
  chipUnitValue: number;
  buyingOptions: {
    chipsPerBuying: number;
    pricePerBuying: number;
  }[];
}

export interface JoinLobbyForm {
  lobbyId: string;
  password: string;
  displayName: string;
}

export const AVATAR_EMOJIS = [
  '😎', '🤠', '🦊', '🐺', '🦁', '🐯', '🐻', '🐼',
  '🦄', '🐉', '🎭', '🎪', '🎰', '🃏', '♠️', '♥️',
  '♦️', '♣️', '👑', '💎', '🔥', '⚡', '🌟', '💰'
];

export interface ActionValidation {
  valid: boolean;
  reason?: string;
  callAmount?: number;
  minBet?: number;
  minRaise?: number;
  maxBet?: number;
}
