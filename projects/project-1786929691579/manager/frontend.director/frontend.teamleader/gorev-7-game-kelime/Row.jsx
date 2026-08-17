import React from 'react';
import Tile from './Tile';
import { evaluateGuess } from '../../utils/wordleWords';

export default function Row({ guess, isCurrent, solution, isSubmitted, isShaking, isWinningRow }) {
  const wordLength = 5;
  const letters = (guess || '').padEnd(wordLength, ' ').split('').slice(0, wordLength);
  const evaluation = isSubmitted ? evaluateGuess(guess, solution) : [];

  return (
    <div className={`flex justify-center gap-1.5 sm:gap-2 my-1 ${isShaking ? 'animate-shake' : ''}`}>
      {letters.map((char, idx) => {
        const isCharTyped = char.trim().length > 0;
        return (
          <Tile
            key={idx}
            letter={isCharTyped ? char : ''}
            status={evaluation[idx]}
            position={idx}
            isRevealed={isSubmitted}
            isBouncing={isWinningRow}
          />
        );
      })}
    </div>
  );
}
