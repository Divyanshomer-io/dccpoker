// Core types for Daddy Chill Casino

export interface User {
  id: string;
  name: string;
  avatar?: string; // emoji or image url
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
  status: 'open' | 'in_game' | 'closed';
  currencyCode: string;
  chipUnitValue: number; // value of 1 chip in currency
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
}

export type GameStage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'settled';

export interface Pot {
  id: string;
  amount: number;
  contributors: string[]; // player ids
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
  pots: Pot[];
  communityCards: string[];
  currentBet: number;
  minRaise: number;
  playerBets: Record<string, number>; // playerId -> bet amount this round
  foldedPlayers: string[];
  allInPlayers: string[];
}

export type PokerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface GameAction {
  playerId: string;
  action: PokerAction;
  amount?: number;
  timestamp: Date;
}

export interface SettlementEntry {
  playerId: string;
  playerName: string;
  finalChips: number;
  initialInvested: number;
  rupeeEquivalent: number;
  netChange: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface Settlement {
  entries: SettlementEntry[];
  transfers: Transfer[];
}

// Form types
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

// Avatar emoji options
export const AVATAR_EMOJIS = [
  '😎', '🤠', '🦊', '🐺', '🦁', '🐯', '🐻', '🐼',
  '🦄', '🐉', '🎭', '🎪', '🎰', '🃏', '♠️', '♥️',
  '♦️', '♣️', '👑', '💎', '🔥', '⚡', '🌟', '💰'
];
