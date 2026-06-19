import { getTiles, captureTile } from './db.js';

// Memory map to track cooldowns per user: { username => timestamp }
const cooldowns = new Map();

/**
 * Initialize Socket.IO event handlers.
 * @param {Server} io - The Socket.IO server instance.
 */
export function initSocket(io) {
  io.on('connection', (socket) => {
    // Get live connection count and broadcast to everyone
    const currentCount = io.engine.clientsCount;
    io.emit('user_count', { count: currentCount });
    console.log(`User connected. Socket ID: ${socket.id}. Live count: ${currentCount}`);

    // Send the current grid state directly on first connect
    try {
      const tiles = getTiles();
      socket.emit('init', tiles);
    } catch (error) {
      console.error(`Failed to send initial board to socket ${socket.id}:`, error);
    }

    // Handle tile capture request from a client
    socket.on('capture_tile', (data) => {
      const { tileId, username, color } = data || {};

      // Validate basic parameters
      if (tileId === undefined || tileId < 0 || tileId >= 2500 || !username || !color) {
        socket.emit('capture_rejected', { tileId, reason: 'invalid_payload' });
        return;
      }

      const now = Date.now();
      const lastCaptureTime = cooldowns.get(username) || 0;

      // 500ms cooldown check
      if (now - lastCaptureTime < 500) {
        socket.emit('capture_rejected', { tileId, reason: 'cooldown' });
        return;
      }

      // Update cooldown timestamp
      cooldowns.set(username, now);

      try {
        // Write transaction to SQLite
        const updatedTile = captureTile(tileId, username, color);

        // Broadcast to ALL sockets
        io.emit('tile_updated', {
          tileId: updatedTile.id,
          owner: updatedTile.owner,
          color: updatedTile.color,
          captured_at: updatedTile.captured_at
        });
      } catch (error) {
        console.error('Error writing tile capture to database:', error);
        socket.emit('capture_rejected', { tileId, reason: 'db_error' });
      }
    });

    // Cleanup cooldowns occasionally to prevent memory leak
    // We remove entries older than 10 seconds periodically
    socket.on('disconnect', () => {
      const newCount = io.engine.clientsCount;
      io.emit('user_count', { count: newCount });
      console.log(`User disconnected. Socket ID: ${socket.id}. Live count: ${newCount}`);
    });
  });

  // Periodically prune cooldowns Map to save memory (every 10 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const [username, lastTime] of cooldowns.entries()) {
      if (now - lastTime > 600000) {
        cooldowns.delete(username);
      }
    }
  }, 600000);
}
