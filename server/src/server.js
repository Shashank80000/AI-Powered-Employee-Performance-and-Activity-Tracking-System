import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { purgeExpiredScreenshots } from './services/screenshotService.js';

try {
  await connectDatabase();
} catch (error) {
  console.error(`Could not connect to MongoDB at ${env.MONGODB_URI}: ${error.message}`);
  process.exit(1);
}

// Screenshots are deleted SCREENSHOT_RETENTION_DAYS after capture: checked at start and hourly.
async function purge() {
  try {
    const removed = await purgeExpiredScreenshots();
    if (removed) console.log(`Deleted ${removed} screenshot(s) older than ${env.SCREENSHOT_RETENTION_DAYS} days`);
  } catch (error) {
    console.error('Screenshot purge failed:', error.message);
  }
}
let purgeTimer;

// Express 5 calls this callback on failure too, with the error.
const server = createApp().listen(env.PORT, async (error) => {
  if (error) {
    // Usually `npm run dev` is already running in another terminal.
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${env.PORT} is already in use: the API is probably already running in another terminal. Stop it there (Ctrl+C) or set PORT in server/.env.`
        : `Could not start the API: ${error.message}`
    );
    await disconnectDatabase();
    process.exit(1);
  }
  console.log(`Performance Tracker API listening on http://localhost:${env.PORT}`);
  purge();
  purgeTimer = setInterval(purge, 60 * 60 * 1000);
});

function shutdown(signal) {
  clearInterval(purgeTimer);
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
