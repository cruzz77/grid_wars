import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { getTiles } from './db.js';
import { initSocket } from './socket.js';

const app = express();
const PORT = process.env.PORT || 5009;

// Enable CORS for API requests
app.use(cors({
  origin: '*', // Allow all origins for dev simplicity
  methods: ['GET', 'POST']
}));

app.use(express.json());

// REST Endpoint: Returns all 2500 tiles
app.get('/api/tiles', (req, res) => {
  try {
    const tiles = getTiles();
    res.json(tiles);
  } catch (error) {
    console.error('REST error in GET /api/tiles:', error);
    res.status(500).json({ error: 'Failed to retrieve tiles from database.' });
  }
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'GridWars Server' });
});

// Create HTTP server wrapping Express app
const httpServer = createServer(app);

// Bind Socket.IO with CORS settings matching Express
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Register real-time Socket event listeners
initSocket(io);

// Start listening
httpServer.listen(PORT, () => {
  console.log(`GridWars server running on http://localhost:${PORT}`);
});
