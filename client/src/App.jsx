import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Determine Socket server URL based on the environment
const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001' 
  : 'https://grid-wars-g0yi.onrender.com';

// Helper: Convert HSL to Hex format (ensures predictable contrast/brightness)
function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Helper: Formats unix timestamp to "time ago" string
function formatTimeAgo(unixTimestamp) {
  if (!unixTimestamp) return '';
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function App() {
  // Tile board: 2500 entries
  const [tiles, setTiles] = useState(() => 
    Array.from({ length: 2500 }, (_, i) => ({
      id: i,
      owner: null,
      color: null,
      captured_at: null
    }))
  );

  // User state
  const [user, setUser] = useState({ username: '', color: '' });
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Live indicators
  const [onlineCount, setOnlineCount] = useState(1);
  const [activityFeed, setActivityFeed] = useState([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [bounceCount, setBounceCount] = useState(false);
  const [timeTick, setTimeTick] = useState(0); // Forces re-render of timestamp strings

  // Refs for tracking socket connection and pending optimistic transactions
  const socketRef = useRef(null);
  const pendingCaptures = useRef({});
  const lastClickTime = useRef(0);

  // 1. Initial local storage load and user registration
  useEffect(() => {
    const stored = localStorage.getItem('gridwars_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.username && parsed.color) {
          setUser(parsed);
          return;
        }
      } catch (e) {
        console.error('Error parsing stored user data', e);
      }
    }

    // Generate random credentials if not found
    const randId = Math.floor(1000 + Math.random() * 9000);
    const generatedUsername = `User#${randId}`;
    const randHue = Math.floor(Math.random() * 360);
    // Use fixed saturation 85%, lightness 60% for a premium vibrant game look
    const generatedColor = hslToHex(randHue, 85, 60);
    
    const newUser = { username: generatedUsername, color: generatedColor };
    setUser(newUser);
    setShowOnboarding(true);
  }, []);

  // 2. Establish Socket connection and listen for server events
  useEffect(() => {
    // Open Socket.IO connection
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // A. Received full board init state
    socket.on('init', (serverTiles) => {
      setTiles(serverTiles);

      // Populate initial activity feed with recent captures (non-null tiles)
      const capturedTiles = serverTiles
        .filter(t => t.owner && t.captured_at)
        .sort((a, b) => b.captured_at - a.captured_at)
        .slice(0, 20);

      setActivityFeed(capturedTiles);
    });

    // B. Online user count update
    socket.on('user_count', ({ count }) => {
      setOnlineCount(count);
      setBounceCount(true);
    });

    // C. Single tile update (broadcasted by server)
    socket.on('tile_updated', ({ tileId, owner, color, captured_at }) => {
      // Clear from pending optimistic captures since it's confirmed
      delete pendingCaptures.current[tileId];

      setTiles(prev => {
        const next = [...prev];
        if (next[tileId]) {
          const isOwnUpdate = owner === user.username;
          next[tileId] = {
            id: tileId,
            owner,
            color,
            captured_at,
            pulse: !isOwnUpdate, // Only pulse visual effect if captured by another user
            flashRed: false
          };
        }
        return next;
      });

      // Clear pulse animation class after 500ms
      setTimeout(() => {
        setTiles(prev => {
          const next = [...prev];
          if (next[tileId]) {
            next[tileId].pulse = false;
          }
          return next;
        });
      }, 500);

      // Append to live activity feed (slide-in)
      if (owner) {
        setActivityFeed(prev => {
          const fresh = [{ tileId, owner, color, captured_at }, ...prev];
          return fresh.slice(0, 20);
        });
      }
    });

    // D. Capture rejected (usually due to 500ms cooldown)
    socket.on('capture_rejected', ({ tileId, reason }) => {
      if (reason === 'cooldown') {
        // Render cooldown toast for 1.5 seconds
        setToast({ message: 'Slow down! ⏱', visible: true });
        
        // Revert the optimistic change and trigger flash red animation
        setTiles(prev => {
          const next = [...prev];
          const original = pendingCaptures.current[tileId];
          if (original && next[tileId]) {
            next[tileId] = {
              ...original,
              flashRed: true
            };
          }
          return next;
        });

        // Reset the red flash styling after animation ends
        setTimeout(() => {
          setTiles(prev => {
            const next = [...prev];
            if (next[tileId]) {
              next[tileId].flashRed = false;
            }
            return next;
          });
        }, 600);
      }
      
      // Cleanup pending cache
      delete pendingCaptures.current[tileId];
    });

    return () => {
      socket.disconnect();
    };
  }, [user.username]);

  // 3. Clear bounceCount state class after animation finishes
  useEffect(() => {
    if (bounceCount) {
      const timer = setTimeout(() => setBounceCount(false), 300);
      return () => clearTimeout(timer);
    }
  }, [bounceCount]);

  // 4. Set interval ticker to dynamically refresh "time ago" captions
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeTick(t => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // 5. Save onboarding user configurations
  const handleStartGame = () => {
    localStorage.setItem('gridwars_user', JSON.stringify(user));
    setShowOnboarding(false);
  };

  // 6. Grid interaction handler
  const handleTileClick = (tileId) => {
    const socket = socketRef.current;
    if (!socket || showOnboarding) return;

    // Quick client-side debounce (200ms) to filter accidental double clicks
    const now = Date.now();
    if (now - lastClickTime.current < 200) return;
    lastClickTime.current = now;

    // Cache the original tile state for potential rollback
    const originalTile = tiles[tileId];
    pendingCaptures.current[tileId] = originalTile;

    // Optimistic UI update: color the clicked tile immediately
    setTiles(prev => {
      const next = [...prev];
      if (next[tileId]) {
        next[tileId] = {
          ...next[tileId],
          owner: user.username,
          color: user.color,
          captured_at: Math.floor(Date.now() / 1000),
          pulse: false,
          flashRed: false
        };
      }
      return next;
    });

    // Send capture command
    socket.emit('capture_tile', {
      tileId,
      username: user.username,
      color: user.color
    });
  };

  // 7. Calculate real-time leaderboard statistics from current tile states
  const getLeaderboard = () => {
    const ownerCounts = {};
    tiles.forEach(tile => {
      if (tile.owner) {
        if (!ownerCounts[tile.owner]) {
          ownerCounts[tile.owner] = { count: 0, color: tile.color };
        }
        ownerCounts[tile.owner].count += 1;
      }
    });

    return Object.entries(ownerCounts)
      .map(([username, data]) => ({
        username,
        count: data.count,
        color: data.color
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const leaderboard = getLeaderboard();
  const maxLeaderboardCount = leaderboard.length > 0 ? leaderboard[0].count : 1;

  return (
    <div className="app-container">
      {/* Fixed Header */}
      <header className="header-bar">
        <div className="logo-section">
          <div className="logo-icon" />
          <h1 className="logo-text">GRID<span>WARS</span></h1>
        </div>

        <div className="online-users-badge">
          <div className="online-dot" />
          <span>Online: </span>
          <span className={`online-count ${bounceCount ? 'bounce' : ''}`}>
            {onlineCount}
          </span>
        </div>

        {user.username && (
          <div 
            className="user-profile-badge" 
            style={{ 
              backgroundColor: `${user.color}26`, // 15% opacity hex
              borderColor: `${user.color}40`
            }}
          >
            <div className="user-color-dot" style={{ color: user.color, backgroundColor: user.color }} />
            <span>{user.username}</span>
          </div>
        )}
      </header>

      {/* Main Grid + Sidebar Layout */}
      <main className="main-layout">
        <div className="grid-wrapper">
          <div className="grid-board">
            {tiles.map((tile) => {
              // Construct element classes
              const classes = [
                'tile',
                tile.owner ? 'claimed' : 'unclaimed',
                tile.pulse ? 'just-captured' : '',
                tile.flashRed ? 'flash-red' : '',
                // Stagger fade-in on first load
                activityFeed.length === 0 ? 'tile-stagger-in' : ''
              ].filter(Boolean).join(' ');

              return (
                <div
                  key={tile.id}
                  className={classes}
                  onClick={() => handleTileClick(tile.id)}
                  style={{
                    backgroundColor: tile.color || 'var(--tile-unclaimed)',
                    animationDelay: activityFeed.length === 0 ? `${(tile.id % 15) * 20}ms` : '0ms'
                  }}
                >
                  {/* CSS Tooltip */}
                  <div className="tile-tooltip">
                    #{tile.id.toString().padStart(4, '0')} · {tile.owner || 'Unclaimed'} 
                    {tile.captured_at ? ` · ${formatTimeAgo(tile.captured_at)}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="sidebar">
          {/* Section 1: Live Feed */}
          <section className="sidebar-section activity-feed-section">
            <h2 className="section-title">Live Activity</h2>
            <div className="activity-feed">
              {activityFeed.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
                  No activity yet. Click a tile to capture!
                </div>
              ) : (
                activityFeed.map((item, idx) => (
                  <div className="feed-item" key={`${item.tileId}-${item.captured_at}-${idx}`}>
                    <div className="feed-dot" style={{ backgroundColor: item.color }} />
                    <div className="feed-text">
                      <strong>{item.owner}</strong> captured #{item.tileId.toString().padStart(4, '0')}
                    </div>
                    <div className="feed-time">
                      {formatTimeAgo(item.captured_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Section 2: Leaderboard */}
          <section className="sidebar-section">
            <h2 className="section-title">Top Factions</h2>
            <div className="leaderboard-list">
              {leaderboard.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
                  Grid is empty.
                </div>
              ) : (
                leaderboard.map((player) => {
                  const percentWidth = (player.count / maxLeaderboardCount) * 100;
                  return (
                    <div className="leaderboard-item" key={player.username}>
                      <div className="leaderboard-info">
                        <div className="leaderboard-name">
                          <div 
                            className="user-color-dot" 
                            style={{ 
                              color: player.color, 
                              backgroundColor: player.color,
                              width: '8px',
                              height: '8px'
                            }} 
                          />
                          <span>{player.username}</span>
                        </div>
                        <span className="leaderboard-count">
                          {player.count} {player.count === 1 ? 'tile' : 'tiles'}
                        </span>
                      </div>
                      <div className="leaderboard-bar-bg">
                        <div 
                          className="leaderboard-bar-fill"
                          style={{
                            width: `${percentWidth}%`,
                            backgroundColor: player.color,
                            boxShadow: `0 0 8px ${player.color}40`
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </aside>
      </main>

      {/* Onboarding Overlay */}
      {showOnboarding && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Welcome to GRIDWARS</h2>
            <p className="modal-desc">
              Claim territory by clicking tiles. Compete with players in real-time. Last write wins.
            </p>

            <div className="user-display-box">
              <span className="user-name-display">{user.username}</span>
              <div className="color-swatch-container">
                <span>Faction Color:</span>
                <div 
                  className="color-swatch" 
                  style={{ 
                    color: user.color, 
                    backgroundColor: user.color 
                  }} 
                />
              </div>
            </div>

            <button className="modal-btn" onClick={handleStartGame}>
              Start Capturing →
            </button>
          </div>
        </div>
      )}

      {/* Cooldown Toast */}
      {toast.visible && (
        <div className="toast-container">
          <div className="toast">
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
