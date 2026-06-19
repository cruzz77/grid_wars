import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB file in the server directory
const dbPath = path.join(__dirname, 'gridwars.db');
const db = new Database(dbPath);

// Enable WAL mode (Write-Ahead Logging) for performance
db.pragma('journal_mode = WAL');

// Create table schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tiles (
    id INTEGER PRIMARY KEY,
    owner TEXT,
    color TEXT,
    captured_at INTEGER
  );
`);

// Seed 2500 tiles (0 to 2499) if the database is empty
const countRow = db.prepare('SELECT COUNT(*) as count FROM tiles').get();
if (countRow.count === 0) {
  console.log('Seeding 2,500 tiles (0 to 2499)...');
  const insert = db.prepare('INSERT INTO tiles (id, owner, color, captured_at) VALUES (?, NULL, NULL, NULL)');
  
  // Perform seeding inside a transaction for performance
  const seedTransaction = db.transaction(() => {
    for (let i = 0; i < 2500; i++) {
      insert.run(i);
    }
  });
  seedTransaction();
  console.log('Successfully seeded 2,500 tiles.');
}

/**
 * Retrieve all 2500 tiles ordered by ID.
 * @returns {Array} List of all tiles.
 */
export function getTiles() {
  return db.prepare('SELECT * FROM tiles ORDER BY id ASC').all();
}

/**
 * Update the owner and color of a tile.
 * @param {number} tileId - The ID of the tile (0 to 2499).
 * @param {string} username - The visitor's username.
 * @param {string} color - The visitor's hex color.
 * @returns {Object} The updated tile object.
 */
export function captureTile(tileId, username, color) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE tiles SET owner = ?, color = ?, captured_at = ? WHERE id = ?')
    .run(username, color, now, tileId);
  return { id: tileId, owner: username, color, captured_at: now };
}
