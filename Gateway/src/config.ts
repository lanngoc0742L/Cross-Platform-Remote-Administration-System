import dotenv from 'dotenv'
import { Logger } from './utils/Logger';

dotenv.config();

if (!process.env.AUTH_SECRET) {
    Logger.error("AUTH_SECRET not found in environment variables");
    process.exit(1);
}

export const Config = {
    PORT: process.env.PORT ? parseInt(process.env.PORT) : 8080,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',

    JWT_SECRET: process.env.JWT_SECRET || process.env.AUTH_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

    CLIENT_CACHE_FILE: './data/client_cache.json',
    AGENT_HISTORY_FILE: './data/agent_history.json',
    DATABASE_PATH: process.env.DATABASE_PATH || './data/gateway.db',
};