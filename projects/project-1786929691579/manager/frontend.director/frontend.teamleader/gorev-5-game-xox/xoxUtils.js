// Generates winning combinations dynamically based on board size and required match length
export const generateWinningCombinations = (size, winLength) => {
  const combinations = [];

  // Rows
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      const line = [];
      for (let k = 0; k < winLength; k++) {
        line.push(r * size + (c + k));
      }
      combinations.push(line);
    }
  }

  // Columns
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - winLength; r++) {
      const line = [];
      for (let k = 0; k < winLength; k++) {
        line.push((r + k) * size + c);
      }
      combinations.push(line);
    }
  }

  // Diagonal Down-Right (\)
  for (let r = 0; r <= size - winLength; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      const line = [];
      for (let k = 0; k < winLength; k++) {
        line.push((r + k) * size + (c + k));
      }
      combinations.push(line);
    }
  }

  // Diagonal Down-Left (/)
  for (let r = 0; r <= size - winLength; r++) {
    for (let c = winLength - 1; c < size; c++) {
      const line = [];
      for (let k = 0; k < winLength; k++) {
        line.push((r + k) * size + (c - k));
      }
      combinations.push(line);
    }
  }

  return combinations;
};

export const checkGameStatus = (board, combinations) => {
  for (let combo of combinations) {
    const first = board[combo[0]];
    if (first && combo.every((idx) => board[idx] === first)) {
      return { winner: first, line: combo };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'DRAW', line: null };
  }
  return null;
};

// Minimax Algorithm for 3x3 AI
const minimax = (board, depth, isMaximizing, combinations, alpha = -Infinity, beta = Infinity) => {
  const status = checkGameStatus(board, combinations);
  if (status) {
    if (status.winner === 'O') return 10 - depth;
    if (status.winner === 'X') return depth - 10;
    if (status.winner === 'DRAW') return 0;
  }

  if (depth >= 5) return 0;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) {
        board[i] = 'O';
        let evalScore = minimax(board, depth + 1, false, combinations, alpha, beta);
        board[i] = null;
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) {
        board[i] = 'X';
        let evalScore = minimax(board, depth + 1, true, combinations, alpha, beta);
        board[i] = null;
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
    }
    return minEval;
  }
};

export const getBestAiMove = (board, combinations, difficulty, size) => {
  const emptyIndices = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);

  if (emptyIndices.length === 0) return null;

  // Easy Difficulty: Pure random
  if (difficulty === 'easy') {
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  // Medium Difficulty: 50% chance optimal, 50% random
  if (difficulty === 'medium' && Math.random() < 0.4) {
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  // 1. Immediate Win Check for AI
  for (let idx of emptyIndices) {
    board[idx] = 'O';
    const res = checkGameStatus(board, combinations);
    board[idx] = null;
    if (res && res.winner === 'O') return idx;
  }

  // 2. Immediate Block Check for Player Win
  for (let idx of emptyIndices) {
    board[idx] = 'X';
    const res = checkGameStatus(board, combinations);
    board[idx] = null;
    if (res && res.winner === 'X') return idx;
  }

  // 3. Center Take if available
  const centerIdx = Math.floor(board.length / 2);
  if (board[centerIdx] === null && Math.random() < 0.8) {
    return centerIdx;
  }

  // 4. Minimax for 3x3
  if (size === 3) {
    let bestScore = -Infinity;
    let bestMove = emptyIndices[0];
    for (let idx of emptyIndices) {
      board[idx] = 'O';
      let score = minimax(board, 0, false, combinations);
      board[idx] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = idx;
      }
    }
    return bestMove;
  }

  // Fallback for larger boards
  return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
};
