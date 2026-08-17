import React, { useState, useEffect, useCallback } from 'react';

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Satırlar
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Sütunlar
  [0, 4, 8], [2, 4, 6]             // Çaprazlar
];

const playAudio = (type, muted) => {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'win') {
      const now = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);     // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      osc.frequency.setValueAtTime(1046.5, now + 0.3); // C6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'draw') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // AudioContext kısıtlamaları için sessizce geç
  }
};

const checkWinner = (board) => {
  for (let i = 0; i < WINNING_COMBOS.length; i++) {
    const [a, b, c] = WINNING_COMBOS[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: WINNING_COMBOS[i] };
    }
  }
  if (board.every(cell => cell !== null)) {
    return { winner: 'DRAW', line: null };
  }
  return null;
};

const minimax = (board, depth, isMaximizing, aiSymbol, humanSymbol) => {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === aiSymbol) return 10 - depth;
    if (result.winner === humanSymbol) return depth - 10;
    if (result.winner === 'DRAW') return 0;
  }

  const emptyIndices = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let idx of emptyIndices) {
      board[idx] = aiSymbol;
      let score = minimax(board, depth + 1, false, aiSymbol, humanSymbol);
      board[idx] = null;
      bestScore = Math.max(score, bestScore);
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let idx of emptyIndices) {
      board[idx] = humanSymbol;
      let score = minimax(board, depth + 1, true, aiSymbol, humanSymbol);
      board[idx] = null;
      bestScore = Math.min(score, bestScore);
    }
    return bestScore;
  }
};

const getBestMove = (board, aiSymbol, humanSymbol, difficulty) => {
  const emptyIndices = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);

  if (emptyIndices.length === 0) return null;

  if (difficulty === 'easy') {
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  if (difficulty === 'medium') {
    if (Math.random() < 0.4) {
      return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    }
  }

  let bestScore = -Infinity;
  let bestMove = emptyIndices[0];
  for (let idx of emptyIndices) {
    board[idx] = aiSymbol;
    let score = minimax(board, 0, false, aiSymbol, humanSymbol);
    board[idx] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }
  return bestMove;
};

export default function XoxGame() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [gameMode, setGameMode] = useState('pvai'); // 'pvai' veya 'pvp'
  const [difficulty, setDifficulty] = useState('hard'); // 'easy', 'medium', 'hard'
  const [playerSymbol, setPlayerSymbol] = useState('X'); // 'X' veya 'O'
  const [history, setHistory] = useState([Array(9).fill(null)]);
  const [isMuted, setIsMuted] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('xox_game_stats');
    return saved ? JSON.parse(saved) : { xWins: 0, oWins: 0, draws: 0, streak: 0 };
  });

  const result = checkWinner(board);
  const winner = result?.winner;
  const winningLine = result?.line;
  const isGameOver = Boolean(winner);

  const aiSymbol = playerSymbol === 'X' ? 'O' : 'X';
  const currentTurn = isXNext ? 'X' : 'O';
  const isAiTurn = gameMode === 'pvai' && currentTurn === aiSymbol && !isGameOver;

  useEffect(() => {
    localStorage.setItem('xox_game_stats', JSON.stringify(stats));
  }, [stats]);

  const makeMove = useCallback((index) => {
    if (board[index] || isGameOver || isAiThinking) return;

    const newBoard = [...board];
    newBoard[index] = currentTurn;
    playAudio('move', isMuted);

    const newHistory = [...history, newBoard];
    setBoard(newBoard);
    setHistory(newHistory);

    const gameResult = checkWinner(newBoard);
    if (gameResult) {
      if (gameResult.winner === 'X') {
        playAudio('win', isMuted);
        setStats(prev => ({ ...prev, xWins: prev.xWins + 1, streak: prev.streak > 0 ? prev.streak + 1 : 1 }));
      } else if (gameResult.winner === 'O') {
        playAudio('win', isMuted);
        setStats(prev => ({ ...prev, oWins: prev.oWins + 1, streak: prev.streak < 0 ? prev.streak - 1 : -1 }));
      } else if (gameResult.winner === 'DRAW') {
        playAudio('draw', isMuted);
        setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
      }
    } else {
      setIsXNext(!isXNext);
    }
  }, [board, isGameOver, isAiThinking, currentTurn, history, isMuted, isXNext]);

  useEffect(() => {
    if (isAiTurn) {
      setIsAiThinking(true);
      const timer = setTimeout(() => {
        const bestMoveIndex = getBestMove(board, aiSymbol, playerSymbol, difficulty);
        if (bestMoveIndex !== null && board[bestMoveIndex] === null) {
          const newBoard = [...board];
          newBoard[bestMoveIndex] = aiSymbol;
          playAudio('move', isMuted);
          const newHistory = [...history, newBoard];
          setBoard(newBoard);
          setHistory(newHistory);

          const gameResult = checkWinner(newBoard);
          if (gameResult) {
            if (gameResult.winner === 'X') {
              playAudio('win', isMuted);
              setStats(prev => ({ ...prev, xWins: prev.xWins + 1 }));
            } else if (gameResult.winner === 'O') {
              playAudio('win', isMuted);
              setStats(prev => ({ ...prev, oWins: prev.oWins + 1 }));
            } else if (gameResult.winner === 'DRAW') {
              playAudio('draw', isMuted);
              setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
            }
          } else {
            setIsXNext(playerSymbol === 'X');
          }
        }
        setIsAiThinking(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isAiTurn, board, aiSymbol, playerSymbol, difficulty, isMuted, history]);

  const resetGame = () => {
    const initialBoard = Array(9).fill(null);
    setBoard(initialBoard);
    setHistory([initialBoard]);
    setIsXNext(true);
    setIsAiThinking(false);
  };

  const undoMove = () => {
    if (isAiThinking || history.length <= 1) return;
    let stepsToUndo = 1;
    if (gameMode === 'pvai') {
      stepsToUndo = history.length > 2 ? 2 : 1;
    }
    const targetIndex = Math.max(0, history.length - 1 - stepsToUndo);
    const newHistory = history.slice(0, targetIndex + 1);
    const previousBoard = newHistory[newHistory.length - 1];
    setBoard(previousBoard);
    setHistory(newHistory);
    
    const countX = previousBoard.filter(cell => cell === 'X').length;
    const countO = previousBoard.filter(cell => cell === 'O').length;
    setIsXNext(countX <= countO);
  };

  const resetStats = () => {
    setStats({ xWins: 0, oWins: 0, draws: 0, streak: 0 });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-cyan-500 selection:text-slate-950">
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-6 flex flex-col gap-6">
        
        {/* Başlık ve Üst Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-rose-400 bg-clip-text text-transparent">
              XOX OYUNU
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {gameMode === 'pvai' ? `Yapay Zekaya Karşı (${difficulty.toUpperCase()})` : '2 Kişilik Yerel Oyun'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700/50"
              title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
            >
              {isMuted ? (
                <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Ayarlar ve Mod Seçimi */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Mod</label>
            <select
              value={gameMode}
              onChange={(e) => {
                setGameMode(e.target.value);
                resetGame();
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
            >
              <option value="pvai">🤖 Bot Oyuncu</option>
              <option value="pvp">👥 2 Kişilik</option>
            </select>
          </div>

          {gameMode === 'pvai' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Zorluk</label>
              <select
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  resetGame();
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
              >
                <option value="easy">Kolay</option>
                <option value="medium">Orta</option>
                <option value="hard">İmkansız</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Sembolün</label>
              <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
                <button
                  onClick={() => { setPlayerSymbol('X'); resetGame(); }}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition ${playerSymbol === 'X' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'text-slate-400'}`}
                >
                  X Başlar
                </button>
                <button
                  onClick={() => { setPlayerSymbol('O'); resetGame(); }}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition ${playerSymbol === 'O' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' : 'text-slate-400'}`}
                >
                  O Başlar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Skor Tablosu */}
        <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
          <div className="flex flex-col items-center">
            <span className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Oyuncu X</span>
            <span className="text-xl font-extrabold text-cyan-400 mt-1">{stats.xWins}</span>
          </div>
          <div className="flex flex-col items-center border-x border-slate-800">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Berabere</span>
            <span className="text-xl font-extrabold text-slate-300 mt-1">{stats.draws}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs text-rose-400 font-bold uppercase tracking-wider">Oyuncu O</span>
            <span className="text-xl font-extrabold text-rose-400 mt-1">{stats.oWins}</span>
          </div>
        </div>

        {/* Durum Göstergesi */}
        <div className="text-center min-h-[2.5rem] flex items-center justify-center">
          {winner ? (
            <div className="animate-bounce font-bold text-lg flex items-center gap-2">
              {winner === 'DRAW' ? (
                <span className="text-amber-400">🤝 Oyun Berabere Bitti!</span>
              ) : (
                <span className={winner === 'X' ? 'text-cyan-400' : 'text-rose-400'}>
                  🎉 Kazanan: {winner}!
                </span>
              )}
            </div>
          ) : isAiThinking ? (
            <div className="text-slate-400 font-medium text-sm flex items-center gap-2 animate-pulse">
              <svg className="animate-spin h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Yapay zeka düşünüyor...
            </div>
          ) : (
            <div className="text-slate-300 font-medium text-sm flex items-center gap-2">
              <span>Sıra:</span>
              <span className={`font-bold px-2.5 py-0.5 rounded-md ${currentTurn === 'X' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}`}>
                {currentTurn}
              </span>
            </div>
          )}
        </div>

        {/* Oyun Tahtası */}
        <div className="grid grid-cols-3 gap-3 aspect-square bg-slate-950 p-3 rounded-2xl border border-slate-800 shadow-inner">
          {board.map((cell, index) => {
            const isWinningCell = winningLine && winningLine.includes(index);
            return (
              <button
                key={index}
                onClick={() => makeMove(index)}
                disabled={Boolean(cell) || isGameOver || isAiThinking}
                className={`
                  relative flex items-center justify-center font-black rounded-xl text-4xl sm:text-5xl transition-all duration-200 select-none
                  ${!cell && !isGameOver && !isAiThinking ? 'hover:bg-slate-800/60 active:scale-95 bg-slate-900/40 border border-slate-800' : ''}
                  ${cell ? 'bg-slate-900 border border-slate-800' : ''}
                  ${isWinningCell ? 'ring-2 ring-emerald-400 bg-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : ''}
                `}
              >
                {cell === 'X' && (
                  <span className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.6)] animate-in zoom-in-50 duration-150">
                    X
                  </span>
                )}