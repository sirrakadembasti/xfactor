import React, { useState, useEffect, useCallback } from 'react';
import WordleGrid from './WordleGrid';
import WordleKeyboard from './WordleKeyboard';
import StatsModal from './StatsModal';
import { getRandomWord, ALLOWED_WORDS } from './wordleWords';

const INITIAL_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
};

export default function Wordle() {
  const [solution, setSolution] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [gameStatus, setGameStatus] = useState('IN_PROGRESS'); // 'IN_PROGRESS', 'WON', 'LOST'
  const [toastMessage, setToastMessage] = useState('');
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [letterStatuses, setLetterStatuses] = useState({});
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('wordle_tr_stats');
    return saved ? JSON.parse(saved) : INITIAL_STATS;
  });

  const initGame = useCallback(() => {
    const newWord = getRandomWord();
    setSolution(newWord);
    setGuesses([]);
    setCurrentGuess('');
    setGameStatus('IN_PROGRESS');
    setLetterStatuses({});
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  useEffect(() => {
    localStorage.setItem('wordle_tr_stats', JSON.stringify(stats));
  }, [stats]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 2000);
  };

  const updateLetterStatuses = (guess, sol) => {
    const newStatuses = { ...letterStatuses };
    const solArr = sol.split('');

    guess.split('').forEach((char, idx) => {
      if (solArr[idx] === char) {
        newStatuses[char] = 'correct';
      } else if (solArr.includes(char) && newStatuses[char] !== 'correct') {
        newStatuses[char] = 'present';
      } else if (!solArr.includes(char) && !newStatuses[char]) {
        newStatuses[char] = 'absent';
      }
    });

    setLetterStatuses(newStatuses);
  };

  const handleGameOver = (won, finalGuessesCount) => {
    setGameStatus(won ? 'WON' : 'LOST');
    setStats((prev) => {
      const newPlayed = prev.gamesPlayed + 1;
      const newWon = won ? prev.gamesWon + 1 : prev.gamesWon;
      const newStreak = won ? prev.currentStreak + 1 : 0;
      const newMaxStreak = Math.max(prev.maxStreak, newStreak);
      const newDist = { ...prev.guessDistribution };
      if (won) {
        newDist[finalGuessesCount] = (newDist[finalGuessesCount] || 0) + 1;
      }