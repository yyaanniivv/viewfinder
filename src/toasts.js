/**
 * Toasts module for Viewfinder
 * Handles toast notifications (error, info, location)
 */

const TOAST_CONTAINER_ID = 'toast-container';

/**
 * Initialize toast system
 * @param {Object} deps - Dependencies
 * @param {Function} [deps.debug] - Debug logging function
 * @returns {Object} Toast API
 */
export function initToasts(deps = {}) {
  const { debug = console.log } = deps;

  // Ensure toast container exists
  function getContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = TOAST_CONTAINER_ID;
      container.style.cssText = `
        position: fixed;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Create and show a toast
   * @param {string} message - Toast message
   * @param {Object} options - Toast options
   * @param {boolean} [options.isError=false] - Whether this is an error toast
   * @param {number} [options.duration=3000] - Duration in ms
   * @param {string} [options.className] - Additional CSS class
   */
  function show(message, options = {}) {
    const { isError = false, duration = 3000, className = '' } = options;
    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : 'info'} ${className}`.trim();
    toast.style.cssText = `
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      color: #fff;
      background: ${isError ? 'rgba(220, 60, 60, 0.95)' : 'rgba(30, 30, 30, 0.95)'};
      backdrop-filter: blur(8px);
      border: 1px solid ${isError ? 'rgba(220, 60, 60, 0.5)' : 'rgba(255, 255, 255, 0.1)'};
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      max-width: 90vw;
      word-wrap: break-word;
      animation: toast-in 0.2s ease-out;
    `;
    toast.textContent = message;

    // Add close button for longer toasts
    if (duration > 5000) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = `
        margin-left: 12px;
        padding: 0 8px;
        background: transparent;
        border: none;
        color: inherit;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        opacity: 0.7;
      `;
      closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
      closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
      closeBtn.onclick = () => remove(toast);
      toast.appendChild(closeBtn);
    }

    container.appendChild(toast);

    // Auto-remove
    if (duration > 0) {
      setTimeout(() => remove(toast), duration);
    }

    debug(`Toast: ${isError ? 'ERROR' : 'INFO'} - ${message}`);

    return toast;
  }

  /**
   * Remove a toast element
   * @param {HTMLElement} toast - Toast element to remove
   */
  function remove(toast) {
    toast.style.animation = 'toast-out 0.2s ease-in';
    setTimeout(() => toast.remove(), 200);
  }

  /**
   * Show an error toast
   * @param {string} message - Error message
   * @param {number} [duration=4000] - Duration in ms
   */
  function showError(message, duration = 4000) {
    return show(message, { isError: true, duration });
  }

  /**
   * Show an info toast
   * @param {string} message - Info message
   * @param {number} [duration=3000] - Duration in ms
   */
  function showInfo(message, duration = 3000) {
    return show(message, { isError: false, duration });
  }

  /**
   * Show a location toast with details
   * @param {Object} loc - Location object {name, color, type, lat, lon}
   * @param {string} [distance='—'] - Formatted distance string
   */
  function showLocation(loc, distance = '—') {
    const container = getContainer();

    // Remove existing location toast
    const existing = container.querySelector('.location-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast location-toast';
    toast.style.cssText = `
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      color: #fff;
      background: rgba(30, 30, 30, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      max-width: 90vw;
      min-width: 240px;
      animation: toast-in 0.2s ease-out;
    `;

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${loc.color}"></span>
        <strong>${loc.name}</strong>
        ${loc.type ? `<span style="font-size: 12px; color: #888; text-transform: capitalize">• ${loc.type}</span>` : ''}
      </div>
      <div style="font-size: 13px; color: #BBB; margin-top: 4px;">${distance} away</div>
      <button class="toast-close" style="
        margin-top: 8px;
        padding: 4px 12px;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
      ">Dismiss</button>
    `;

    toast.querySelector('.toast-close').onclick = () => remove(toast);
    container.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => remove(toast), 5000);

    debug(`Location toast: ${loc.name} (${distance})`);

    return toast;
  }

  // Add CSS animations if not already present
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes toast-in {
        from { opacity: 0; transform: translateY(20px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes toast-out {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(-10px) scale(0.95); }
      }
    `;
    document.head.appendChild(style);
  }

  return {
    show,
    showError,
    showInfo,
    showLocation,
    remove,
  };
}