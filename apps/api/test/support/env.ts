import { TEST_DATABASE_URL } from './database';

/*
 * Imported by ./app before AppModule. ConfigModule never overwrites a variable that
 * is already set, so a local `apps/api/.env` cannot point the suite at the dev
 * database or a running Redis. REDIS_URL is blank rather than deleted: a missing
 * key would be refilled from .env.
 */
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = '';
process.env.WEB_ORIGIN = 'http://localhost:3000';
