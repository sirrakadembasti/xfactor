import { initializeDatabase } from '../db.js';

if (!process.env.DB_PATH || process.env.DB_PATH === ':memory:') {
    throw new Error('Test runner requires an isolated DB_PATH before loading backend tests.');
}

initializeDatabase({ path: process.env.DB_PATH });
