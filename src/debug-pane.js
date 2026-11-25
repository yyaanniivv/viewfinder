/**
 * Debug Pane module for Viewfinder
 * Handles debug log UI - subscribes to debug-log module
 */

import { debugLog, subscribeToDebugLog } from './debug-log.js';

/**
 * Initialize debug pane
 * @param {Object} deps - Dependencies
 * @param {HTMLElement} deps.debugPane - Debug pane element
 * @param {HTMLElement} deps.debugContent - Debug content element
 * @param {HTMLElement} deps.minimizeDebugBtn - Minimize button
 * @param {HTMLElement} deps.maximizeDebugBtn - Maximize button
 * @param {HTMLElement} deps.clearDebugBtn - Clear button
 * @param {Function} [deps.updateViewportForPanels] - Callback to update viewport
 * @returns {Object} Debug pane API
 */
export function initDebugPane(deps) {
  const {
    debugPane,
    debugContent,
    minimizeDebugBtn,
    maximizeDebugBtn,
    clearDebugBtn,
    updateViewportForPanels,
  } = deps;

  // State
  let isMinimized = true;
  let unsubscribe = null;

  /**
   * Show debug pane
   */
  function show() {
    if (!debugPane) return;
    debugPane.style.display = 'flex';
    debugPane.dataset.state = 'maximized';
    if (minimizeDebugBtn) minimizeDebugBtn.style.display = 'flex';
    if (maximizeDebugBtn) maximizeDebugBtn.style.display = 'none';
    isMinimized = false;
    localStorage.setItem('viewfinder:showDebug', 'true');
    updateViewportForPanels?.();
  }

  /**
   * Hide debug pane
   */
  function hide() {
    if (!debugPane) return;
    debugPane.style.display = 'none';
    debugPane.dataset.state = 'minimized';
    if (minimizeDebugBtn) minimizeDebugBtn.style.display = 'none';
    if (maximizeDebugBtn) maximizeDebugBtn.style.display = 'flex';
    isMinimized = true;
    localStorage.setItem('viewfinder:showDebug', 'false');
    updateViewportForPanels?.();
  }

  /**
   * Toggle debug pane visibility
   */
  function toggle() {
    if (isMinimized) {
      show();
    } else {
      hide();
    }
  }

  /**
   * Clear debug log
   */
  function clear() {
    debugLog.clear();
  }

  /**
   * Render a log entry to the UI
   * @param {Object} entry - Log entry {message, level, time}
   * @param {number} index - Entry index
   */
  function renderEntry(entry, index) {
    if (!debugContent) return;

    if (entry === null && index === -1) {
      debugContent.innerHTML = '';
      return;
    }

    const line = document.createElement('div');
    line.className = `debug-entry debug-${entry.level}`;
    line.textContent = `[${entry.time}] ${entry.message}`;
    debugContent.appendChild(line);
    debugContent.scrollTop = debugContent.scrollHeight;
  }

  /**
   * Load persisted state from localStorage
   */
  function loadPersistedState() {
    const showDebug = localStorage.getItem('viewfinder:showDebug');
    if (showDebug !== null) {
      const show = showDebug === 'true';
      if (show) {
        show();
      } else {
        hide();
      }
    } else {
      hide();
    }
  }

  // Set up event listeners
  if (minimizeDebugBtn) {
    minimizeDebugBtn.addEventListener('click', hide);
  }
  if (maximizeDebugBtn) {
    maximizeDebugBtn.addEventListener('click', show);
  }
  if (clearDebugBtn) {
    clearDebugBtn.addEventListener('click', clear);
  }

  // Subscribe to debug log
  unsubscribe = subscribeToDebugLog(renderEntry);

  // Load initial state
  loadPersistedState();

  // Expose API for testing
  const api = {
    show,
    hide,
    toggle,
    clear,
    loadPersistedState,
    isMinimized: () => isMinimized,
    destroy: () => {
      if (unsubscribe) unsubscribe();
    },
  };

  if (typeof window !== 'undefined') {
    window.__debugPaneAPI = api;
  }

  return api;
}