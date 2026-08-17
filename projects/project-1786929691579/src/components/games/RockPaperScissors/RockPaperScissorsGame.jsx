import React, { useState, useEffect, useRef } from 'react';
import { CHOICES, MODE_CHOICES, determineWinner, getCpuChoice } from './utils/gameLogic';
import { sounds } from './utils/sound';
import RulesModal from './RulesModal';
import GameStats from './GameStats';

export default function RockPaperScissorsGame() {
  const [mode, setMode] = useState('classic'); // 'classic' | 'extended'
  const [difficulty, setDifficulty] = useState('medium'); // 'easy' | 'medium' | 'hard'
  const [targetScore, setTargetScore] = useState(5); // Best of X or unlimited (0)
  const [blitzTimer, setBlitzTimer] = useState(false); // Quick decision timer

  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [ties, setTies] = useState(0);

  const [playerChoice, setPlayerChoice] = useState(null);
  const [cpuChoice, setCpuChoice] = useState(null);
  const [roundResult, setRoundResult] = useState(null); // { result: 'win'|'lose'|'tie', reason: '' }
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(3);

  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('tkm_game_stats');
    return saved ? JSON.parse(saved) : { wins: 0, losses: 0, ties: 0, streak: 0, bestStreak: 0 };
  });

  const [history, setHistory] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const timerRef = useRef(null);

  // Save stats
  useEffect(() => {
    localStorage.setItem('tkm_game_stats', JSON.stringify(stats));
  }, [stats]);

  // Blitz timer effect
  useEffect(() => {
    if (blitzTimer && !isRevealing && !gameOver && !roundResult) {
      setTimeLeft(3);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [blitzTimer, isRevealing, gameOver, roundResult, playerChoice]);

  const handleTimeout = () => {
    if (isRevealing || gameOver) return;
    sounds.playLose();
    setRoundResult({ result: 'lose', reason: 'Süre doldu! Karar veremedin.' });
    setCpuScore(prev => {
      const newScore = prev + 1;
      if (targetScore > 0 && newScore >= targetScore) {
        setGameOver(true);
      }
      return newScore;
    });
    setStats(prev => ({
      ...prev,
      losses: prev.losses + 1,
      streak: 0
    }));
  };

  const handleChoice = (choiceId) => {
    if (isRevealing || gameOver) return;
    sounds.playClick();
    clearInterval(timerRef.current);

    setIsRevealing(true);
    setPlayerChoice(choiceId);
    setCpuChoice(null);
    setRoundResult(null);
    setCountdown(3);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        processRound(choiceId);
      }
    }, 450);
  };

  const processRound = (pChoice) => {
    const available = MODE_CHOICES[mode];
    const cChoice = getCpuChoice(available, difficulty, history);
    const resultObj = determineWinner(pChoice, cChoice);

    setCpuChoice(cChoice);
    setRoundResult(resultObj);
    setIsRevealing(false);

    const newHistoryItem = {
      player: pChoice,
      cpu: cChoice,
      result: resultObj.result,
      timestamp: new Date().toLocaleTimeString()
    };
    setHistory(prev => [newHistoryItem, ...prev]);

    if (resultObj.result === 'win') {
      sounds.playWin();
      const newPlayerScore = playerScore + 1;
      setPlayerScore(newPlayerScore);
      setStats(prev => {
        const newStreak = prev.streak + 1;
        return {
          ...prev,
          wins: prev.wins + 1,
          streak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak)
        };
      });
      if (targetScore > 0 && newPlayerScore >= targetScore) {
        setGameOver(true);
      }
    } else if (resultObj.result === 'lose') {
      sounds.playLose();
      const newCpuScore = cpuScore + 1;
      setCpuScore(newCpuScore);
      setStats(prev => ({
        ...prev,
        losses: prev.losses + 1,
        streak: 0
      }));
      if (targetScore > 0 && newCpuScore >= targetScore) {
        setGameOver(true);
      }
    } else {
      sounds.playTie();
      setTies(prev => prev + 1);
      setStats(prev => ({ ...prev, ties: prev.ties + 1 }));
    }
  };

  const resetMatch = () => {
    sounds.playClick();
    setPlayerScore(0);
    setCpuScore(0);
    setTies(0);
    setPlayerChoice(null);
    setCpuChoice(null);
    setRoundResult(null);
    setGameOver(false);
    setIsRevealing(false);
  };

  const toggleMute = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  const resetStats = () => {
    const empty = { wins: 0, losses: 0, ties: 0, streak: 0, bestStreak: 0 };
    setStats(empty);
    setHistory([]);
  };

  const activeChoices = MODE_CHOICES[mode];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 font-sans select-none relative overflow-hidden">
      {/* Arka Plan Efekti */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h