/**
 * TAM DELIVERY MANAGEMENT SYSTEM - Frontend Application
 * Connects to Google Apps Script backend API
 */

// ==================== CONFIGURATION ====================
const API_CONFIG = {
  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbw-IIIBhtB5UcG_81D6C6nbFqu5JKgyOiPeuQyhMZzpuqQ3VLrwZtopovyTuZ9zteeh/exec'
};

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

async function callBackend(action, params = {}) {
  try {
    const url = new URL(API_CONFIG.BACKEND_URL);
    if (action) url.searchParams.append('action', action);
    
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    const callbackName = 'jsonpCallback_' + Math.random().toString(36).substr(2, 9);
    url.searchParams.append('callback', callbackName);

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let timeoutId = setTimeout(() => {
        delete window[callbackName];
        try { document.head.removeChild(script); } catch (e) {}
        reject(new Error('Backend request timeout (15s)'));
      }, 15000);

      window[callbackName] = (response) => {
        clearTimeout(timeoutId);
        delete window[callbackName];
        try { document.head.removeChild(script); } catch (e) {}
        resolve(response);
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        delete window[callbackName];
        try { document.head.removeChild(script); } catch (e) {}
        reject(new Error('Backend request failed - script load error.'));
      };

      script.src = url.toString();
      script.async = true;
      document.head.appendChild(script);
    });
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
}

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

function showToast(message, type = 'info') {
  const toastHTML = `
    <div class="toast-notification" style="
      position: fixed; top: 20px; right: 20px; padding: 15px 20px;
      border-radius: 8px; color: white; z-index: 9999;
      background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    ">${message}</div>`;
  const div = document.createElement('div');
  div.innerHTML = toastHTML;
  document.body.appendChild(div.firstElementChild);
  setTimeout(() => {
    const toast = document.querySelector('.toast-notification');
    if (toast) toast.remove();
  }, 3000);
}

// ==================== INITIALIZATION & REFRESH ====================

async function initApp() {
  await refreshAll();
  updateMotionRibbon();
  setInterval(() => { refreshAll(); }, 5 * 60 * 1000);
}

async function refreshAll() {
  const loadingIcon = document.getElementById('refresh-icon');
  if (loadingIcon) loadingIcon.classList.add('refresh-spin');

  try {
    const response = await callBackend('', {});
    if (response && response.opsData && Array.isArray(response.opsData.rows)) {
      globalData.opsData = response.opsData.rows;
      globalData.allDeliveries = globalData.opsData;
      globalData.exportDeliveries = globalData.opsData.filter(r => ['LCL', 'FCL', 'AIR', 'CONSOLE', 'COURIER'].includes(r.TYPE_VALUE));
      globalData.localDeliveries = globalData.opsData.filter(r => r.TYPE_VALUE === 'LOCAL');
      globalData.completedDeliveries = globalData.opsData.filter(r => r.STATUS_CLEAN === 'COMPLETE');
      
      renderPendingDeliveries();
      renderExportDeliveries();
      renderLocalDeliveries();
      updateMotionRibbon();
      
      const lastUpdated = document.getElementById('last-updated');
      if (lastUpdated) lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleString();
    } else {
      globalData.opsData = [];
      globalData.allDeliveries = [];
      globalData.exportDeliveries = [];
      globalData.localDeliveries = [];
      globalData.completedDeliveries = [];
      showToast('⚠️ No valid operational data received from backend', 'warning');
    }
  } catch (err) {
    showToast('Failed to refresh data: ' + err.message, 'error');
  } finally {
    if (loadingIcon) loadingIcon.classList.remove('refresh-spin');
  }
}

// ==================== SEARCH & DELIVERIES RENDERING ====================

function handleSearch() {
  renderPendingDeliveries();
  renderExportDeliveries();
  renderLocalDeliveries();
}

function passesSearchFilter(row, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  return (
    (row.RO_VALUE && String(row.RO_VALUE).toLowerCase().includes(q)) ||
    (row.DEST_VALUE && String(row.DEST_VALUE).toLowerCase().includes(q)) ||
    (row.VENDOR_VALUE && String(row.VENDOR_VALUE).toLowerCase().includes(q)) ||
    (row.VEHICLE && String(row.VEHICLE).toLowerCase().includes(q)) ||
    (row.COL_8 && String(row.COL_8).toLowerCase().includes(q)) ||
    (row.CONTAINER_NO && String(row.CONTAINER_NO).toLowerCase().includes(q))
  );
}

function renderPendingDeliveries() {
  const container = document.getElementById('pending-container');
  if (!container) return;

  const searchQuery = (document.getElementById('search-input')?.value || '').trim();

  let data = globalData.allDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');
  data = data.filter(r => passesSearchFilter(r, searchQuery));

  if (data.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No matching active deliveries found</p></div>';
    document.getElementById('pending-badge').textContent = '0';
    return;
  }

  let html = '';
  data.forEach(row => {
    const isProgress = row.STATUS_CLEAN === 'IN-PROGRESS';
    const rowClass = isProgress ? 'progress-row' : 'pending-row';

    html += `
      <div class="${rowClass} p-3 mb-2" onclick="openItemModal('${row.RO_VALUE}')">
        <div class="row align-items-center g-2">
          <div class="col-md-2">
            <strong class="text-dark">${row.RO_VALUE}</strong><br>
            ${getStatusBadge(row.STATUS_CLEAN)}
          </div>
          <div class="col-md-2">
            <div class="facility-tag">${row.FACILITY_VALUE}</div>
            <small class="text-muted">${row.TYPE_VALUE}</small>
          </div>
          <div class="col-md-3">
            <strong>📍 ${row.DEST_VALUE}</strong><br>
            <small class="text-muted">Vendor: ${row.VENDOR_VALUE}</small>
          </div>
          <div class="col-md-2">
            <small class="text-muted">Cutoff:</small><br>
            <span class="cutoff-text">${row.CUTOFF_VALUE}</span>
          </div>
          <div class="col-md-3">
            <small class="text-muted">Vehicle Details:</small><br>
            <strong>
              ${row.VEHICLE ? `${row.VEHICLE} ${row.CONTAINER_NO ? '| ' + row.CONTAINER_NO : ''}` : '🚗 TBA'}
            </strong>
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

function renderExportDeliveries() {
  const container = document.getElementById('bdh-container');
  if (!container) return;

  const searchQuery = (document.getElementById('search-input')?.value || '').trim();

  let data = globalData.exportDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');
  if (globalData.exportTypeFilter !== 'ALL') {
    data = data.filter(r => r.TYPE_VALUE === globalData.exportTypeFilter);
  }
  data = data.filter(r => passesSearchFilter(r, searchQuery));

  if (data.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No matching export deliveries found</p></div>';
    document.getElementById('bdh-badge').textContent = '0';
    return;
  }

  let html = '';
  data.forEach(row => {
    html += `
      <div class="pending-row p-3 cursor-pointer mb-2" onclick="openItemModal('${row.RO_VALUE}')">
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

function renderLocalDeliveries() {
  const container = document.getElementById('slh-container');
  if (!container) return;

  const searchQuery = (document.getElementById('search-input')?.value || '').trim();
  let data = globalData.localDeliveries.filter(r => r.STATUS_CLEAN !== 'COMPLETE');
  data = data.filter(r => passesSearchFilter(r, searchQuery));

  if (data.length === 0) {
    container.innerHTML = '<div class="text-center text-muted mt-5"><p>No matching local deliveries found</p></div>';
    document.getElementById('slh-badge').textContent = '0';
    return;
  }

  let html = '';
  data.forEach(row => {
    html += `
      <div class="pending-row p-3 cursor-pointer mb-2" onclick="openItemModal('${row.RO_VALUE}')">
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

// ==================== EXECUTIVE COMPLETED SHIPMENTS HUB ====================

async function openCompleteShipmentsModal() {
  try {
    showToast('Loading completed shipments...', 'info');
    const response = await callBackend('getCompleted', {});
    
    if (response && Array.isArray(response)) {
      globalData.completedDeliveries = response;
      
      const existingModal = document.getElementById('completeReportModal') || document.getElementById('completedModal');
      if (existingModal) existingModal.remove();

      let html = `
        <div class="modal fade" id="completeReportModal" tabindex="-1" aria-hidden="true" style="z-index: 1065;">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content border-0 shadow-lg" style="border-radius: 16px; background: #f4f6f9;">
              
              <!-- Dark Executive Header -->
              <div class="modal-header border-0 p-3" style="border-top-left-radius: 16px; border-top-right-radius: 16px; background: linear-gradient(135deg, #002f6c 0%, #1a3a52 100%) !important;">
                <div class="d-flex align-items-center gap-3">
                  <div class="p-2 bg-success bg-opacity-20 rounded-3 text-success fs-4">
                    ✅
                  </div>
                  <div>
                    <h5 class="modal-title fw-bold text-white mb-0">Completed Shipments Hub</h5>
                    <small class="text-white-50">Archived operational records & loading analytics</small>
                  </div>
                </div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>

              <!-- Controls & Metrics Bar -->
              <div class="modal-body p-4">
                <div class="row g-3 mb-4 align-items-center">
                  <div class="col-md-5">
                    <div class="input-group input-group-sm shadow-sm rounded-pill overflow-hidden bg-white border">
                      <span class="input-group-text bg-white border-0 ps-3">🔍</span>
                      <input type="text" id="completed-search-input" class="form-control border-0 shadow-none ps-1" placeholder="Search RO, Vendor, Vehicle, Driver, Cusdec..." onkeyup="filterCompletedCards()">
                    </div>
                  </div>
                  <div class="col-md-7 d-flex justify-content-md-end align-items-center gap-2">
                    <span id="completed-count-badge" class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill fw-bold">
                      ${globalData.completedDeliveries.length} Shipments Archived
                    </span>
                    <button class="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold shadow-sm" onclick="generateCompletedPDFReport()">📄 PDF Report</button>
                    <button class="btn btn-sm btn-outline-success rounded-pill px-3 fw-bold shadow-sm" onclick="exportCompletedToExcel()">📊 Export Excel</button>
                  </div>
                </div>

                <!-- Modern Cards Grid -->
                <div id="completed-cards-container" class="row g-3">
                  ${renderCompletedCardsHTML(globalData.completedDeliveries)}
                </div>
              </div>

            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', html);
      const modal = new bootstrap.Modal(document.getElementById('completeReportModal'));
      modal.show();
    } else {
      showToast('No completed shipments found', 'warning');
    }
  } catch (err) {
    showToast('Failed to load completed shipments: ' + err.message, 'error');
  }
}

function renderCompletedCardsHTML(data) {
  if (!data || data.length === 0) {
    return `
      <div class="col-12 text-center py-5">
        <div class="p-4 bg-white rounded-4 border shadow-sm d-inline-block">
          <p class="text-muted mb-0 fw-bold">📦 No completed shipment records match your search filter.</p>
        </div>
      </div>`;
  }

  return data.map((row, idx) => {
    const startTime = row.START_TIME_DISPLAY || formatDateTime(row.START_TIME_RAW) || 'N/A';
    const endTime = row.COMPLETE_TIME_DISPLAY || formatDateTime(row.COMPLETE_TIME_RAW) || 'N/A';
    const accordionId = `collapseItems_${idx}`;

    let itemsTable = '<div class="text-muted small fst-italic p-2">No product line items attached.</div>';
    if (row.ITEMS && Array.isArray(row.ITEMS) && row.ITEMS.length > 0) {
      itemsTable = `
        <div class="table-responsive rounded-3 border mt-2">
          <table class="table table-sm table-striped mb-0 bg-white" style="font-size: 0.75rem;">
            <thead class="table-dark">
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Ctns</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              ${row.ITEMS.map(item => `
                <tr>
                  <td class="fw-bold text-primary">${item.productCode || '-'}</td>
                  <td>${item.description || '-'}</td>
                  <td><span class="badge bg-secondary">${item.qty || 0}</span></td>
                  <td>${item.ctns || 0}</td>
                  <td><span class="badge bg-light text-dark border">${item.location || '-'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="col-12 col-lg-6 completed-card-item">
        <div class="card border-0 shadow-sm h-100 rounded-4 overflow-hidden bg-white border-start border-4 border-success">
          <div class="card-body p-3">
            
            <!-- Top Header Row -->
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 fw-bold mb-1 fs-6">
                  RO: ${row.RO_VALUE || '-'}
                </span>
                <h6 class="fw-bold text-dark mb-0">🏬 ${row.VENDOR_VALUE || 'Vendor Details Pending'}</h6>
              </div>
              <div class="text-end">
                <span class="badge bg-dark text-white rounded-pill px-2 py-1 small">${row.TYPE_VALUE || 'LOCAL'}</span>
                <div class="small text-muted mt-1 fw-bold">📍 ${row.DEST_VALUE || '-'}</div>
              </div>
            </div>

            <hr class="my-2 text-muted opacity-25">

            <!-- Operational Specs Grid -->
            <div class="row g-2 mb-2" style="font-size: 0.78rem;">
              <div class="col-6">
                <div class="p-2 rounded-3 bg-light border">
                  <div class="text-muted small">🚚 Vehicle & Container</div>
                  <strong class="text-dark d-block text-truncate">
                    ${row.VEHICLE || 'TBA'} ${row.CONTAINER_NO ? '| ' + row.CONTAINER_NO : ''}
                  </strong>
                  <span class="text-secondary small">Seal: ${row.SEAL_NO || 'N/A'}</span>
                </div>
              </div>
              <div class="col-6">
                <div class="p-2 rounded-3 bg-light border">
                  <div class="text-muted small">📄 Cusdec & Driver</div>
                  <strong class="text-dark d-block text-truncate">
                    ${row.DRIVER_NAME || row.CONTACT_NO || 'No Driver Info'}
                  </strong>
                  <span class="text-success fw-bold small">Cusdec: ${row.COL_8 || 'N/A'}</span>
                </div>
              </div>
            </div>

            <!-- Loading Timing Ribbon -->
            <div class="d-flex justify-content-between align-items-center p-2 rounded-3 bg-success bg-opacity-10 mb-2" style="font-size: 0.75rem;">
              <div>⏱️ <strong>Start:</strong> ${startTime}</div>
              <div>🏁 <strong>End:</strong> ${endTime}</div>
              <div><span class="badge bg-success">${row.DURATION || 'Complete'}</span></div>
            </div>

            <!-- Product Accordion Toggle -->
            <button class="btn btn-sm btn-light w-100 text-start d-flex justify-content-between align-items-center border rounded-3 fw-bold py-1 px-2 mt-1" 
                    type="button" 
                    data-bs-toggle="collapse" 
                    data-bs-target="#${accordionId}" 
                    aria-expanded="false" 
                    style="font-size: 0.75rem;">
              <span>📦 View Products List (${row.ITEMS ? row.ITEMS.length : 0} items)</span>
              <small class="text-muted">▼</small>
            </button>

            <!-- Collapsible Products Table -->
            <div class="collapse" id="${accordionId}">
              ${itemsTable}
            </div>

          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterCompletedCards() {
  const query = (document.getElementById('completed-search-input')?.value || '').toLowerCase().trim();
  const container = document.getElementById('completed-cards-container');
  const countBadge = document.getElementById('completed-count-badge');
  if (!container) return;

  const filtered = globalData.completedDeliveries.filter(row => {
    if (!query) return true;
    return (
      (row.RO_VALUE && String(row.RO_VALUE).toLowerCase().includes(query)) ||
      (row.VENDOR_VALUE && String(row.VENDOR_VALUE).toLowerCase().includes(query)) ||
      (row.DEST_VALUE && String(row.DEST_VALUE).toLowerCase().includes(query)) ||
      (row.VEHICLE && String(row.VEHICLE).toLowerCase().includes(query)) ||
      (row.DRIVER_NAME && String(row.DRIVER_NAME).toLowerCase().includes(query)) ||
      (row.COL_8 && String(row.COL_8).toLowerCase().includes(query)) ||
      (row.CONTAINER_NO && String(row.CONTAINER_NO).toLowerCase().includes(query))
    );
  });

  container.innerHTML = renderCompletedCardsHTML(filtered);
  if (countBadge) countBadge.textContent = `${filtered.length} Shipments Archived`;
}

function exportCompletedToExcel() {
  if (!globalData.completedDeliveries || globalData.completedDeliveries.length === 0) {
    showToast('No completed data to export', 'warning');
    return;
  }

  const exportData = globalData.completedDeliveries.map(row => ({
    'RO Number': row.RO_VALUE,
    'Vendor': row.VENDOR_VALUE,
    'Destination': row.DEST_VALUE,
    'Shipment Type': row.TYPE_VALUE,
    'Facility': row.FACILITY_VALUE,
    'Vehicle Number': row.VEHICLE,
    'Container No': row.CONTAINER_NO,
    'Seal No': row.SEAL_NO,
    'Cusdec No': row.COL_8,
    'Start Time': row.START_TIME_DISPLAY || formatDateTime(row.START_TIME_RAW),
    'Completed Time': row.COMPLETE_TIME_DISPLAY || formatDateTime(row.COMPLETE_TIME_RAW),
    'Duration': row.DURATION
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Completed Deliveries');
  XLSX.writeFile(wb, 'TAM_Completed_Deliveries_' + new Date().toISOString().split('T')[0] + '.xlsx');
  
  showToast('✅ Completed shipments exported to Excel', 'success');
}

// ==================== SUMMARIES & RIBBON ====================

function updateExportSummary(data) {
  const summary = document.getElementById('bdh-summary');
  if (!summary) return;
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

// ==================== MODAL OPERATIONS & UPDATES ====================

function openItemModal(roNumber) {
  const row = globalData.opsData.find(r => r.RO_VALUE === roNumber);
  if (!row) {
    showToast('RO not found', 'error');
    return;
  }

  globalData.currentSelectedRO = roNumber;

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

  const productsTbody = document.getElementById('modal-products-tbody');
  if (productsTbody) {
    if (row.ITEMS && row.ITEMS.length > 0) {
      let prodHtml = '';
      row.ITEMS.forEach(item => {
        prodHtml += `
          <tr>
            <td><strong>${item.productCode || ''}</strong></td>
            <td>${item.description || ''}</td>
            <td>${item.qty || 0}</td>
            <td>${item.ctns || 0}</td>
            <td>${item.location || ''}</td>
          </tr>
        `;
      });
      productsTbody.innerHTML = prodHtml;
    } else {
      productsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No products loaded</td></tr>';
    }
  }

  const modal = new bootstrap.Modal(document.getElementById('itemModal'));
  modal.show();
}

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
      document.getElementById('edit-staff-pin').value = '';
      await refreshAll();
      bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
    } else {
      showToast('❌ ' + (response.message || 'Update failed'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function openNewOrderModal() {
  const modalEl = document.getElementById('newOrderModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

function addOrderItemRow() {
  const container = document.getElementById('items-container');
  const row = document.createElement('div');
  row.className = 'row g-2 item-row mb-3 pb-3 border-bottom position-relative';
  row.innerHTML = `
    <div class="col-md-3"><input type="text" class="form-control form-control-sm item-product" placeholder="Product Code"></div>
    <div class="col-md-4"><input type="text" class="form-control form-control-sm item-desc" placeholder="Brief description"></div>
    <div class="col-md-2"><input type="number" class="form-control form-control-sm item-qty" placeholder="0"></div>
    <div class="col-md-2"><input type="number" class="form-control form-control-sm item-ctns" placeholder="0"></div>
    <div class="col-md-2 mt-2"><input type="text" class="form-control form-control-sm item-loc" placeholder="VN"></div>
    <div class="col-md-1 mt-2 text-end"><button type="button" class="btn btn-sm btn-danger text-white mt-4" onclick="this.closest('.item-row').remove()">🗑️</button></div>
  `;
  container.appendChild(row);
}

async function submitNewOrder() {
  const pin = document.getElementById('staff-pin').value;
  if (!pin) {
    showToast('Staff PIN is required', 'error');
    return;
  }

  const itemRows = document.querySelectorAll('.item-row');
  const itemsArray = [];
  itemRows.forEach(row => {
    const product = row.querySelector('.item-product').value;
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
    items: JSON.stringify(itemsArray)
  };

  try {
    const response = await callBackend('addNewOrder', params);
    if (response && response.status === 'success') {
      showToast('✅ Order added successfully', 'success');
      document.getElementById('staff-pin').value = ''; 
      await refreshAll(); 
      bootstrap.Modal.getInstance(document.getElementById('newOrderModal')).hide();
    } else {
      showToast('❌ ' + (response.message || 'Failed to add order'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ==================== FILTERS, DRIVE & VEHICLES ====================

function setExportTypeFilter(type) {
  globalData.exportTypeFilter = type;
  document.querySelectorAll('.export-filter-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline-primary');
  });
  const activeBtn = document.querySelector(`[data-type="${type}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('btn-outline-primary');
    activeBtn.classList.add('btn-primary');
  }
  renderExportDeliveries();
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

function setDriveFolder(folderName) {
  globalData.driveFolderName = folderName;
  loadDriveTabFiles(folderName);
}

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

async function uploadDriveFile() {
  const fileInput = document.getElementById('drive-upload-file');
  const folderSelect = document.getElementById('drive-upload-folder');
  if (!fileInput.files[0]) {
    showToast('Please select a file', 'error');
    return;
  }

  const file = fileInput.files[0];
  const folderName = folderSelect.value;
  const uploadId = 'up_' + Math.random().toString(36).substring(2, 9);

  showToast('📤 Preparing file upload...', 'info');

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const base64FullData = e.target.result.split(',')[1];
      const chunkSize = 1500; 
      const totalChunks = Math.ceil(base64FullData.length / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = base64FullData.slice(i * chunkSize, (i + 1) * chunkSize);
        const chunkResponse = await callBackend('uploadChunk', {
          uploadId: uploadId,
          index: i,
          chunk: chunk
        });
        if (!chunkResponse || chunkResponse.status !== 'success') {
          throw new Error(`Failed at chunk ${i + 1} of ${totalChunks}`);
        }
      }

      const finishResponse = await callBackend('finishChunkUpload', {
        uploadId: uploadId,
        totalChunks: totalChunks,
        folderName: folderName,
        fileName: file.name,
        mimeType: file.type
      });

      if (finishResponse && finishResponse.status === 'success') {
        showToast('✅ File uploaded successfully!', 'success');
        fileInput.value = '';
        loadDriveTabFiles(folderName);
      } else {
        showToast('❌ ' + (finishResponse?.message || 'Finalize upload failed'), 'error');
      }
    } catch (err) {
      showToast('Upload error: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function shareDriveFile() {
  const fileId = document.getElementById('drive-share-file-id').value;
  const email = document.getElementById('drive-share-email').value;
  const role = document.getElementById('drive-share-role').value;

  if (!fileId || !email) {
    showToast('File ID and email are required', 'error');
    return;
  }

  try {
    const response = await callBackend('shareDriveFile', { fileId, email, role });
    if (response.status === 'success') {
      showToast('✅ File shared successfully with ' + email, 'success');
    } else {
      showToast('❌ ' + (response.message || 'Share failed'), 'error');
    }
  } catch (err) {
    showToast('Share error: ' + err.message, 'error');
  }
}

function downloadSelectedDriveFile() {
  const fileId = document.getElementById('drive-share-file-id').value;
  if (!fileId) {
    showToast('Please enter a file ID', 'error');
    return;
  }
  window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank');
}

async function onDriveSearch() {
  const query = document.getElementById('drive-search-input').value;
  if (!query || query.length < 2) {
    loadDriveTabFiles(globalData.driveFolderName);
    return;
  }
  try {
    const response = await callBackend('searchFiles', { query });
    if (response.status === 'success' && response.results) {
      renderDriveFiles(response.results);
    }
  } catch (err) {
    showToast('Search error: ' + err.message, 'error');
  }
}

async function openVehicleModal() {
  if (!globalData.currentSelectedRO) {
    showToast('No order selected', 'error');
    return;
  }

  try {
    const response = await callBackend('getVehicleDetails', { ro: globalData.currentSelectedRO });
    if (response && response.status === 'success' && response.data) {
      const v = response.data;
      document.getElementById('veh-number').value = v.vehicleNo || '';
      document.getElementById('veh-type').value = v.vehicleType || 'Lorry';
      document.getElementById('veh-forwarder').value = v.forwarder || '';
      document.getElementById('veh-driver').value = v.driverName || '';
      document.getElementById('veh-contact').value = v.contactNo || '';
      document.getElementById('veh-container').value = v.containerNo || '';
      document.getElementById('veh-seal').value = v.sealNo || '';
      document.getElementById('veh-cbm').value = v.cbm || '';
      document.getElementById('veh-ctns').value = v.totalCtns || '';
    } else {
      document.getElementById('vehicleForm').reset();
    }

    const modalEl = document.getElementById('vehicleModal');
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  } catch (err) {
    showToast('Error loading vehicle details', 'error');
  }
}

async function saveVehicleInfo() {
  const pin = document.getElementById('veh-pin').value;
  if (!pin) {
    showToast('Staff PIN is required', 'error');
    return;
  }

  const params = {
    pin: pin,
    ro: globalData.currentSelectedRO,
    vehicleNo: document.getElementById('veh-number').value,
    vehicleType: document.getElementById('veh-type').value,
    forwarder: document.getElementById('veh-forwarder').value,
    driverName: document.getElementById('veh-driver').value,
    contactNo: document.getElementById('veh-contact').value,
    containerNo: document.getElementById('veh-container').value,
    sealNo: document.getElementById('veh-seal').value,
    cbm: document.getElementById('veh-cbm').value,
    totalCtns: document.getElementById('veh-ctns').value
  };

  try {
    const response = await callBackend('saveVehicleDetails', params);
    if (response && response.status === 'success') {
      showToast('✅ Vehicle details saved successfully', 'success');
      document.getElementById('veh-pin').value = '';
      bootstrap.Modal.getInstance(document.getElementById('vehicleModal')).hide();
      await refreshAll();
    } else {
      showToast('❌ ' + (response.message || 'Failed to save vehicle details'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('keyup', handleSearch);
  }
  initApp();
  loadDriveTabFiles('Export Docs');
});
