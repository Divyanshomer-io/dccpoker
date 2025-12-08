# 🍀 DCC Poker — Daddy Chill Casino  
A real-time online poker game built with **Next.js**, **TypeScript**, and **custom poker game engine logic**.  
This project includes a lobby system, room creation, game state management, hand evaluation, animations, and multiplayer-ready structure.

---

## 📌 Features
- Multiplayer-ready architecture (Socket layer can be added easily).
- Fully custom **poker engine** (`pokerEngine.ts`).
- Game state managed via a clean React Hook (`usePokerGame.ts`).
- Beautiful UI components for table, cards, controls, and betting actions.
- Modular file structure for easy extension.
- Vercel Analytics integration.

---

## 📁 Project Structure

```
src/
│
├── components/
│   ├── PokerTable.tsx
│   ├── Card.tsx
│   ├── PlayerSeat.tsx
│   ├── ActionButtons.tsx
│   └── Loader.tsx
│
├── hooks/
│   └── usePokerGame.ts
│
├── engine/
│   └── pokerEngine.ts
│
└── pages/
    ├── index.tsx
    └── Lobby.tsx
```

### 🔹 What Each Folder Does

#### **components/**
Contains all UI components including cards, table, player UI, and action buttons.  
These components receive state from your game hook and update based on events.

#### **hooks/usePokerGame.ts**
This hook:
- Initializes a new game
- Manages player actions (fold, call, raise, all-in)
- Deals cards + community cards
- Runs betting rounds
- Syncs with the poker engine
- Updates UI reactively

This is the **core game controller**.

#### **engine/pokerEngine.ts**
This is the **game logic brain**, containing:
- Card deck creation + shuffling  
- Hand strength evaluation  
- Pot settlement  
- Winner calculation  
- Round progress logic  

No UI logic exists here — only pure poker rules.

#### **pages/Lobby.tsx**
The lobby shows:
- Active rooms
- Create / join room UI
- Player entry before the game starts

#### **pages/index.tsx**
Main entry page — loads the poker table.

---

## ⚙️ Vercel Analytics Setup

To enable **Vercel Web Analytics**, install:

```bash
npm install @vercel/analytics
```

### Add analytics entry file:
Create:

```
/src/providers/analytics.tsx
```

```tsx
"use client";
import { Analytics } from "@vercel/analytics/react";

export function VercelAnalytics() {
  return <Analytics />;
}
```

### Add provider to Next.js layout

Open:

```
src/app/layout.tsx
```

Add inside the `<body>`:

```tsx
import { VercelAnalytics } from "@/providers/analytics";

<body>
  <VercelAnalytics />
  {children}
</body>
```

📌 **No other changes or imports are needed.**  
Once deployed on Vercel → Analytics will automatically start showing traffic data.

---

## 🚀 Running the Project
Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Start production build:

```bash
npm start
```

---

## 🧪 Game Flow Overview (Technical)

1. **Lobby.tsx**  
   - Create/join rooms  
   - Navigate to poker table

2. **PokerTable.tsx**  
   - Renders players, cards, actions  
   - Connects to `usePokerGame()` hook

3. **usePokerGame.ts**  
   - Initializes deck & players  
   - Starts pre-flop → flop → turn → river  
   - Tracks current player, pot, bets  
   - Passes data to UI  
   - Calls `pokerEngine.ts` for winner calculation

4. **pokerEngine.ts**  
   - Generates + shuffles deck  
   - Deals cards  
   - Evaluates hands  
   - Determines winners  
   - Handles side pots, all-ins, ties

---

## 🧩 Adding Multiplayer (Optional)
You can extend this easily using:
- Socket.io  
- Vercel WebSockets  
- Supabase Realtime  

Core structure already supports external event syncing.

---

## 🏷 Suggested Name for the Website
### **DCC GambleHub — Daddy Chill Casino**  
(short, branded, sleek)

Other options:
- **DCC Playhouse**
- **DCC PokerZone**
- **DCC Royale**
- **DCC CardVerse**
- **DCC Casino Deck**

---

## 📄 License
Free to modify and extend.

---

## 🤝 Contributions
Feel free to open issues or PRs.

