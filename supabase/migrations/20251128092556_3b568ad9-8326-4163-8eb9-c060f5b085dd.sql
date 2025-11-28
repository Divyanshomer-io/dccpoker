-- Create lobbies table
CREATE TABLE public.lobbies (
  id TEXT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host_user_id TEXT NOT NULL,
  password VARCHAR(16) NOT NULL,
  max_players INT NOT NULL CHECK (max_players >= 2 AND max_players <= 11),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_game', 'closed')),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'INR',
  chip_unit_value DECIMAL(10,4) NOT NULL,
  min_blind DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Create buying options table
CREATE TABLE public.buying_options (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  chips_per_buying INT NOT NULL,
  price_per_buying DECIMAL(10,2) NOT NULL
);

-- Create lobby players table
CREATE TABLE public.lobby_players (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_avatar VARCHAR(255),
  seat_index INT NOT NULL,
  chips INT NOT NULL DEFAULT 0,
  buyings_bought INT NOT NULL DEFAULT 0,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(lobby_id, user_id),
  UNIQUE(lobby_id, seat_index)
);

-- Enable RLS
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buying_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_players ENABLE ROW LEVEL SECURITY;

-- Lobbies policies - anyone can read open lobbies
CREATE POLICY "Anyone can view open lobbies" ON public.lobbies
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create lobbies" ON public.lobbies
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Host can update their lobby" ON public.lobbies
  FOR UPDATE USING (true);

-- Buying options policies
CREATE POLICY "Anyone can view buying options" ON public.buying_options
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create buying options" ON public.buying_options
  FOR INSERT WITH CHECK (true);

-- Lobby players policies
CREATE POLICY "Anyone can view lobby players" ON public.lobby_players
  FOR SELECT USING (true);

CREATE POLICY "Anyone can join lobby" ON public.lobby_players
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Players can update their own data" ON public.lobby_players
  FOR UPDATE USING (true);

CREATE POLICY "Players can leave lobby" ON public.lobby_players
  FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lobby_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buying_options;