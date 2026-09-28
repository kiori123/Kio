(() => {
  if (window.__cvcdInjected) return;
  window.__cvcdInjected = true;

  const state = {
    picking: false,
    hoverEl: null,
    regionEl: null,
    tableEl: null,
    rows: [], // array of arrays of cell elements
    numRows: 0,
    numCols: 0,
  };

  let hoverOverlay = null;
  let regionOverlay = null;
  let hintEl = null;
  let panelEl = null;
  let badgeEls = [];
  let repositionHandlerAttached = false;
  let regionHistory = []; // stack of ancestor elements, for "shrink" after "expand"

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'TOGGLE_PICKER') {
      if (state.picking) {
        stopPicking();
      } else {
        closePanel();
        startPicking();
      }
    }
  });

  function startPicking() {
    state.picking = true;
    ensureHoverOverlay();
    showHint('Di chuyển chuột và bấm vào bảng / khu vực dữ liệu cần crawl. Nhấn ESC để hủy.');
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function stopPicking() {
    state.picking = false;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    hideHoverOverlay();
    hideHint();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      stopPicking();
    }
  }

  function onMouseMove(e) {
    state.hoverEl = e.target;
    const rect = state.hoverEl.getBoundingClientRect();
    ensureHoverOverlay();
    hoverOverlay.style.left = rect.left + 'px';
    hoverOverlay.style.top = rect.top + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    regionHistory = [];
    // Click thường rơi vào phần tử lá (vd 1 ô/cell), leo lên tổ tiên gần nhất
    // có phần tử con để có cơ hội bắt đúng "hàng" thay vì 1 ô lẻ.
    state.regionEl = climbToNearestContainer(e.target);
    stopPicking();
    selectRegionAndShowPanel();
  }

  function climbToNearestContainer(el) {
    let cur = el;
    while (cur && cur.children.length === 0 && cur.parentElement) {
      cur = cur.parentElement;
    }
    return cur;
  }

  function selectRegionAndShowPanel() {
    analyzeRegion();
    if (state.numRows === 0) {
      showHint('Không tìm thấy dữ liệu dạng bảng/lưới trong khu vực đã chọn. Thử bấm vào phần tử khác.');
      setTimeout(hideHint, 2500);
      return;
    }
    buildPanel();
    renderBadges();
  }

  function expandRegion() {
    const next = state.regionEl && state.regionEl.parentElement;
    if (!next || next === document.documentElement) return;
    regionHistory.push(state.regionEl);
    state.regionEl = next;
    selectRegionAndShowPanel();
  }

  function shrinkRegion() {
    if (regionHistory.length === 0) return;
    state.regionEl = regionHistory.pop();
    selectRegionAndShowPanel();
  }

  function analyzeRegion() {
    const el = state.regionEl;
    const table = el.closest('table') || (el.tagName === 'TABLE' ? el : el.querySelector('table'));

    state.rows = [];
    state.tableEl = null;

    if (table) {
      state.tableEl = table;
      for (const row of Array.from(table.rows)) {
        state.rows.push(Array.from(row.cells));
      }
    } else {
      const children = Array.from(el.children);
      if (children.length > 0) {
        for (const child of children) {
          const cells = child.children.length > 0 ? Array.from(child.children) : [child];
          state.rows.push(cells);
        }
      }
    }

    state.numRows = state.rows.length;
    state.numCols = state.rows.reduce((max, r) => Math.max(max, r.length), 0);

    if (state.tableEl) {
      const rect = state.tableEl.getBoundingClientRect();
      showRegionOverlay(rect);
    } else if (state.regionEl) {
      showRegionOverlay(state.regionEl.getBoundingClientRect());
    }
  }

  function ensureHoverOverlay() {
    if (hoverOverlay) return;
    hoverOverlay = document.createElement('div');
    hoverOverlay.className = 'cvcd-hover-overlay';
    document.body.appendChild(hoverOverlay);
  }

  function hideHoverOverlay() {
    if (hoverOverlay) {
      hoverOverlay.remove();
      hoverOverlay = null;
    }
  }

  function showRegionOverlay(rect) {
    if (regionOverlay) regionOverlay.remove();
    regionOverlay = document.createElement('div');
    regionOverlay.className = 'cvcd-region-overlay';
    regionOverlay.style.left = rect.left + 'px';
    regionOverlay.style.top = rect.top + 'px';
    regionOverlay.style.width = rect.width + 'px';
    regionOverlay.style.height = rect.height + 'px';
    document.body.appendChild(regionOverlay);
  }

  function hideRegionOverlay() {
    if (regionOverlay) {
      regionOverlay.remove();
      regionOverlay = null;
    }
  }

  function showHint(text) {
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.className = 'cvcd-hint';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = text;
  }

  function hideHint() {
    if (hintEl) {
      hintEl.remove();
      hintEl = null;
    }
  }

  function clearBadges() {
    badgeEls.forEach((b) => b.remove());
    badgeEls = [];
  }

  function renderBadges() {
    clearBadges();
    if (!panelEl) return;

    // Cột: đánh số dựa theo hàng đầu tiên có dữ liệu
    const headerRow = state.rows[0] || [];
    headerRow.forEach((cell, idx) => {
      const rect = cell.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const badge = document.createElement('div');
      badge.className = 'cvcd-badge';
      badge.textContent = 'C' + (idx + 1);
      badge.style.left = rect.left + 'px';
      badge.style.top = Math.max(rect.top - 18, 0) + 'px';
      document.body.appendChild(badge);
      badgeEls.push(badge);
    });

    // Hàng: đánh số dựa theo ô đầu tiên của mỗi hàng
    state.rows.forEach((row, idx) => {
      const cell = row[0];
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const badge = document.createElement('div');
      badge.className = 'cvcd-badge cvcd-row-badge';
      badge.textContent = 'H' + (idx + 1);
      badge.style.left = Math.max(rect.left - 30, 0) + 'px';
      badge.style.top = rect.top + 'px';
      document.body.appendChild(badge);
      badgeEls.push(badge);
    });

    if (!repositionHandlerAttached) {
      window.addEventListener('scroll', onReposition, true);
      window.addEventListener('resize', onReposition, true);
      repositionHandlerAttached = true;
    }
  }

  function onReposition() {
    if (!panelEl) return;
    if (state.tableEl) {
      showRegionOverlay(state.tableEl.getBoundingClientRect());
    } else if (state.regionEl) {
      showRegionOverlay(state.regionEl.getBoundingClientRect());
    }
    renderBadges();
  }

  function buildPanel() {
    closePanelDom();

    panelEl = document.createElement('div');
    panelEl.className = 'cvcd-panel';
    panelEl.innerHTML = `
      <button class="cvcd-close" title="Đóng">✕</button>
      <h3>Crawl dữ liệu vùng đã chọn</h3>
      <div class="cvcd-meta">Phát hiện: <b>${state.numRows}</b> hàng × <b>${state.numCols}</b> cột</div>
      <div class="cvcd-actions">
        <button class="cvcd-secondary" id="cvcd-expand" title="Vùng đang chọn quá nhỏ (thiếu hàng/cột)? Leo lên khu vực cha.">⬆ Mở rộng vùng</button>
        <button class="cvcd-secondary" id="cvcd-shrink" title="Quay lại vùng nhỏ hơn trước đó.">⬇ Thu hẹp vùng</button>
      </div>
      <div class="cvcd-row">
        <div class="cvcd-field">
          <label>Cột từ</label>
          <input type="number" id="cvcd-col-from" min="1" max="${state.numCols}" value="1" />
        </div>
        <div class="cvcd-field">
          <label>Cột đến</label>
          <input type="number" id="cvcd-col-to" min="1" max="${state.numCols}" value="${state.numCols}" />
        </div>
      </div>
      <div class="cvcd-row">
        <div class="cvcd-field">
          <label>Hàng từ</label>
          <input type="number" id="cvcd-row-from" min="1" max="${state.numRows}" value="1" />
        </div>
        <div class="cvcd-field">
          <label>Hàng đến</label>
          <input type="number" id="cvcd-row-to" min="1" max="${state.numRows}" value="${state.numRows}" />
        </div>
      </div>
      <label class="cvcd-checkbox">
        <input type="checkbox" id="cvcd-use-header" />
        Dùng hàng đầu tiên (đã chọn) làm tiêu đề cột (xuất JSON dạng object)
      </label>
      <div class="cvcd-actions">
        <button class="cvcd-secondary" id="cvcd-reselect">Chọn lại vùng</button>
        <button class="cvcd-secondary" id="cvcd-preview">Xem trước</button>
      </div>
      <div class="cvcd-preview" id="cvcd-preview-box"></div>
      <div class="cvcd-actions" style="margin-top:10px;">
        <button id="cvcd-copy-csv">Copy CSV</button>
        <button id="cvcd-copy-json">Copy JSON</button>
        <button id="cvcd-download-csv">Tải CSV</button>
      </div>
      <div class="cvcd-status" id="cvcd-status"></div>
    `;
    document.body.appendChild(panelEl);

    panelEl.querySelector('.cvcd-close').addEventListener('click', closePanel);
    panelEl.querySelector('#cvcd-reselect').addEventListener('click', () => {
      closePanel();
      startPicking();
    });
    panelEl.querySelector('#cvcd-expand').addEventListener('click', expandRegion);
    panelEl.querySelector('#cvcd-shrink').addEventListener('click', shrinkRegion);
    panelEl.querySelector('#cvcd-preview').addEventListener('click', renderPreview);
    panelEl.querySelector('#cvcd-copy-csv').addEventListener('click', () => {
      const data = extractRange();
      copyToClipboard(toCSV(data), 'Đã copy CSV vào clipboard!');
    });
    panelEl.querySelector('#cvcd-copy-json').addEventListener('click', () => {
      const data = extractRange();
      const json = JSON.stringify(toMaybeObjects(data), null, 2);
      copyToClipboard(json, 'Đã copy JSON vào clipboard!');
    });
    panelEl.querySelector('#cvcd-download-csv').addEventListener('click', () => {
      const data = extractRange();
      downloadFile(toCSV(data), 'crawl-data.csv', 'text/csv;charset=utf-8;');
    });

    renderPreview();
  }

  function getRangeInputs() {
    const colFrom = clamp(parseInt(panelEl.querySelector('#cvcd-col-from').value, 10) || 1, 1, state.numCols);
    const colTo = clamp(parseInt(panelEl.querySelector('#cvcd-col-to').value, 10) || state.numCols, 1, state.numCols);
    const rowFrom = clamp(parseInt(panelEl.querySelector('#cvcd-row-from').value, 10) || 1, 1, state.numRows);
    const rowTo = clamp(parseInt(panelEl.querySelector('#cvcd-row-to').value, 10) || state.numRows, 1, state.numRows);
    return {
      colFrom: Math.min(colFrom, colTo),
      colTo: Math.max(colFrom, colTo),
      rowFrom: Math.min(rowFrom, rowTo),
      rowTo: Math.max(rowFrom, rowTo),
    };
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function extractRange() {
    const { colFrom, colTo, rowFrom, rowTo } = getRangeInputs();
    const data = [];
    for (let r = rowFrom - 1; r <= rowTo - 1; r++) {
      const row = state.rows[r] || [];
      const line = [];
      for (let c = colFrom - 1; c <= colTo - 1; c++) {
        const cell = row[c];
        line.push(cell ? cell.innerText.trim().replace(/\s+/g, ' ') : '');
      }
      data.push(line);
    }
    return data;
  }

  function toMaybeObjects(data) {
    const useHeader = panelEl.querySelector('#cvcd-use-header').checked;
    if (!useHeader || data.length < 2) return data;
    const [header, ...rest] = data;
    return rest.map((row) => {
      const obj = {};
      header.forEach((h, i) => {
        obj[h || 'col' + (i + 1)] = row[i] !== undefined ? row[i] : '';
      });
      return obj;
    });
  }

  function toCSV(data) {
    return data
      .map((row) =>
        row
          .map((val) => {
            const needsQuote = /[",\n]/.test(val);
            const escaped = val.replace(/"/g, '""');
            return needsQuote ? `"${escaped}"` : escaped;
          })
          .join(',')
      )
      .join('\n');
  }

  function renderPreview() {
    const data = extractRange();
    const box = panelEl.querySelector('#cvcd-preview-box');
    const maxRows = 20;
    let html = '<table>';
    data.slice(0, maxRows).forEach((row) => {
      html += '<tr>' + row.map((v) => `<td>${escapeHtml(v)}</td>`).join('') + '</tr>';
    });
    html += '</table>';
    if (data.length > maxRows) {
      html += `<div style="padding:6px;color:#6b7280;">... còn ${data.length - maxRows} hàng nữa</div>`;
    }
    box.innerHTML = html;
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function copyToClipboard(text, successMsg) {
    navigator.clipboard
      .writeText(text)
      .then(() => setStatus(successMsg))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        setStatus(successMsg);
      });
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Đã tải file ' + filename);
  }

  function setStatus(msg) {
    const el = panelEl && panelEl.querySelector('#cvcd-status');
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => {
      if (el) el.textContent = '';
    }, 3000);
  }

  function closePanelDom() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  function closePanel() {
    closePanelDom();
    clearBadges();
    hideRegionOverlay();
    if (repositionHandlerAttached) {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition, true);
      repositionHandlerAttached = false;
    }
  }
})();
