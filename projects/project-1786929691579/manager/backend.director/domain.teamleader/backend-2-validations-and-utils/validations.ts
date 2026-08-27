import { z } from 'zod';
import { isTurkishAlphabetOnly } from './turkish-utils';

/**
 * Skor kaydı ve liderlik tablosu gönderim şeması
 */
export const scoreSubmissionSchema = z.object({
  playerName: z
    .string()
    .min(2, { message: 'Oyuncu adı en az 2 karakter olmalıdır.' })
    .max(30, { message: 'Oyuncu adı en fazla 30 karakter olmalıdır.' })
    .refine((val) => isTurkishAlphabetOnly(val), {
      message: 'Oyuncu adı yalnızca Türkçe harfler, boşluk ve tire içerebilir.',
    }),
  score: z
    .number()
    .int({ message: 'Skor bir tam sayı olmalıdır.' })
    .min(0, { message: 'Skor negatif olamaz.' }),
  wordsFound: z
    .array(z.string())
    .default([]),
  wordCount: z
    .number()
    .int()
    .min(0, { message: 'Kelime sayısı negatif olamaz.' }),
  timeElapsed: z
    .number()
    .min(0, { message: 'Geçen süre negatif olamaz.' }),
  gameMode: z
    .enum(['classic', 'time-attack', 'daily', 'custom'])
    .default('classic'),
  gridSize: z
    .number()
    .int()
    .min(3)
    .max(10)
    .default(4),
});

export type ScoreSubmissionInput = z.infer<typeof scoreSubmissionSchema>;

/**
 * Tekil kelime doğrulama şeması
 */
export const wordVerificationSchema = z.object({
  word: z
    .string()
    .min(2, { message: 'Kelime en az 2 harfli olmalıdır.' })
    .max(50, { message: 'Kelime çok uzun.' })
    .transform((val) => val.trim())
    .refine((val) => isTurkishAlphabetOnly(val), {
      message: 'Kelime yalnızca Türkçe harfler içerebilir.',
    }),
  path: z
    .array(
      z.object({
        row: z.number().int().min(0),
        col: z.number().int().min(0),
      })
    )
    .optional(),
});

export type WordVerificationInput = z.infer<typeof wordVerificationSchema>;

/**
 * Oyun ayarları doğrulama şeması
 */
export const gameSettingsSchema = z.object({
  gridSize: z.number().int().min(3).max(8).default(4),
  durationSeconds: z.number().int().min(30).max(600).default(120),
  allowDiagonals: z.boolean().default(true),
  minWordLength: z.number().int().min(2).max(5).default(2),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  soundEnabled: z.boolean().default(true),
});

export type GameSettingsInput = z.infer<typeof gameSettingsSchema>;
