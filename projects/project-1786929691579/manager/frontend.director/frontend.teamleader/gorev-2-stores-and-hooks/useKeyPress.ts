import { useState, useEffect } from 'react';

export const useKeyPress = (targetKey?: string) => {
  const [keyPressed, setKeyPressed] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    const downHandler = (e: KeyboardEvent) => {
      setLastKey(e.key);
      if (targetKey && e.key === targetKey) {
        setKeyPressed(true);
      }
    };

    const upHandler = (e: KeyboardEvent) => {
      if (targetKey && e.key === targetKey) {
        setKeyPressed(false);
      }
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);

    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [targetKey]);

  return { keyPressed, lastKey };
};
