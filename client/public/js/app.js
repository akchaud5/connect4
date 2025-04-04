// Connect to the Socket.io server
const socket = io();

// Game state
let gameState = null;
let gameId = null;

// DOM elements
const gameModes = document.getElementById('game-modes');
const gameContainer = document.getElementById('game-container');
const board = document.getElementById('board');
const playerTurn = document.getElementById('player-turn');
const statusMessage = document.getElementById('status-message');
const columnIndicators = document.getElementById('column-indicators');
const shareModal = document.getElementById('share-modal');
const shareLink = document.getElementById('share-link');
const copyLink = document.getElementById('copy-link');
const winnerModal = document.getElementById('winner-modal');
const winnerMessage = document.getElementById('winner-message');
const playAgain = document.getElementById('play-again');
const backToMenu = document.getElementById('back-to-menu');

// Buttons
const onePlayer = document.getElementById('one-player');
const twoPlayer = document.getElementById('two-player');
const aiVsAi = document.getElementById('ai-vs-ai');
const newGame = document.getElementById('new-game');
const shareGame = document.getElementById('share-game');
const closeModalBtns = document.querySelectorAll('.close');
const activeGamesList = document.getElementById('active-games-list');

// Initialize the game
function init() {
  // Check for game ID in URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlGameId = urlParams.get('game');

  if (urlGameId) {
    // Join existing game
    joinGame(urlGameId);
  } else {
    // Check for saved game in localStorage
    const savedGame = localStorage.getItem('connectFourGame');
    if (savedGame) {
      const parsedGame = JSON.parse(savedGame);
      // Only restore if game is still in progress or recently finished
      if (parsedGame && (parsedGame.gameStatus === 'playing' || parsedGame.gameStatus === 'finished')) {
        gameState = parsedGame;
        gameId = parsedGame.id;
        socket.emit('joinGame', gameId);
      }
    }
  }

  // Create the board grid
  createBoard();

  // Event listeners
  onePlayer.addEventListener('click', () => startNewGame('1p'));
  twoPlayer.addEventListener('click', () => startNewGame('2p'));
  aiVsAi.addEventListener('click', () => startNewGame('ai'));
  newGame.addEventListener('click', resetGame);
  shareGame.addEventListener('click', showShareModal);
  playAgain.addEventListener('click', resetGame);
  backToMenu.addEventListener('click', goBackToMenu);
  copyLink.addEventListener('click', copyShareLink);
  
  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      shareModal.classList.add('hidden');
    });
  });

  // Column click event listeners
  columnIndicators.querySelectorAll('.indicator').forEach(indicator => {
    indicator.addEventListener('click', handleColumnClick);
  });

  // Socket events
  socket.on('gameState', handleGameStateUpdate);
  socket.on('error', handleError);
  socket.on('activeGames', updateActiveGamesList);

  // Load active games
  loadActiveGames();

  // Window events for persistence
  window.addEventListener('beforeunload', saveGameToLocalStorage);
}

// Create the game board
function createBoard() {
  board.innerHTML = '';
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      
      // Add disc element
      const disc = document.createElement('div');
      disc.className = 'disc';
      cell.appendChild(disc);
      
      cell.addEventListener('click', () => handleColumnClick({ target: columnIndicators.children[col] }));
      board.appendChild(cell);
    }
  }
}

// Start a new game
function startNewGame(mode) {
  socket.emit('createGame');
  
  // Wait for game creation response before setting mode
  socket.once('gameState', (state) => {
    gameId = state.id;
    socket.emit('setGameMode', { gameId, mode });
    
    // Update URL with game ID for sharing
    const url = new URL(window.location.href);
    url.searchParams.set('game', gameId);
    window.history.pushState({}, '', url);
    
    // Show game view
    gameModes.classList.add('hidden');
    gameContainer.classList.remove('hidden');
  });
}

// Join an existing game
function joinGame(id) {
  gameId = id;
  socket.emit('joinGame', id);
  
  // Update URL with game ID
  const url = new URL(window.location.href);
  url.searchParams.set('game', gameId);
  window.history.pushState({}, '', url);
  
  // Show game view
  gameModes.classList.add('hidden');
  gameContainer.classList.remove('hidden');
}

// Handle column click
function handleColumnClick(event) {
  if (!gameState || gameState.gameStatus !== 'playing') return;
  
  const col = parseInt(event.target.dataset.col);
  socket.emit('makeMove', { gameId, col });
}

// Update the UI based on game state
function updateUI() {
  if (!gameState) return;
  
  // Update board
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      const disc = cell.querySelector('.disc');
      
      disc.classList.remove('player1', 'player2', 'dropped', 'win');
      
      if (gameState.board[row][col] === 1) {
        disc.classList.add('player1', 'dropped');
      } else if (gameState.board[row][col] === 2) {
        disc.classList.add('player2', 'dropped');
      }
    }
  }
  
  // Highlight winning cells if game is finished
  if (gameState.gameStatus === 'finished' && gameState.winner !== 'draw' && gameState.lastMove) {
    highlightWinningCells();
  }
  
  // Update player turn indicator
  const player1Element = playerTurn.children[0];
  const player2Element = playerTurn.children[1];
  
  player1Element.classList.toggle('active', gameState.currentPlayer === 1);
  player2Element.classList.toggle('active', gameState.currentPlayer === 2);
  
  // Update status message
  updateStatusMessage();
  
  // Show winner modal if game is finished
  if (gameState.gameStatus === 'finished' && !winnerModal.classList.contains('visible')) {
    setTimeout(showWinnerModal, 1000);
  }
}

// Update status message based on game state
function updateStatusMessage() {
  if (!gameState) return;
  
  let message = '';
  
  switch (gameState.gameStatus) {
    case 'waiting':
      message = 'Waiting for game to start...';
      break;
      
    case 'playing':
      if (gameState.gameMode === 'ai') {
        message = `AI ${gameState.currentPlayer} is thinking...`;
      } else if (gameState.gameMode === '1p' && gameState.currentPlayer === 2) {
        message = 'AI is thinking...';
      } else {
        message = `Player ${gameState.currentPlayer}'s turn`;
      }
      break;
      
    case 'finished':
      if (gameState.winner === 'draw') {
        message = 'Game ended in a draw!';
      } else if (gameState.gameMode === 'ai') {
        message = `AI ${gameState.winner} wins!`;
      } else {
        const winner = gameState.winner === 1 ? 'Player 1' : (gameState.gameMode === '1p' ? 'AI' : 'Player 2');
        message = `${winner} wins!`;
      }
      break;
  }
  
  // Clear previous content
  statusMessage.innerHTML = '';
  
  // Add main status message
  const statusText = document.createElement('div');
  statusText.textContent = message;
  statusMessage.appendChild(statusText);
  
  // Always add AI metrics container (even if empty) to maintain layout
  const aiInfo = document.createElement('div');
  aiInfo.className = 'ai-metrics';
  
  // Fill with metrics if available
  if (gameState.aiMetrics && 
      ((gameState.gameMode === '1p' && gameState.lastMove && gameState.board[gameState.lastMove.row][gameState.lastMove.col] === 2) || 
       (gameState.gameMode === 'ai'))) {
    const metrics = gameState.aiMetrics;
    
    // Only show metrics if we have actual data
    if (metrics.positionsEvaluated > 0 || metrics.calculationTimeMs > 0) {
      aiInfo.innerHTML = `
        <span class="ai-metric">Time: ${metrics.calculationTimeMs}ms</span>
        <span class="ai-metric">Depth: ${metrics.searchDepth}</span>
        <span class="ai-metric">Positions: ${metrics.positionsEvaluated.toLocaleString()}</span>
        <span class="ai-metric">${metrics.reasonForMove}</span>
      `;
    }
  }
  
  // Always add the container to maintain consistent layout
  statusMessage.appendChild(aiInfo);
}

// Highlight winning cells
function highlightWinningCells() {
  if (!gameState || !gameState.lastMove) return;
  
  const { row, col } = gameState.lastMove;
  const player = gameState.board[row][col];
  
  // Directions to check: horizontal, vertical, diagonal /
  const directions = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diagonal /
    [1, -1], // diagonal \
  ];
  
  for (const [dr, dc] of directions) {
    let count = 1;
    const winningCells = [{ row, col }];
    
    // Check in positive direction
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= 6 || c < 0 || c >= 7 || gameState.board[r][c] !== player) {
        break;
      }
      count++;
      winningCells.push({ row: r, col: c });
    }
    
    // Check in negative direction
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= 6 || c < 0 || c >= 7 || gameState.board[r][c] !== player) {
        break;
      }
      count++;
      winningCells.push({ row: r, col: c });
    }
    
    if (count >= 4) {
      // Highlight these cells
      for (const { row, col } of winningCells) {
        const cell = board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        const disc = cell.querySelector('.disc');
        disc.classList.add('win');
      }
      break;
    }
  }
}

// Handle game state update from server
function handleGameStateUpdate(state) {
  // Only update if:
  // 1. We don't have a game state yet, or
  // 2. The update is for our current game
  if (!gameState || state.id === gameId) {
    gameState = state;
    gameId = state.id;
    
    // Save game state to localStorage
    saveGameToLocalStorage();
    
    // Update UI
    updateUI();
  }
}

// Handle errors from server
function handleError(message) {
  console.error('Server error:', message);
  statusMessage.textContent = `Error: ${message}`;
}

// Reset the game - now always goes back to the main menu
function resetGame() {
  if (winnerModal) {
    winnerModal.classList.add('hidden');
  }
  
  // Go back to game mode selection
  goBackToMenu();
}

// Go back to game mode selection
function goBackToMenu() {
  gameContainer.classList.add('hidden');
  gameModes.classList.remove('hidden');
  winnerModal.classList.add('hidden');
  
  // Clear URL params
  window.history.pushState({}, '', window.location.pathname);
}

// Show share modal
function showShareModal() {
  if (!gameId) return;
  
  const shareUrl = `${window.location.origin}${window.location.pathname}?game=${gameId}`;
  shareLink.value = shareUrl;
  shareModal.classList.remove('hidden');
}

// Copy share link to clipboard
function copyShareLink() {
  shareLink.select();
  document.execCommand('copy');
  
  // Change button text temporarily
  const originalText = copyLink.textContent;
  copyLink.textContent = 'Copied!';
  setTimeout(() => {
    copyLink.textContent = originalText;
  }, 2000);
}

// Show winner modal
function showWinnerModal() {
  if (!gameState || gameState.gameStatus !== 'finished') return;
  
  if (gameState.winner === 'draw') {
    winnerMessage.textContent = 'Game ended in a draw!';
  } else if (gameState.gameMode === 'ai') {
    winnerMessage.textContent = `AI ${gameState.winner} wins!`;
  } else {
    const winner = gameState.winner === 1 ? 'Player 1' : (gameState.gameMode === '1p' ? 'AI' : 'Player 2');
    winnerMessage.textContent = `${winner} wins!`;
  }
  
  winnerModal.classList.remove('hidden');
  winnerModal.classList.add('visible');
}

// Save game to localStorage
function saveGameToLocalStorage() {
  if (gameState) {
    localStorage.setItem('connectFourGame', JSON.stringify(gameState));
  }
}

// Load active games
function loadActiveGames() {
  socket.emit('getActiveGames');
}

// Update active games list in the UI
function updateActiveGamesList(games) {
  if (!games || games.length === 0) {
    activeGamesList.innerHTML = '<p class="no-games">No active games found</p>';
    return;
  }
  
  // Sort games: playing first, then waiting, then finished
  const sortOrder = { 'playing': 0, 'waiting': 1, 'finished': 2 };
  const sortedGames = [...games].sort((a, b) => {
    // First sort by status
    const statusDiff = sortOrder[a.gameStatus] - sortOrder[b.gameStatus];
    if (statusDiff !== 0) return statusDiff;
    
    // Then by last activity (most recent first)
    return new Date(b.lastActivity) - new Date(a.lastActivity);
  });
  
  // Generate HTML for each game
  const gamesHTML = sortedGames.map(game => {
    // Get friendly mode text
    let modeText = '';
    switch(game.gameMode) {
      case '1p': modeText = '1 Player vs AI'; break;
      case '2p': modeText = '2 Players'; break;
      case 'ai': modeText = 'AI vs AI'; break;
      default: modeText = 'Unknown';
    }
    
    // Format the game ID nicely
    const displayId = game.id;
    
    // Get status class
    const statusClass = `status-${game.gameStatus}`;
    
    // Get readable status
    let statusText = '';
    switch(game.gameStatus) {
      case 'playing': statusText = 'In Progress'; break;
      case 'waiting': statusText = 'Waiting'; break;
      case 'finished': 
        if (game.winner === 'draw') {
          statusText = 'Draw';
        } else if (game.gameMode === 'ai') {
          statusText = `AI ${game.winner} Won`;
        } else if (game.gameMode === '1p' && game.winner === 2) {
          statusText = 'AI Won';
        } else {
          statusText = `Player ${game.winner} Won`;
        }
        break;
      default: statusText = 'Unknown';
    }
    
    // Create the element
    return `
      <div class="game-item" data-game-id="${game.id}">
        <div class="game-details">
          <div class="game-id">${displayId}</div>
          <div class="game-mode">${modeText}</div>
        </div>
        <div class="game-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }).join('');
  
  // Update the list
  activeGamesList.innerHTML = gamesHTML;
  
  // Add click event listeners to join games
  document.querySelectorAll('.game-item').forEach(item => {
    item.addEventListener('click', () => {
      const gameId = item.dataset.gameId;
      joinGame(gameId);
    });
  });
}

// Refresh active games list periodically
setInterval(loadActiveGames, 30000); // Refresh every 30 seconds

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', init);