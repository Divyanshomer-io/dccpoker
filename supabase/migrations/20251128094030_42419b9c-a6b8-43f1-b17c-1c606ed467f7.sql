-- Create game_rounds table to store poker game state
CREATE TABLE public.game_rounds (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  dealer_seat_index INTEGER NOT NULL,
  small_blind_seat_index INTEGER NOT NULL,
  big_blind_seat_index INTEGER NOT NULL,
  current_turn_seat_index INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'preflop',
  pots JSONB NOT NULL DEFAULT '[]'::jsonb,
  community_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_bet INTEGER NOT NULL DEFAULT 0,
  min_raise INTEGER NOT NULL,
  player_bets JSONB NOT NULL DEFAULT '{}'::jsonb,
  folded_players JSONB NOT NULL DEFAULT '[]'::jsonb,
  all_in_players JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_hands JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_stage CHECK (stage IN ('preflop', 'flop', 'turn', 'river', 'showdown', 'settled'))
);

-- Create game_actions table to log all player actions
CREATE TABLE public.game_actions (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  action TEXT NOT NULL,
  amount INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_action CHECK (action IN ('fold', 'check', 'call', 'bet', 'raise', 'allin'))
);

-- Enable RLS
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for game_rounds
CREATE POLICY "Anyone can view game rounds"
ON public.game_rounds FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert game rounds"
ON public.game_rounds FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update game rounds"
ON public.game_rounds FOR UPDATE
USING (true);

-- RLS policies for game_actions
CREATE POLICY "Anyone can view game actions"
ON public.game_actions FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert game actions"
ON public.game_actions FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_actions;