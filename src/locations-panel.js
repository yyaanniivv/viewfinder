/**
 * Locations Panel module for Viewfinder
 * Handles location list, forms, add/edit/delete operations
 */

import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS, LOCATION_TYPES, getTypeEmoji } from './storage.js';
import { haversineDistance, formatDistance } from './geo.js';
import { initToasts } from './toasts.js';

/**
 * Initialize locations panel
 * @param {Object} deps - Dependencies
 * @param {HTMLElement} deps.locationsPanel - Locations panel element
 * @param {HTMLElement} deps.locationList - Location list container
 * @param {HTMLElement} deps.locationForm - Location form element
 * @param {HTMLElement} deps.locationFormContainer - Location form container
 * @param {HTMLElement} deps.addLocationBtn - Add location button
 * @param {HTMLElement} deps.locCancelBtn - Cancel button
 * @param {HTMLElement} deps.locColorSwatches - Color swatches container
 * @param {HTMLElement} deps.locTypeSelect - Location type select
 * @param {HTMLElement} deps.locationCountEl - Location count element
 * @param {HTMLElement} deps.minimizeLocationsBtn - Minimize button
 * @param {HTMLElement} deps.maximizeLocationsBtn - Maximize button
 * @param {Function} [deps.debug] - Debug logging function
 * @param {Function} [deps.updateViewportForPanels] - Callback to update viewport
 * @param {Function} [deps.onTrackedLocationChange] - Callback when tracked location changes
 * @param {Function} [deps.getUserPosition] - Function to get current user position
 * @returns {Object} Locations panel API
 */
export function initLocationsPanel(deps) {
  const {
    locationsPanel,
    locationList,
    locationForm,
    locationFormContainer,
    addLocationBtn,
    locCancelBtn,
    locColorSwatches,
    locTypeSelect,
    locationCountEl,
    minimizeLocationsBtn,
    maximizeLocationsBtn,
    debug = console.log,
    updateViewportForPanels,
    onTrackedLocationChange,
    getUserPosition,
  } = deps;

  // State
  let locations = [];
  let isMinimized = true;

  // Toast for user feedback
  const { showInfo, showLocation } = initToasts({ debug });

  /**
   * Render location list
   */
  function renderLocationList() {
    updateLocationCount();

    if (!locationList) return;

    if (locations.length === 0) {
      locationList.innerHTML = '<p class="empty">No locations. Tap "Add Location" to start.</p>';
      return;
    }

    renderEyeList(locationList);
  }

  /**
   * Update location count display
   */
  function updateLocationCount() {
    if (locationCountEl) {
      const visible = locations.filter(l => !l.hidden).length;
      const total = locations.length;
      locationCountEl.textContent = `${visible}/${total}`;
    }
  }

  /**
   * Render location list with eye toggle (shown/hidden sections)
   * @param {HTMLElement} list - List element
   */
  function renderEyeList(list) {
    const shown = locations.filter(l => !l.hidden);
    const hidden = locations.filter(l => l.hidden);

    const itemHTML = (loc, isHidden) => `
      <div class="location-item ${isHidden ? 'location-hidden' : ''}" data-id="${loc.id}">
        <div class="location-info">
          <span class="location-color" style="background: ${loc.color}"></span>
          <div class="location-details">
            <span class="location-name">${loc.name}</span>
            <span class="location-meta">
              ${loc.type ? `<span class="type-emoji">${getTypeEmoji(loc.type)}</span>` : ''}
              ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}
            </span>
          </div>
        </div>
        <div class="location-actions">
          <button class="icon-btn visibility-btn" data-id="${loc.id}" aria-label="${isHidden ? 'Show on overlay' : 'Hide from overlay'}">${isHidden ? '🚫' : '👁️'}</button>
          <button class="icon-btn edit-btn" data-id="${loc.id}">✏️</button>
          <button class="icon-btn delete-btn" data-id="${loc.id}">🗑️</button>
        </div>
      </div>
    `;

    let html = '';
    if (hidden.length > 0) {
      html += `<div class="picker-section-label">Visible (${shown.length})</div>`;
      html += shown.map(l => itemHTML(l, false)).join('');
      html += `<div class="picker-section-label">Hidden (${hidden.length})</div>`;
      html += hidden.map(l => itemHTML(l, true)).join('');
    } else {
      html += shown.map(l => itemHTML(l, false)).join('');
    }
    list.innerHTML = html;

    attachLocationListEvents(list);
  }

  /**
   * Attach event listeners to location list items
   * @param {HTMLElement} list - List element
   */
  function attachLocationListEvents(list) {
    // Visibility toggle
    list.querySelectorAll('.visibility-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLocationHidden(e.currentTarget.dataset.id);
      });
    });

    // Edit button
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editLocation(e.currentTarget.dataset.id);
      });
    });

    // Delete button
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLocation(e.currentTarget.dataset.id);
      });
    });

    // Select location (click on info area)
    list.querySelectorAll('.location-info').forEach(info => {
      info.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.closest('.location-item').dataset.id;
        selectLocation(id);
      });
    });
  }

  /**
   * Toggle location hidden state
   * @param {string} id - Location ID
   */
  function toggleLocationHidden(id) {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;
    setHidden(id, !loc.hidden);
  }

  /**
   * Set location hidden state
   * @param {string} id - Location ID
   * @param {boolean} isHidden - Whether to hide
   */
  function setHidden(id, isHidden) {
    const loc = locations.find(l => l.id === id);
    if (!loc || loc.hidden === isHidden) return;
    loc.hidden = isHidden;
    saveLocations(locations);
    renderLocationList();
    debug(`${loc.name} ${isHidden ? 'hidden from' : 'shown on'} overlay`);
  }

  /**
   * Edit a location
   * @param {string} id - Location ID
   */
  function editLocation(id) {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;

    locationForm.dataset.editId = id;
    document.getElementById('loc-name').value = loc.name;
    document.getElementById('loc-lat').value = loc.lat;
    document.getElementById('loc-lon').value = loc.lon;
    document.getElementById('loc-type').value = loc.type || 'custom';

    showLocationForm();
    markSelectedSwatch(loc.color);
  }

  /**
   * Delete a location
   * @param {string} id - Location ID
   */
  function deleteLocation(id) {
    if (confirm('Delete this location?')) {
      locations = locations.filter(l => l.id !== id);
      saveLocations(locations);
      renderLocationList();
      updateLocationCount();
    }
  }

  /**
   * Select a location (track it for bearing)
   * @param {string} id - Location ID
   */
  function selectLocation(id) {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;

    // Track the selected location (bearing shown in Current Location overlay)
    onTrackedLocationChange?.(loc.id);

    // Show toast with location details
    const userPosition = getUserPosition?.();
    const distance = userPosition
      ? formatDistance(haversineDistance(userPosition, loc))
      : '—';
    showLocation(loc, distance);
  }

  /**
   * Show location form
   */
  function showLocationForm() {
    if (locationFormContainer) {
      locationFormContainer.style.display = 'block';
    }
  }

  /**
   * Hide location form
   */
  function hideLocationForm() {
    if (locationFormContainer) {
      locationFormContainer.style.display = 'none';
    }
    if (locationForm) {
      locationForm.reset();
    }
    delete locationForm?.dataset.editId;
  }

  /**
   * Set up location form event listeners
   */
  function setupLocationForm() {
    if (!locationForm) return;

    // Swatch picker: click sets the hidden color input and highlights the selected swatch
    if (locColorSwatches) {
      locColorSwatches.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-swatch');
        if (!btn) return;
        document.getElementById('loc-color').value = btn.dataset.color;
        locColorSwatches.querySelectorAll('.color-swatch').forEach(b =>
          b.classList.toggle('selected', b === btn)
        );
      });
    }

    // Form submit
    locationForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = locationForm.dataset.editId;

      const lat = parseFloat(document.getElementById('loc-lat').value);
      const lon = parseFloat(document.getElementById('loc-lon').value);

      if (isNaN(lat) || isNaN(lon)) {
        alert('Invalid coordinates');
        return;
      }

      let color = document.getElementById('loc-color').value;
      if (!color) {
        // Default for a new location opened without swatch selection
        color = getNextColor(locations);
      }

      const locData = {
        name: document.getElementById('loc-name').value.trim(),
        lat,
        lon,
        color,
        type: document.getElementById('loc-type').value,
      };

      if (editId) {
        const idx = locations.findIndex(l => l.id === editId);
        if (idx >= 0) {
          locations[idx] = { ...locations[idx], ...locData };
        }
      } else {
        locData.id = generateId();
        locations.push(locData);
      }

      saveLocations(locations);
      renderLocationList();
      updateLocationCount();
      hideLocationForm();
    });

    // Cancel button
    if (locCancelBtn) {
      locCancelBtn.addEventListener('click', hideLocationForm);
    }

    // Add location button
    if (addLocationBtn) {
      addLocationBtn.addEventListener('click', () => {
        if (locationForm) locationForm.reset();
        delete locationForm.dataset.editId;
        showLocationForm();
        // Highlight the suggested color for the new location
        markSelectedSwatch(getNextColor(locations));
      });
    }
  }

  /**
   * Highlight the swatch matching `color`
   * @param {string} color - Color value
   */
  function markSelectedSwatch(color) {
    document.getElementById('loc-color').value = color;
    document.querySelectorAll('#loc-color-swatches .color-swatch').forEach(b =>
      b.classList.toggle('selected', b.dataset.color === color)
    );
  }

  /**
   * Show locations panel
   */
  function show() {
    if (!locationsPanel) return;
    locationsPanel.style.display = 'flex';
    locationsPanel.dataset.state = 'maximized';
    if (minimizeLocationsBtn) minimizeLocationsBtn.style.display = 'flex';
    if (maximizeLocationsBtn) maximizeLocationsBtn.style.display = 'none';
    isMinimized = false;
    localStorage.setItem('viewfinder:showLocations', 'true');
    updateViewportForPanels?.();
    debug('Locations panel shown');
  }

  /**
   * Hide locations panel
   */
  function hide() {
    if (!locationsPanel) return;
    locationsPanel.style.display = 'none';
    locationsPanel.dataset.state = 'minimized';
    if (minimizeLocationsBtn) minimizeLocationsBtn.style.display = 'none';
    if (maximizeLocationsBtn) maximizeLocationsBtn.style.display = 'flex';
    isMinimized = true;
    localStorage.setItem('viewfinder:showLocations', 'false');
    updateViewportForPanels?.();
    debug('Locations panel hidden');
  }

  /**
   * Toggle locations panel visibility
   */
  function toggle() {
    if (isMinimized) {
      show();
    } else {
      hide();
    }
  }

  /**
   * Load persisted state from localStorage
   */
  function loadPersistedState() {
    const showLocations = localStorage.getItem('viewfinder:showLocations');
    if (showLocations !== null) {
      const show = showLocations === 'true';
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

  /**
   * Initialize the panel with locations
   * @param {Array} locs - Locations array
   */
  function setLocations(locs) {
    locations = locs;
    renderLocationList();
  }

  /**
   * Add locations (e.g., sample locations)
   * @param {Array} locs - Locations to add
   */
  function addLocations(locs) {
    locations = locations.concat(locs);
    renderLocationList();
  }

  /**
   * Get current locations
   * @returns {Array} Locations array
   */
  function getLocationsArray() {
    return locations;
  }

  // Set up event listeners for panel controls
  if (minimizeLocationsBtn) {
    minimizeLocationsBtn.addEventListener('click', hide);
  }
  if (maximizeLocationsBtn) {
    maximizeLocationsBtn.addEventListener('click', show);
  }

  // Initialize form
  setupLocationForm();

  // Populate color swatches
  if (locColorSwatches) {
    locColorSwatches.innerHTML = LOCATION_COLORS.map(c =>
      `<button type="button" class="color-swatch" data-color="${c}" style="background: ${c}" aria-label="Color ${c}"></button>`
    ).join('');
  }

  // Populate type select
  if (locTypeSelect) {
    locTypeSelect.innerHTML = LOCATION_TYPES.map(t =>
      `<option value="${t.value}">${t.emoji} ${t.label}</option>`
    ).join('');
  }

  // Load initial state
  loadPersistedState();

  return {
    show,
    hide,
    toggle,
    setLocations,
    addLocations,
    getLocationsArray,
    renderLocationList,
    updateLocationCount,
    loadPersistedState,
    isMinimized: () => isMinimized,
  };
}