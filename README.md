# GridWars ⚔️

GridWars is a real-time, shared territorial multiplayer pixel/tile grid game. Any visitor can click one of the 2,500 tiles (50×50 grid) to claim it for their faction. All connected users witness claims happen in real time.

---

## 🏗️ Tech Stack
- **Frontend**: React (Vite) + Plain CSS (custom dark gaming theme, animations)
- **Backend**: Node.js + Express
- **Real-Time Synchronizer**: Socket.IO (WebSockets)
- **Database**: SQLite (via `better-sqlite3` — zero setup, file-based, synchronous)

---

## 🧠 Architecture Decisions

### 1. Why SQLite (`better-sqlite3`)?
For a hackathon-grade prototype or rapid development, SQLite is perfect because it requires **zero installation** or administrative overhead. The `better-sqlite3` driver is a synchronous interface for Node.js. 

By executing updates synchronously, SQLite acts as a single-threaded queue for database writes. This naturally solves race conditions and conflicts without needing complex transactions or locks in Node.js.

### 2. Why Socket.IO?
Socket.IO wraps WebSockets with built-in reconnection management, heartbeat checks, automatic network fallback mechanisms (e.g. HTTP long polling), and room partitioning. This ensures that users on mobile or unstable networks remain connected and synchronized.

### 3. Conflict Resolution
We implement a **Last Write Wins** strategy. Given that database writes in `better-sqlite3` are synchronous and extremely fast, the order of execution is guaranteed at the database file lock level. At a massive production scale, you would migrate this write-buffer to a **Redis cluster** running custom Lua scripts or a message queue (like RabbitMQ) to serialize writes.

### 4. Optimistic UI
Capturing territory feels instant because the client updates the tile color immediately before waiting for the server's database write. 
- If the server accepts the capture, the client confirms the write.
- If the server rejects the capture (e.g., due to the **500ms capture cooldown** per username), the client receives a `capture_rejected` event, reverts the tile to its previous state, flashes the tile red, and shows a custom toast: `Slow down! ⏱`.

### 5. Scaling Path
To scale GridWars horizontally to handle millions of active players:
1. **Database**: Swap SQLite with a dedicated Postgres database or a memory-cache layer like Redis.
2. **WebSocket Synchronization**: Add a Redis adapter (`@socket.io/redis-adapter`) to Socket.IO. This allows multiple Node.js server instances to communicate and broadcast events across the entire cluster.
3. **Write Path**: Implement a queueing system or pipeline writes through Redis in-memory counts before committing to a persistent database in batches.

---

## 🚀 Running the App Locally

You can run the full-stack app using one of two methods:

### Method 1: Concurrent Dev Server (Recommended)
You can start both the client and server concurrently using a root-level script. 

First, initialize the root configuration:
1. Ensure Node.js (v18+) is installed.
2. Install dependencies and run in the workspace root:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Start backend (Port 5000) and frontend (Port 5173) in separate terminals
```

Alternatively, you can run them using these commands:

#### Start the Server:
```bash
cd server
npm run dev
```

#### Start the Client:
```bash
cd client
npm run dev
```

Once started, open [http://localhost:5173](http://localhost:5173) in your browser. Open multiple windows to see captures sync instantly!

---

## 📁 Project Structure

```
/client                 ← React frontend (Vite)
  ├── src/
  │    ├── App.jsx      ← Core Game Loop & Socket event routing
  │    ├── App.css      ← Placeholder (all styles in index)
  │    ├── index.css    ← UI Theme, layouts, animations, tooltips
  │    └── main.jsx     ← React bootstrapper
  └── vite.config.js    ← Local port forwarding rules
/server                 ← Node + Express backend
  ├── db.js             ← Seeding & better-sqlite3 handlers
  ├── socket.js         ← Cooldown validator & broadcast emitters
  └── server.js         ← API endpoints & HTTP servers
```
