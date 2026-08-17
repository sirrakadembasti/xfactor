import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  RotateCcw,
  User,
  Cpu,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  Award,
  Undo2,
  Settings,
  Swords,
  CheckCircle2,
  BarChart2,
  RefreshCw
} from 'lucide-react';
import ConfettiEffect from './xox/ConfettiEffect';
import {
  generateWinningCombinations,
  checkGameStatus,
  getBestAiMove
} from './xox/xoxUtils';

// Symbol Themes
const THEMES = {
  classic: {
    name: 'Klasik',
    X: '❌',
    O: '⭕',
    xBg: 'from-rose-500 to-red-600',
    oBg: 'from-blue-500 to-indigo-600'
  },
  neon: {
    name: 'Neon',
    X: '⚡',
    O: '🌀',
    xBg: 'from-amber-400 to-yellow-500',
    oBg: 'from-cyan-400 to-teal-500'
  },
  elemental: {
    name: 'Elementler',
    X: '🔥',
    O: '❄️',
    xBg: 'from-orange-500 to-red-500',
    oBg: 'from-sky-400 to-blue-600'
  },
  pets: {
    name: 'Evcil Hayvanlar',
    X: '🐱',
    O: '🐶',
    xBg: 'from-pink-400 to-rose-500',
    oBg: 'from-amber-500 to-orange-600'
  },
  space: {
    name: 'Uzay',
    X: '🚀',
    O: '🛸',
    xBg: 'from-purple-500 to-indigo-600',
    oBg: 'from-emerald-400 to-teal-600'
  }
};

// Audio Synthesizer
const playSoundEffect = (type, soundEnabled = true) => {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'x') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'o') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(250, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const startTime = now + i * 0.07;
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });
    } else if (type === 'draw') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.25);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    // Audio context fallback
  }
};

export default function XoxGame() {
  // Config state
  const [boardSize, setBoardSize] = useState(3);
  const [gameMode, setGameMode] = useState('pve'); // 'pvp' or 'pve'
  const [difficulty, setDifficulty] = useState('impossible'); // 'easy', 'medium', 'impossible'
  const [themeKey, setThemeKey] = useState('classic');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Dynamic win match length (3 for 3x3, 4 for 4x4, 4 for 5x5)
  const winLength = boardSize === 3 ? 3 : 4;

  // Game board & state
  const [board, setBoard] = useState(Array(boardSize * boardSize).fill(null));
  const [turn, setTurn] = useState('X'); // 'X' or 'O'
  const [history, setHistory] = useState([]);
  const [gameStatus, setGameStatus] = useState(null); // { winner: 'X' | 'O' | 'DRAW', line: [] }
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Match Scores
  const [scores, setScores] = useState({
    p1Wins: 0,
    p2Wins: 0,
    draws: 0,
    gamesPlayed: 0
  });

  const