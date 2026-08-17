export const CARD_THEMES = {
  animals: {
    id: 'animals',
    name: 'Hayvanlar',
    icon: '🐶',
    color: 'from-amber-500 to-orange-600',
    items: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']
  },
  emojis: {
    id: 'emojis',
    name: 'Emojiler',
    icon: '😎',
    color: 'from-yellow-400 to-amber-500',
    items: ['😎', '🥳', '🤠', '👻', '🤖', '👽', '🤡', '🦄', '🐲', '🍕', '🎉', '🚀', '💎', '🔥', '⭐']
  },
  food: {
    id: 'food',
    name: 'Yiyecekler',
    icon: '🍕',
    color: 'from-emerald-500 to-teal-600',
    items: ['🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍪', '🎂', '🍦', '🍓', '🥑', '🌮', '🍣', '🍜', '🍎']
  },
  space: {
    id: 'space',
    name: 'Uzay',
    icon: '🚀',
    color: 'from-indigo-600 to-purple-800',
    items: ['🚀', '🛸', '🪐', '🌙', '⭐', '☄️', '👨‍🚀', '👾', '🛰️', '🌍', '🌌', '☀️', '🔭', '👽', '🔮']
  }
};

export const DIFFICULTY_LEVELS = {
  easy: { id: 'easy', name: 'Kolay', pairs: 6, cols: 'grid-cols-3 sm:grid-cols-4' },
  medium: { id: 'medium', name: 'Orta', pairs: 8, cols: 'grid-cols-4' },
  hard: { id: 'hard', name: 'Zor', pairs: 12, cols: 'grid-cols-4 sm:grid-cols-6' },
  expert: { id: 'expert', name: 'Uzman', pairs: 15, cols: 'grid-cols-5 sm:grid-cols-6' }
};
