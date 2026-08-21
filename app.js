/**
 * TAM DELIVERY MANAGEMENT SYSTEM - Frontend Application
 * Connects to Google Apps Script backend API
 */

// ==================== CONFIGURATION ====================
const API_CONFIG = {
  // Google Apps Script deployment URL - Using /exec endpoint (not /usercache)
  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbyxIQBzgYKhaK-zlDNuzYdFweDmOM0c8Clg26JwZhlLVffRbavmqBze-xfOOTgAnq0C/exec'
};

// Display backend URL on page
document.addEventListener('DOMContentLoaded', () => {
  const backendUrlSpan = document.getElementById('drive-backend-url');
  if (backendUrlSpan) {
    backendUrlSpan.textContent = API_CONFIG.BACKEND_URL;
  }
});

// Global state
let globalData = {
  opsData: [],
  exportTypeFilter: 'ALL',
  driveFolderName: 'Export Docs',
  allDeliveries: [],
  exportDeliveries: [],
  localDeliveries: [],
  completedDeliveries: [],
  currentSelectedRO: null
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Make API call to Google Apps Script backend
 */
async function callBackend(action, params = {}) {
  try {
    // Build the URL with proper query parameters
    const url = new URL(API_CONFIG.BACKEND_URL);
    
    // Add action parameter
    if (action) {
      url.searchParams.append('action', action);
    }
    
    // Add all other parameters
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    // Add JSONP callback for cross-origin requests
    const callbackName = 'jsonpCallback_' + Math.random().toString(36).substr(2, 9);
    url.searchParams.append('callback', callbackName);

    console.log('🔗 Calling backend:', url.toString());

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let timeoutId;

      // Set timeout for request
      timeoutId = setTimeout(() => {
        delete window[callbackName];
        try {
          document.head.removeChild(script);
        } catch (e) {}
        reject(new Error('Backend request timeout (15s)'));
      }, 15000); // 15 second timeout

      // Setup callback
      window[callbackName] = (response) => {
        clearTimeout(timeoutId);
        delete window[callbackName];
        try {
          document.head.removeChild(script);
        } catch (e) {}
        console.log('✅ Backend response:', response);
        resolve(response);
      };

      // Handle script load error
      script.onerror = () => {
        clearTimeout(timeoutId);
        delete window[callbackName];
        try {
          document.head.removeChild(script);
        } catch (e) {}
        console.error('❌ Script load error for action:', action);
        reject(new Error('Backend request failed - script load error. Check console for CORS issues.'));
      };

      // Set script source and append
      script.src = url.toString();
      script.async = true;
      document.head.appendChild(script);
    });
  } catch (err) {
    console.error('❌ Backend call error:', err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Format timestamp for display
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
  const statusUpper = (status || '').toUpperCase();
  if (statusUpper === 'PENDING') {
    return '<span class="status-badge bg-pending">⏳ Pending</span>';
  } else if (statusUpper === 'IN-PROGRESS') {
    return '<span class="status-badge bg-progress">🔄 In Progress</span>';
  } else if (statusUpper === 'COMPLETE') {
    return '<span class="status-badge" style="background: #d4edda; color: #155724; border-color: #c3e6cb;">✅ Complete</span>';
  }
  return `<span class="status-badge">${statusUpper}</span>`;
}

function getInvoiceBadgeClass(status) {
  const s = (status || '').toUpperCase();
  if (s === 'PROCESSED' || s === 'RECEIVED') return 'bg-success';
  return 'bg-warning text-dark';
}

function getCusdecBadgeClass(status) {
  const s = (status || '').toUpperCase();
  if (s === 'APPROVED') return 'bg-success';
  if (s === 'REJECTED') return 'bg-danger';
  return 'bg-warning text-dark';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toastHTML = `
    <div class="toast-notification" style="
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      z-index: 9999;
      animation: slideIn 0.3s ease-in-out;
      background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    ">
      ${message}
    </div>
  `;
  const container = document.body;
  const div = document.createElement('div');
  div.innerHTML = toastHTML;
  container.appendChild(div.firstElementChild);
  
  setTimeout(() => {
    const toast = container.querySelector('.toast-notification');
    if (toast) toast.remove();
  }, 3000);
}

// ==================== INITIALIZATION & REFRESH ====================

/**
 * Initialize the application
 */
async function initApp() {
  console.log('🚀 Initializing TAM Dashboard...');
  console.log('📍 Backend URL:', API_CONFIG.BACKEND_URL);
  
  await refreshAll();
  
  // Update motion ribbon
  updateMotionRibbon();
  
  // Setup periodic refresh (every 5 minutes)
  setInterval(() => {
    console.log('🔄 Auto-refreshing data...');
    refreshAll();
  }, 5 * 60 * 1000);
}

/**
 * Refresh all dashboard data
 */
async function refreshAll() {
  const loadingIcon = document.getElementById('refresh-icon');
  if (loadingIcon) {
    loadingIcon.classList.add('refresh-spin');
  }

  try {
    console.log('📡 Fetching operational data from backend...');
    
    // Fetch operational data with empty action (default handler)
    const response = await callBackend('', {});
    console.log('📊 Response received:', response);

    // Validate that response.opsData exists and is strictly an Array
    if (response && response.opsData && Array.isArray(response.opsData.rows)) {
    globalData.opsData = response.opsData.rows;
      
      console.log('✅ Data loaded. Total rows:', globalData.opsData.length);
      
      // Separate into categories safely
      globalData.allDeliveries = globalData.opsData;
      globalData.exportDeliveries = globalData.opsData.filter(r => 
        ['LCL', 'FCL', 'AIR', 'CONSOLE', 'COURIER'].includes(r.TYPE_VALUE)
      );
      globalData.localDeliveries = globalData.opsData.filter(r => r.TYPE_VALUE === 'LOCAL');
      globalData.completedDeliveries = globalData.opsData.filter(r => r.STATUS_CLEAN === 'COMPLETE');
      
      console.log('📈 Breakdown - Export:', globalData.exportDeliveries.length, 'Local:', globalData.localDeliveries.length, 'Completed:', globalData.completedDeliveries.length);
      
      // Render all sections
      renderPendingDeliveries();
      renderExportDeliveries();
      renderLocalDeliveries();
      updateMotionRibbon();
      
      // Update last updated timestamp
      const lastUpdated = document.getElementById('last-updated');
      if (lastUpdated) {
        lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleString();
      }
    } else {
      console.warn('⚠️ Invalid or missing opsData array in response:', response);
      
      // Clear local state to prevent displaying stale/corrupted data
      globalData.opsData = [];
      globalData.allDeliveries = [];
      globalData.exportDeliveries = [];
      globalData.localDeliveries = [];
      globalData.completedDeliveries = [];
      
      showToast('⚠️ No valid operational data received from backend', 'warning');
    }
  } catch (err) {
    console.error('❌ Refresh error:', err);
    showToast('Failed to refresh data: ' + err.message, 'error');
  } finally {
    // Always stop the refresh animation
    if (loadingIcon) {
      loadingIcon.classList.remove('refresh-spin');
    }
  }
}

/**
 * Test backend connection
 */
async function testDriveBackend() {
  try {
    console.log('🧪 Testing backend connection...');
    const response = await callBackend('testConnection', {});
    console.log('Test response:', response);
    
    if (response && response.status === 'success') {
      showToast('✅ Backend is working!', 'success');
    } else {
      showToast('❌ Backend connection failed: ' + (response?.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    console.error('Test error:', err);
    showToast('❌ Cannot reach backend: ' + err.message, 'error');
  }
}

// ==================== DELIVERY RENDERING ====================

/**
 * Render all pending/active deliveries
 */
function renderPendingDeliveries() {
  const container = document.getElementById('pending-container');
  if (!container) return;

  const data = globalData.allDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');
  
  if (data.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No active deliveries</p></div>';
    document.getElementById('pending-badge').textContent = '0';
    return;
  }

  let html = '';
  data.forEach(row => {
    const isProgress = row.STATUS_CLEAN === 'IN-PROGRESS';
    const rowClass = isProgress ? 'progress-row' : 'pending-row';
    
    html += `
      <div class="${rowClass} p-3" onclick="openItemModal('${row.RO_VALUE}')">
        <div class="row align-items-center g-2">
          <div class="col-md-2">
            <strong class="text-dark">${row.RO_VALUE}</strong>
            <br>
            ${getStatusBadge(row.STATUS_CLEAN)}
          </div>
          <div class="col-md-2">
            <div class="facility-tag">${row.FACILITY_VALUE}</div>
            <small class="text-muted">${row.TYPE_VALUE}</small>
          </div>
          <div class="col-md-3">
            <strong>📍 ${row.DEST_VALUE}</strong>
            <br>
            <small class="text-muted">Vendor: ${row.VENDOR_VALUE}</small>
          </div>
          <div class="col-md-2">
            <small class="text-muted">Cutoff:</small>
            <br>
            <span class="cutoff-text">${row.CUTOFF_VALUE}</span>
          </div>
          <div class="col-md-3">
            <div class="d-flex align-items-center flex-wrap gap-1">
              <div>
                <small class="text-muted">Vehicle:</small><br>
                <strong>${row.VEHICLE || '🚗 TBA'}</strong>
                ${row.IS_GATE_OUT ? '<span class="badge bg-success ms-1" style="font-size:0.6rem;">Gate Out ✓</span>' : ''}
              </div>
            </div>
            <div class="mt-1 d-flex gap-1 flex-wrap">
              <span class="badge ${getInvoiceBadgeClass(row.INVOICE_STATUS)}" style="font-size: 0.65rem;">Inv: ${row.INVOICE_STATUS || 'PENDING'}</span>
              <span class="badge ${getCusdecBadgeClass(row.CUSDEC_STATUS)}" style="font-size: 0.65rem;">Cusdec: ${row.CUSDEC_STATUS || 'PENDING'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  document.getElementById('pending-badge').textContent = data.length;
}

/**
 * Render export deliveries with filtering
 */
function renderExportDeliveries() {
  const container = document.getElementById('bdh-container');
  if (!container) return;

  let data = globalData.exportDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');
  
  if (globalData.exportTypeFilter !== 'ALL') {
    data = data.filter(r => r.TYPE_VALUE === globalData.exportTypeFilter);
  }

  if (data.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No export deliveries</p></div>';
    document.getElementById('bdh-badge').textContent = '0';
    return;
  }

  let html = '';
  data.forEach(row => {
    html += `
      <div class="pending-row p-3 cursor-pointer" onclick="openItemModal('${row.RO_VALUE}')">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <h6 class="mb-1"><strong>${row.RO_VALUE}</strong> - ${row.DEST_VALUE}</h6>
            <small class="text-muted">Vendor: ${row.VENDOR_VALUE} | Type: ${row.TYPE_VALUE}</small>
          </div>
          ${getStatusBadge(row.STATUS_CLEAN)}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  document.getElementById('bdh-badge').textContent = data.length;
  updateExportSummary(globalData.exportDeliveries);
}

/**
 * Render local deliveries
 */
function renderLocalDeliveries() {
  const container = document.getElementById('slh-container');
  if (!container) return;

  const data = globalData.localDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');

  if (data.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No local deliveries</p></div>';
    document.getElementById('slh-badge').textContent = '0';
    return;
  }

  let html = '';
  data.forEach(row => {
    html += `
      <div class="pending-row p-3 cursor-pointer" onclick="openItemModal('${row.RO_VALUE}')">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <h6 class="mb-1"><strong>${row.RO_VALUE}</strong> - ${row.DEST_VALUE}</h6>
            <small class="text-muted">Vendor: ${row.VENDOR_VALUE}</small>
          </div>
          ${getStatusBadge(row.STATUS_CLEAN)}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  document.getElementById('slh-badge').textContent = data.length;
  updateLocalSummary(globalData.localDeliveries);
}

/**
 * Update export summary statistics
 */
/**
 * Update export summary statistics (Pending Only)
 */
function updateExportSummary(data) {
  const summary = document.getElementById('bdh-summary');
  if (!summary) return;

  // Filter to include only pending/in-progress export deliveries
  const pendingData = data.filter(r => r.STATUS_CLEAN !== 'COMPLETE');

  const typeCount = {};
  pendingData.forEach(r => {
    typeCount[r.TYPE_VALUE] = (typeCount[r.TYPE_VALUE] || 0) + 1;
  });

  let html = '<ul class="list-unstyled">';
  Object.keys(typeCount).forEach(type => {
    html += `<li>✈️ <strong>${type}:</strong> ${typeCount[type]}</li>`;
  });
  html += `<li class="mt-2"><strong>Total Pending:</strong> ${pendingData.length}</li>`;
  html += '</ul>';

  summary.innerHTML = html;
}

/**
 * Update local summary statistics
 */
function updateLocalSummary(data) {
  const summary = document.getElementById('slh-summary');
  if (!summary) return;

  const facilityCount = {};
  data.forEach(r => {
    facilityCount[r.FACILITY_VALUE] = (facilityCount[r.FACILITY_VALUE] || 0) + 1;
  });

  let html = '<ul class="list-unstyled">';
  Object.keys(facilityCount).forEach(facility => {
    html += `<li>🏭 <strong>${facility}:</strong> ${facilityCount[facility]}</li>`;
  });
  html += `<li class="mt-2"><strong>Total:</strong> ${data.length}</li>`;
  html += '</ul>';

  summary.innerHTML = html;
}

/**
 * Update motion ribbon with active deliveries
 */
function updateMotionRibbon() {
  const track = document.getElementById('ribbon-track');
  if (!track) return;

  track.innerHTML = '';
  
  const activeDeliveries = globalData.allDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');
  
  if (activeDeliveries.length === 0) {
    const div = document.createElement('div');
    div.className = 'ribbon-item';
    div.textContent = '✓ All deliveries complete!';
    track.appendChild(div);
    return;
  }

  // Duplicate for smooth scrolling
  const items = activeDeliveries.slice(0);
  if (items.length < 6) items.push(...activeDeliveries.slice(0, 6 - items.length));

  items.forEach(d => {
    const div = document.createElement('div');
    div.className = 'ribbon-item';
    const parts = [];
    if (d.RO_VALUE) parts.push('📋 ' + d.RO_VALUE);
    if (d.COL_8) parts.push('📑 ' + d.COL_8);
    if (d.VEHICLE) parts.push('🚚 ' + d.VEHICLE);
    if (d.DEST_VALUE) parts.push('📍 ' + d.DEST_VALUE);
    div.textContent = parts.length ? parts.join(' • ') : '• In transit';
    track.appendChild(div);
  });
}

// ==================== MODAL OPERATIONS ====================

/**
 * Open item details modal
 */
function openItemModal(roNumber) {
  const row = globalData.opsData.find(r => r.RO_VALUE === roNumber);
  if (!row) {
    showToast('RO not found', 'error');
    return;
  }

  globalData.currentSelectedRO = roNumber;

  // Populate modal fields
  document.getElementById('modalTitle').textContent = `Order Details - ${roNumber}`;
  document.getElementById('edit-dest').value = row.DEST_VALUE || '';
  document.getElementById('edit-vendor').value = row.VENDOR_VALUE || '';
  document.getElementById('edit-shiptype').value = row.TYPE_VALUE || 'LCL';
  document.getElementById('edit-facility').value = row.FACILITY_VALUE || 'VN';
  document.getElementById('edit-invoice').value = row.INVOICE_STATUS || 'PENDING';
  document.getElementById('edit-cusdec-status').value = row.CUSDEC_STATUS || 'PENDING';
  document.getElementById('edit-cusdec-no').value = row.COL_8 || '';
  document.getElementById('edit-note').value = row.NOTE_VALUE || '';
  document.getElementById('edit-cutoff').value = row.CUTOFF_VALUE || '';
  document.getElementById('edit-loading-status').value = row.STATUS_CLEAN || 'PENDING';

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('itemModal'));
  modal.show();
}

/**
 * Submit order update
 */
async function submitUpdate() {
  const pin = document.getElementById('edit-staff-pin').value;
  
  if (!pin) {
    showToast('Staff PIN is required', 'error');
    return;
  }

  const params = {
    pin: pin,
    ro: globalData.currentSelectedRO,
    dest: document.getElementById('edit-dest').value,
    vendor: document.getElementById('edit-vendor').value,
    shipType: document.getElementById('edit-shiptype').value,
    facility: document.getElementById('edit-facility').value,
    invoicePl: document.getElementById('edit-invoice').value,
    cusdecStatus: document.getElementById('edit-cusdec-status').value,
    cusdecNo: document.getElementById('edit-cusdec-no').value,
    note: document.getElementById('edit-note').value,
    cutoff: document.getElementById('edit-cutoff').value,
    loading: document.getElementById('edit-loading-status').value
  };

  try {
    const response = await callBackend('updateRO', params);
    
    if (response.status === 'success') {
      showToast('✅ Order updated successfully', 'success');
      document.getElementById('staff-pin').value = '';
      await refreshAll();
      bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
    } else {
      showToast('❌ ' + (response.message || 'Update failed'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/**
 * Open new order modal
 */
function openNewOrderModal() {
  // Assuming your HTML has a modal with the ID 'newOrderModal'
  const modalEl = document.getElementById('newOrderModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  } else {
    showToast('New order form is not available in the HTML yet.', 'error');
  }
}

/**
 * Add a new item row to the New Order modal
 */
function addOrderItemRow() {
  const container = document.getElementById('items-container');
  const row = document.createElement('div');
  row.className = 'row g-2 item-row mb-3 pb-3 border-bottom position-relative';
  
  row.innerHTML = `
    <div class="col-md-3">
      <input type="text" class="form-control form-control-sm item-product" placeholder="Product Code">
    </div>
    <div class="col-md-4">
      <input type="text" class="form-control form-control-sm item-desc" placeholder="Brief description">
    </div>
    <div class="col-md-2">
      <input type="number" class="form-control form-control-sm item-qty" placeholder="0">
    </div>
    <div class="col-md-2">
      <input type="number" class="form-control form-control-sm item-ctns" placeholder="0">
    </div>
    <div class="col-md-2 mt-2">
      <input type="text" class="form-control form-control-sm item-loc" placeholder="VN">
    </div>
    <div class="col-md-1 mt-2 text-end">
      <button type="button" class="btn btn-sm btn-danger text-white mt-4" onclick="this.closest('.item-row').remove()">🗑️</button>
    </div>
  `;
  container.appendChild(row);
}

async function submitNewOrder() {
  const pin = document.getElementById('staff-pin').value;
  if (!pin) {
    showToast('Staff PIN is required', 'error');
    return;
  }

  // Gather all items from the dynamic rows
  const itemRows = document.querySelectorAll('.item-row');
  const itemsArray = [];
  
  itemRows.forEach(row => {
    const product = row.querySelector('.item-product').value;
    // Only add if the product code isn't blank
    if (product.trim() !== '') {
      itemsArray.push({
        product: product,
        desc: row.querySelector('.item-desc').value,
        qty: row.querySelector('.item-qty').value || 0,
        ctns: row.querySelector('.item-ctns').value || 0,
        loc: row.querySelector('.item-loc').value
      });
    }
  });

  if (itemsArray.length === 0) {
    showToast('Please add at least one product to the order.', 'warning');
    return;
  }

  const params = {
    pin: pin,
    ro: document.getElementById('new-ro').value,
    vendor: document.getElementById('new-vendor').value,
    dest: document.getElementById('new-dest').value,
    market: document.getElementById('new-market').value,
    items: JSON.stringify(itemsArray) // Send the full array to the backend
  };

  try {
    const response = await callBackend('addNewOrder', params);
    
    if (response && response.status === 'success') {
      showToast('✅ Order added successfully', 'success');
      document.getElementById('staff-pin').value = ''; 
      
      // Reset items container to just one blank row for the next order
      const container = document.getElementById('items-container');
      const firstRow = container.querySelector('.item-row').cloneNode(true);
      // Clear values in cloned row
      firstRow.querySelectorAll('input').forEach(input => input.value = '');
      container.innerHTML = '';
      container.appendChild(firstRow);
      
      await refreshAll(); 
      bootstrap.Modal.getInstance(document.getElementById('newOrderModal')).hide();
    } else {
      showToast('❌ ' + (response.message || 'Failed to add order'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/**
 * Open completed shipments modal
 */
async function openCompleteShipmentsModal() {
  try {
    const response = await callBackend('getCompleted', {});
    
    if (response && Array.isArray(response)) {
      const completedData = response;
      
      let html = `
        <div class="modal fade" id="completeReportModal" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header bg-success text-white">
                <h5 class="modal-title">✅ Completed Shipments</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <table class="table table-sm table-hover">
                  <thead class="table-light">
                    <tr>
                      <th>RO</th>
                      <th>Destination</th>
                      <th>Type</th>
                      <th>Complete Time</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
      `;
      
      completedData.forEach(row => {
        html += `
          <tr>
            <td><strong>${row.RO_VALUE}</strong></td>
            <td>${row.DEST_VALUE}</td>
            <td>${row.TYPE_VALUE}</td>
            <td>${formatDateTime(row.COMPLETE_TIME_RAW)}</td>
            <td>${row.DURATION || 'N/A'}</td>
          </tr>
        `;
      });
      
      html += `
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', html);
      const modal = new bootstrap.Modal(document.getElementById('completeReportModal'));
      modal.show();
    }
  } catch (err) {
    showToast('Failed to load completed shipments', 'error');
  }
}

/**
 * Export data to Excel
 */
function exportToExcel() {
  const data = globalData.opsData.map(row => ({
    'RO': row.RO_VALUE,
    'Destination': row.DEST_VALUE,
    'Vendor': row.VENDOR_VALUE,
    'Type': row.TYPE_VALUE,
    'Facility': row.FACILITY_VALUE,
    'Status': row.STATUS_CLEAN,
    'Cutoff': row.CUTOFF_VALUE,
    'Vehicle': row.VEHICLE,
    'Note': row.NOTE_VALUE
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Deliveries');
  XLSX.writeFile(wb, 'TAM_Deliveries_' + new Date().toISOString().split('T')[0] + '.xlsx');
  
  showToast('✅ Excel file exported', 'success');
}

// ==================== FILTER FUNCTIONS ====================

/**
 * Set export type filter
 */
function setExportTypeFilter(type) {
  globalData.exportTypeFilter = type;
  
  // Update button states
  document.querySelectorAll('.export-filter-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline-primary');
  });
  document.querySelector(`[data-type="${type}"]`).classList.remove('btn-outline-primary');
  document.querySelector(`[data-type="${type}"]`).classList.add('btn-primary');
  
  renderExportDeliveries();
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// ==================== DRIVE/FILE OPERATIONS ====================

/**
 * Set active drive folder
 */
function setDriveFolder(folderName) {
  globalData.driveFolderName = folderName;
  loadDriveTabFiles(folderName);
}

/**
 * Load drive files
 */
async function loadDriveTabFiles(folderName = 'Export Docs') {
  try {
    const action = folderName === 'RO' ? 'getROFiles' : 'getExportDocs';
    const response = await callBackend(action, {});
    
    if (response.success && response.files) {
      renderDriveFiles(response.files);
    }
  } catch (err) {
    showToast('Failed to load files', 'error');
  }
}

/**
 * Render drive files
 */
function renderDriveFiles(files) {
  const container = document.getElementById('drive-files-container');
  if (!container || !Array.isArray(files)) return;

  if (files.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No files in this folder</p></div>';
    return;
  }

  let html = '<div class="list-group">';
  files.forEach(file => {
    html += `
      <a href="${file.url}" target="_blank" class="list-group-item list-group-item-action p-2 small">
        <div class="d-flex justify-content-between">
          <strong>📄 ${file.name}</strong>
          <small class="text-muted">${file.sizeText}</small>
        </div>
        <small class="text-muted">${file.dateText}</small>
      </a>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
}

/**
 * Upload file to drive
 */
async function uploadDriveFile() {
  const fileInput = document.getElementById('drive-upload-file');
  const folderSelect = document.getElementById('drive-upload-folder');
  
  if (!fileInput.files[0]) {
    showToast('Please select a file', 'error');
    return;
  }

  const file = fileInput.files[0];
  const folderName = folderSelect.value;

  // Read file as base64
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const base64 = e.target.result.split(',')[1];
      const response = await callBackend('uploadFile', {
        folderName: folderName,
        fileName: file.name,
        mimeType: file.type,
        base64Data: base64
      });

      if (response.status === 'success') {
        showToast('✅ File uploaded successfully', 'success');
        fileInput.value = '';
        loadDriveTabFiles(folderName);
      } else {
        showToast('❌ ' + (response.message || 'Upload failed'), 'error');
      }
    } catch (err) {
      showToast('Upload error: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

/**
 * Share drive file
 */
async function shareDriveFile() {
  const fileId = document.getElementById('drive-share-file-id').value;
  const email = document.getElementById('drive-share-email').value;
  const role = document.getElementById('drive-share-role').value;

  if (!fileId || !email) {
    showToast('File ID and email are required', 'error');
    return;
  }

  try {
    const response = await callBackend('shareDriveFile', {
      fileId: fileId,
      email: email,
      role: role
    });

    if (response.status === 'success') {
      showToast('✅ File shared successfully with ' + email, 'success');
    } else {
      showToast('❌ ' + (response.message || 'Share failed'), 'error');
    }
  } catch (err) {
    showToast('Share error: ' + err.message, 'error');
  }
}

/**
 * Download selected drive file
 */
function downloadSelectedDriveFile() {
  const fileId = document.getElementById('drive-share-file-id').value;
  if (!fileId) {
    showToast('Please enter a file ID', 'error');
    return;
  }
  window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank');
}

/**
 * Search files
 */
async function onDriveSearch() {
  const query = document.getElementById('drive-search-input').value;
  if (!query || query.length < 2) {
    loadDriveTabFiles(globalData.driveFolderName);
    return;
  }

  try {
    const response = await callBackend('searchFiles', { query: query });
    if (response.status === 'success' && response.results) {
      renderDriveFiles(response.results);
    }
  } catch (err) {
    showToast('Search error: ' + err.message, 'error');
  }
}

/**
 * Open vehicle details modal
 */
function openVehicleModal() {
  showToast('Vehicle details modal - Implementation required', 'info');
}

// ==================== INITIALIZE ON LOAD ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM Content Loaded - Starting app initialization');
  
  // Restore dark mode preference
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }

  // Initialize app
  initApp();

  // Load initial drive files
  loadDriveTabFiles('Export Docs');
});

console.log('✅ app.js loaded successfully');
