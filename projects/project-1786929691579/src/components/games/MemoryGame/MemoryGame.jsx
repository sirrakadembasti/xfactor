import React, { useState, useEffect } from 'react';
import GameStats from './GameStats';
import { CARD_THEMES, DIFFICULTY_LEVELS } from './themes';

export default function MemoryGame() {
  const [theme, setTheme] = useState('animals');
  const [difficulty, setDifficulty] = useState('easy');
  const [cards, setCards] = useState([]);
  const [flippedIndices, setFlippedIndices] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameWon, setIsGameWon] = useState(false);

  // Initialize Game
  const initGame = () => {
    const currentTheme = CARD_THEMES[theme] || CARD_THEMES.animals;
    const currentDiff = DIFFICULTY_LEVELS[difficulty] || DIFFICULTY_LEVELS.easy;
    const numPairs = currentDiff.pairs;

    const selectedIcons = currentTheme.items.slice(0, numPairs);
    const deck = [...selectedIcons, ...selectedIcons]
      .sort(() => Math.random() - 0.5)
      .map((icon, idx) => ({ id: idx, icon }));

    setCards(deck);
    setFlippedIndices([]);
    setMatchedPairs([]);
    setMoves(0);
    setTimer(0);
    setScore(0);
    setCombo(1);
    setHintsLeft(3);
    setIsGameWon(false);
  };

  useEffect(() => {
    initGame();
  }, [theme, difficulty]);

  // Timer Effect
  useEffect(() => {
    if (isPaused || isGameWon) return;
    const interval = setInterval(() => {
      setTimer((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, isGameWon]);

  // Card Click Handler
  const handleCardClick = (index) => {
    if (isPaused || isGameWon) return;
    if (flippedIndices.includes(index) || matchedPairs.includes(cards[index]?.icon)) return;
    if (flippedIndices.length >= 2) return;

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const firstCard = cards[newFlipped[0]];
      const secondCard = cards[newFlipped[1]];

      if (firstCard.icon === secondCard.icon) {
        // Matched!
        const newMatched = [...matchedPairs, firstCard.icon];
        setMatchedPairs(newMatched);
        setScore((s) => s + 100 * combo);
        setCombo((c) => c + 1);
        setFlippedIndices([]);

        const currentDiff = DIFFICULTY_LEVELS[difficulty] || DIFFICULTY_LEVELS.easy;
        if (newMatched.length === currentDiff.pairs) {
          setIsGameWon(true);
          setHighScore((h) => Math.max(h, score + 500));
        }
      } else {
        // Not matched
        setCombo(1);
        setTimeout(() => {
          setFlippedIndices([]);
        }, 900);
      }
    }
  };

  const handleUseHint = () => {
    if (hintsLeft <= 0 || isPaused) return;
    setHintsLeft((h) => h - 1);
    // Briefly show all unmatched cards
    const unmatchedIndices = cards
      .map((c, i) => (!matchedPairs.includes(c.icon) ? i : -1))
      .filter((i) => i !== -1);
    setFlippedIndices(unmatchedIndices);
    setTimeout(() => {
      setFlippedIndices([]);
    }, 1000);
  };

  const currentDiff = DIFFICULTY_LEVELS[difficulty] || DIFFICULTY_LEVELS.easy;

  return (
    <div className="flex flex-col items-center max-w-4xl mx-auto">
      {/* Theme & Difficulty Selectors */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-6 bg-slate-100 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Tema:</span>
          {Object.values(CARD_THEMES).map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                theme === t.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              <span>{t.icon}</span> {t.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Zorluk:</span>
          {Object.values(DIFFICULTY_LEVELS).map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                difficulty === d.id
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              {d.name} ({d.pairs} Çift)
            </button>
          ))}
        </div>
      </div>

      {/* Game Stats Bar */}
      <GameStats
        moves={moves}
        timer={timer}
        score={score}
        combo={combo}
        hintsLeft={hintsLeft}
        onUseHint={handleUseHint}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(!isMuted)}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        onReset={initGame}
        highScore={highScore}
      />

      {/* Victory Celebration */}
      {isGameWon && (
        <div className="w-full bg-emerald-500/20 border-2 border-emerald-500 rounded-2xl p-6 mb-6 text-center text-emerald-900 dark:text-emerald-100 shadow-xl animate-in zoom-in-95">
          <h3 className="text-3xl font-black mb-1">🎉 Tebrikler! Kazandınız!</h3>
          <p className="text-sm font-medium mb-4">
            {moves} hamlede ve {timer} saniyede tüm kartları eşleştirdiniz! Toplam Skor: {score}
          </p>
          <button
            onClick={initGame}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition"
          >
            Tekrar Oyna
          </button>
        </div>
      )}

      {/* Cards Grid */}
      <div className={`grid ${currentDiff.cols} gap-3 sm:gap-4 w-full`}>
        {cards.map((card, idx) => {
          const isFlipped = flippedIndices.includes(idx) || matchedPairs.includes(card.icon);
          const isMatched = matchedPairs.includes(card.icon);

          return (
            <div
              key={idx}
              onClick={() => handleCardClick(idx)}
              className={`aspect-square rounded-2xl border-2 cursor-pointer flex items-center justify-center text-3xl sm:text-4xl select-none transition-all duration-300 transform ${
                isFlipped
                  ? isMatched
                    ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-400 scale-95 shadow-inner'
                    : 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-500 scale-100 shadow-md rotate-y-180'
                  : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-indigo-400 shadow-md hover:scale-105 active:scale-95'
              }`}
            >
              {isFlipped ? <span>{card.icon}</span> : <span className="text-white font-black text-lg sm:text-xl">?</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
