/**
 * Debug Pane module for Viewfinder
 * Handles debug log UI
 */

import { initToasts } from './toasts.js';

/**
 * Initialize debug pane
 * @param {Object} deps - Dependencies
 * @param {HTMLElement} deps.debugPane - Debug pane element
 * @param {HTMLElement} deps.debugContent - Debug content element
 * @param {HTMLElement} deps.minimizeDebugBtn - Minimize button
 * @param {HTMLElement} deps.maximizeDebugBtn - Maximize button
 * @param {HTMLElement} deps.clearDebugBtn - Clear button
 * @param {Function} [deps.debug] - Debug logging function
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
    debug = console.log,
    updateViewportForPanels,
  } = deps;

  // State
  let isMinimized = true;

  // Toast for user feedback
  const { showInfo } = initToasts({ debug });

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
    debug('Debug pane shown');
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
    debug('Debug pane hidden');
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
    if (debugContent) {
      debugContent.innerHTML = '';
      showInfo('Debug log cleared');
      debug('Debug log cleared');
    }
  }

  /**
   * Add a log entry
   * @param {string} message - Log message
   */
  function log(message) {
    if (!debugContent) return;
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.textContent = `[${timestamp}] ${message}`;
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
      // Default to minimized
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

  // Load initial state
  loadPersistedState();

  return {
    show,
    hide,
    toggle,
    clear,
    log,
    loadPersistedState,
    isMinimized: () => isMinimized,
  };
}