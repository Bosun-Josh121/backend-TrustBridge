import { cleanupExpiredTokens } from '../models/refreshToken';

export const scheduleTokenCleanup = (intervalMinutes: number = 60): NodeJS.Timeout => {
  console.log(`Scheduling token cleanup every ${intervalMinutes} minutes`);
  
  // Run cleanup immediately on startup
  runCleanup();
  
  // Schedule periodic cleanup
  return setInterval(runCleanup, intervalMinutes * 60 * 1000);
};

/**
 * Run a token cleanup operation
 */
const runCleanup = async (): Promise<void> => {
  try {
    const deletedCount = await cleanupExpiredTokens();
    console.log(`Token cleanup completed: ${deletedCount} expired tokens removed`);
  } catch (error) {
    console.error('Error during token cleanup:', error);
  }
};