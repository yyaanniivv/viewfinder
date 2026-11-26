/**
 * Debug Log module for Viewfinder
 * Simple logging with history and subscribers
 */

const MAX_HISTORY = 1000;

class DebugLog {
  constructor() {
    this.history = [];
    this.subscribers = new Set();
  }

  /**
   * Subscribe to log updates
   * @param {Function} callback - Called with (entry, index) on each new entry
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    // Send existing history to new subscriber
    this.history.forEach((entry, index) => callback(entry, index));
    return () => this.subscribers.delete(callback);
  }

  /**
   * Add a log entry
   * @param {string} message - Log message
   * @param {string} [level='info'] - Log level
   */
  log(message, level = 'info') {
    const entry = {
      message,
      level,
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString(),
    };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    // Notify all subscribers
    const index = this.history.length - 1;
    this.subscribers.forEach(cb => cb(entry, index));
    // Also log to console
    console.log(`[${entry.time}] ${message}`);
  }

  /**
   * Clear all history
   */
  clear() {
    this.history = [];
    this.subscribers.forEach(cb => cb(null, -1)); // Signal clear
  }

  /**
   * Get current history
   * @returns {Array} Copy of history array
   */
  getHistory() {
    return [...this.history];
  }
}

// Singleton instance
export const debugLog = new DebugLog();

// Convenience function for easy importing - just console.log with timestamp
export function debug(message, level = 'info') {
  debugLog.log(message, level);
}

export function clearDebug() {
  debugLog.clear();
}

export function getDebugHistory() {
  return debugLog.getHistory();
}

export function subscribeToDebugLog(callback) {
  return debugLog.subscribe(callback);
}