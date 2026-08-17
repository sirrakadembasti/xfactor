import { useState, useEffect, useCallback, useRef } from 'react';
import { soundManager } from './soundEffects';

export const GRID_SIZE = 20;

export const DIRECTIONS = {
  UP: { x: 0, y: -1, name: 'UP' },
  DOWN: { x: 0, y: 1, name: 'DOWN' },
  LEFT: { x: -1, y: 0, name: 'LEFT' },
  RIGHT: { x: 1, y: 0, name: 'RIGHT' },
};

export const FOOD_TYPES = {
  APPLE: { type: 'APPLE', points: 10, color: 'bg-red-500', glow: 'shadow-red-500/50', label: 'Elma' },
  GOLDEN: { type: 'GOLDEN', points: 30, color: 'bg-amber-400', glow: 'shadow-amber-400/50', label: 'Altın Elma' },
  SHRINK: { type: 'SHRINK', points: 15, color: 'bg-purple-500', glow: 'shadow-purple-500/50', label: 'Küçültücü' },
  SPEED: { type: 'SPEED', points: 20, color: 'bg-cyan-400', glow: 'shadow-cyan-400/50', label: 'Hız Bonusu' }
};

export const DIFFICULTIES = {
  easy: { name: 'Kolay', speed: 150, allowWallPass: true, label: 'Sınırsız Kenar' },
  medium: { name: 'Orta', speed: 110, allowWallPass: false, label: 'Klasik Duvar' },
  hard: { name: 'Zor', speed: 70, allowWallPass: false, label: 'Ekstra Engeller' }
};

const INITIAL_SNAKE = [
  { x: 10, y: 12 },
  { x: 10, y: 13 },
  { x: 10, y: 14 }
];

export function useSnakeGame() {
  const [difficulty, setDifficulty] = useState('medium');
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [direction, setDirection] = useState(DIRECTIONS.UP);
  const [status, setStatus] = useState('idle'); // 'idle' | 'playing' | 'paused' | 'gameover'
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('snake_high_score') || '0', 10);
    }
    return 0;
  });
  const [food, setFood] = useState(null);
  const [obstacles, setObstacles] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [stats, setStats] = useState({
    applesEaten: 0,
    specialsEaten: 0,
    movesCount: 0
  });

  const directionRef = useRef(direction);
  const nextDirectionsQueue = useRef([]);
  const statusRef = useRef(status);

  directionRef.current = direction;
  statusRef.current = status;

  // Engelleri oluştur (Zor Mod)
  const generateObstacles = useCallback(() => {
    if (difficulty !== 'hard') return [];
    const obs = [
      { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 },
      { x: 12, y: 14 }, { x: 13, y: 14 }, { x: 14, y: 14 },
      { x: 5, y: 14 }, { x: 14, y: 5 }
    ];
    return obs;
  }, [difficulty]);

  // Rastgele yem üretimi
  const spawnFood = useCallback((currentSnake, currentObstacles) => {
    let valid = false;
    let newFood = null;

    while (!valid) {
      const rx = Math.floor(Math.random() * GRID_SIZE);
      const ry = Math.floor(Math.random() * GRID_SIZE);

      const onSnake = currentSnake.some(seg => seg.x === rx && seg.y === ry);
      const onObstacle = currentObstacles.some(obs => obs.x === rx && obs.y === ry);

      if (!onSnake && !onObstacle) {
        valid = true;
        // Rastgele yem türü kararı
        const rand = Math.random();
        let type = FOOD_TYPES.APPLE;
        if (rand > 0.85) type = FOOD_TYPES.GOLDEN;
        else if (rand > 0.72) type = FOOD_TYPES.SHRINK;
        else if (rand > 0.60) type = FOOD_TYPES.SPEED;

        newFood = { x: rx, y: ry, ...type };
      }
    }
    return newFood;
  }, []);

  // Oyunu başlat / Sıfırla
  const resetGame = useCallback(() => {
    const initialSnake = [
      { x: 10, y: 12 },
      { x: 10, y: 13 },
      { x: 10, y: 14 }
    ];
    const obs = generateObstacles();
    setSnake(initialSnake);
    setDirection(DIRECTIONS.UP);
    nextDirectionsQueue.current = [];
    setObstacles(obs);
    setScore(0);
    setStats({ applesEaten: 0, specialsEaten: 0, movesCount: 0 });
    const newFood = spawnFood(initialSnake, obs);
    setFood(newFood);
    setStatus('idle');
  }, [generateObstacles, spawnFood]);

  useEffect(() => {
    resetGame();
  }, [difficulty, resetGame]);

  const startGame = () => {
    if (status === 'idle' || status === 'gameover') {
      resetGame();
      setStatus('playing');
      if (soundEnabled) soundManager.playClick();
    } else if (status === 'paused') {
      setStatus('playing');
      if (soundEnabled) soundManager.playClick();
    }
  };

  const pauseGame = () => {
    if (status === 'playing') {
      setStatus('paused');
      if (soundEnabled) soundManager.playClick();
    }
  };

  // Yön değiştirme güvenliği
  const changeDirection = useCallback((newDir) => {
    if (statusRef.current !== 'playing') return;

    const lastDir = nextDirectionsQueue.current.length > 0
      ? nextDirectionsQueue.current[nextDirectionsQueue.current.length - 1]
      : directionRef.current;

    // Zıt yöne dönmeyi engelle
    if (lastDir.x + newDir.x === 0 && lastDir.y + newDir.y === 0) {
      return;
    }

    if (nextDirectionsQueue.current.length < 2) {
      nextDirectionsQueue.current.push(newDir);
    }
  }, []);

  // Ana oyun döngüsü
  useEffect(() => {
    if (status !== 'playing') return;

    const currentDifficultyConfig = DIFFICULTIES[difficulty];
    const speed = currentDifficultyConfig.speed;

    const timer = setInterval(() => {
      setSnake((prevSnake) => {
        // Kuyruktaki sıradaki yönü al
        let currentDir = directionRef.current;
        if (nextDirectionsQueue.current.length > 0) {
          currentDir = nextDirectionsQueue.current.shift();
          setDirection(currentDir);
        }

        const head = prevSnake[0];
        let newHead = {
          x: head.x + currentDir.x,
          y: head.y + currentDir.y
        };

        // Duvar geçişi veya çarpışma kontrolü
        if (currentDifficultyConfig.allowWallPass) {
          if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
          if (newHead.x >= GRID_SIZE) newHead.x = 0;
          if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
          if (newHead.y >= GRID_SIZE) newHead.y = 0;
        } else {
          if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
            setStatus('gameover');
            if (soundEnabled) soundManager.playGameOver();
            return prevSnake;
          }
        }

        // Kendi kendine çarpma kontrolü
        const selfCollision = prevSnake.some((seg, idx) => {
          if (idx === prevSnake.length - 1) return false; // Kuyruk ucu hareket edebilir
          return seg.x === newHead.x && seg.y === newHead.y;
        });

        if (selfCollision) {
          setStatus('gameover');
          if (soundEnabled) soundManager.playGameOver();
          return prevSnake;
        }

        // Engel çarpma kontrolü
        const obstacleCollision = obstacles.some(obs => obs.x === newHead.x && obs.y === newHead.y);
        if (obstacleCollision) {
          setStatus('gameover');
          if (soundEnabled) soundManager.playGameOver();
          return prevSnake;
        }

        // Yem yeme kontrolü
        const ateFood = food && newHead.x === food.x && newHead.y === food.y;
        let newSnake = [newHead, ...prevSnake];

        if (ateFood) {
          if (food.type === 'GOLDEN' || food.type === 'SPEED' || food.type === 'SHRINK') {
            if (soundEnabled) soundManager.playPowerup();
            setStats(s => ({ ...s, specialsEaten: s.specialsEaten + 1 }));
          } else {
            if (soundEnabled) soundManager.playEat();
            setStats(s => ({ ...s, applesEaten: s.applesEaten + 1 }));
          }

          setScore(s => {
            const updated = s + food.points;
            if (updated > highScore) {
              setHighScore(updated);
              if (typeof window !== 'undefined') {
                localStorage.setItem('snake_high_score', updated.toString());
              }
            }
            return updated;
          });

          if (food.type === 'SHRINK' && newSnake.length > 3) {
            newSnake.pop(); // İki kez pop yaparak boyunu küçült
            newSnake.pop();
          }

          setFood(spawnFood(newSnake, obstacles));
        } else {
          newSnake.pop();
        }

        setStats(s => ({ ...s, movesCount: s.movesCount + 1 }));
        return newSnake;
      });
    }, speed);

    return () => clearInterval(timer);
  }, [status, difficulty, food, obstacles, spawnFood, soundEnabled, highScore]);

  return {
    snake,
    direction,
    food,
    obstacles,
    status,
    score,
    highScore,
    difficulty,
    soundEnabled,
    stats,
    setDifficulty,
    setSoundEnabled,
    startGame,
    pauseGame,
    resetGame,
    changeDirection
  };
}
