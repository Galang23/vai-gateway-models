(() => {
    'use strict';

    // --- Configuration ---
    const API_URL = 'https://ai-gateway.vercel.sh/v1/models';
    const CACHE_KEY = 'ai_models_data';
    const CACHE_TS_KEY = 'ai_models_timestamp';
    const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

    // --- State ---
    let allModels = [];
    let filteredModels = [];
    let selectedIds = new Set();
    let sortConfig = { key: 'name', direction: 'asc' };
    let selectedTags = new Set();

    // --- Column Definitions ---
    const columns = [
        { key: 'select', label: '', sortable: false, className: 'col-select' },
        { key: 'name', label: 'Model Name', sortable: true },
        { key: 'type', label: 'Type', sortable: true },
        { key: 'tags', label: 'Capabilities', sortable: false, className: 'col-tags' },
        { key: 'context_window', label: 'Context', sortable: true, type: 'number', className: 'col-number' },
        { key: 'max_tokens', label: 'Max Output', sortable: true, type: 'number', className: 'col-number' },
        { key: 'pricing.input', label: 'Input $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.output', label: 'Output $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.input_cache_read', label: 'Cache Read $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.input_cache_write', label: 'Cache Write $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.image', label: 'Image $/img', sortable: true, type: 'price', multiplier: 1, className: 'col-price' },
        { key: 'pricing.web_search', label: 'Web Search $/1k', sortable: true, type: 'price', multiplier: 1, className: 'col-price' },
    ];

    // --- DOM Elements ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        loading: $('#loading'),
        error: $('#error'),
        headerRow: $('#table-header-row'),
        tableBody: $('#table-body'),
        search: $('#search'),
        providerFilter: $('#provider-filter'),
        familyFilter: $('#family-filter'),
        typeFilter: $('#type-filter'),
        tagsSelectBox: $('#tags-select-box'),
        tagsCheckboxes: $('#tags-checkboxes'),
        tagsSelectedText: $('#tags-selected-text'),
        selectionStats: $('#selection-stats'),
        cacheStatus: $('#cache-status'),
        modelCount: $('#model-count'),
        btnCsv: $('#btn-csv'),
        btnJson: $('#btn-json'),
        btnHtml: $('#btn-html'),
        btnRefresh: $('#btn-refresh'),
    };

    // --- Utilities ---
    function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
    }

    function formatNumber(val) {
        if (val === undefined || val === null || val === '') return '-';
        return Number(val).toLocaleString();
    }

    function formatPrice(val, multiplier = 1) {
        if (val === undefined || val === null || val === '') return '-';
        const num = parseFloat(val) * multiplier;
        if (isNaN(num)) return '-';
        // Dynamic precision based on magnitude
        if (num >= 100) return '$' + num.toFixed(2);
        if (num >= 1) return '$' + num.toFixed(3);
        if (num >= 0.01) return '$' + num.toFixed(4);
        return '$' + num.toPrecision(3);
    }

    // Extract model family from name
    function extractFamily(name) {
        if (!name) return '';
        // Common patterns: "Claude 3.5 Sonnet" -> "Claude", "GPT-4o" -> "GPT", "Llama 3.1" -> "Llama"
        // Split by space, dash, or numbers and take first meaningful word
        const cleaned = name.replace(/[-_]/g, ' ');
        const parts = cleaned.split(/\s+/);
        if (parts.length > 0) {
            // Return first word that's not just a number
            for (const part of parts) {
                if (!/^\d+/.test(part)) {
                    return part;
                }
            }
            return parts[0];
        }
        return name;
    }

    // --- LocalStorage Cache ---
    function loadFromCache() {
        try {
            const data = localStorage.getItem(CACHE_KEY);
            const ts = localStorage.getItem(CACHE_TS_KEY);
            if (data && ts) {
                const age = Date.now() - parseInt(ts, 10);
                const isFresh = age < CACHE_MAX_AGE_MS;
                return { data: JSON.parse(data), isFresh, age };
            }
        } catch (e) {
            console.warn('Cache read error:', e);
        }
        return null;
    }

    function saveToCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
        } catch (e) {
            console.warn('Cache write error:', e);
        }
    }

    function updateCacheStatus(isFresh, age) {
        if (age === undefined) {
            dom.cacheStatus.textContent = 'Live';
            dom.cacheStatus.className = 'cache-status fresh';
        } else {
            const mins = Math.floor(age / 60000);
            dom.cacheStatus.textContent = isFresh ? `Cached (${mins}m ago)` : `Stale (${mins}m)`;
            dom.cacheStatus.className = 'cache-status ' + (isFresh ? 'fresh' : 'stale');
        }
    }

    // --- Data Fetching ---
    async function fetchData(forceRefresh = false) {
        dom.loading.classList.remove('hidden');
        dom.error.classList.add('hidden');

        // Try cache first (unless forcing refresh)
        if (!forceRefresh) {
            const cached = loadFromCache();
            if (cached) {
                allModels = cached.data;
                processModels();
                updateCacheStatus(cached.isFresh, cached.age);
                initFilters();
                applyFilters();
                dom.loading.classList.add('hidden');

                // If stale, refresh in background
                if (!cached.isFresh) {
                    fetchFromAPI(true);
                }
                return;
            }
        }

        await fetchFromAPI(false);
    }

    async function fetchFromAPI(silent = false) {
        if (!silent) {
            dom.loading.classList.remove('hidden');
        }

        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            allModels = json.data || [];
            processModels();
            saveToCache(allModels);
            updateCacheStatus(true, 0);
            initFilters();
            applyFilters();
        } catch (err) {
            console.error('Fetch error:', err);
            if (!silent) {
                dom.error.textContent = `Failed to load data: ${err.message}`;
                dom.error.classList.remove('hidden');
            }
        } finally {
            dom.loading.classList.add('hidden');
        }
    }

    // Process models to add derived fields
    function processModels() {
        allModels.forEach(m => {
            m._family = extractFamily(m.name);
        });
    }

    // --- Filters Initialization ---
    function initFilters() {
        const providers = new Set();
        const types = new Set();
        const tags = new Set();
        const families = new Set();

        allModels.forEach(m => {
            if (m.owned_by) providers.add(m.owned_by);
            if (m.type) types.add(m.type);
            if (Array.isArray(m.tags)) m.tags.forEach(t => tags.add(t));
            if (m._family) families.add(m._family);
        });

        // Developer dropdown
        dom.providerFilter.innerHTML = '<option value="">All Developers</option>';
        [...providers].sort().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            dom.providerFilter.appendChild(opt);
        });

        // Family dropdown
        dom.familyFilter.innerHTML = '<option value="">All Families</option>';
        [...families].sort().forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            dom.familyFilter.appendChild(opt);
        });

        // Type dropdown
        dom.typeFilter.innerHTML = '<option value="">All Types</option>';
        [...types].sort().forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            dom.typeFilter.appendChild(opt);
        });

        // Capabilities multi-select
        dom.tagsCheckboxes.innerHTML = '';
        [...tags].sort().forEach(tag => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = tag;
            cb.checked = selectedTags.has(tag);
            cb.addEventListener('change', handleTagChange);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + tag));
            dom.tagsCheckboxes.appendChild(label);
        });
    }

    // --- Event Handlers ---
    function handleTagChange(e) {
        if (e.target.checked) {
            selectedTags.add(e.target.value);
        } else {
            selectedTags.delete(e.target.value);
        }
        updateTagsLabel();
        applyFilters();
    }

    function updateTagsLabel() {
        if (selectedTags.size === 0) {
            dom.tagsSelectedText.textContent = 'Select Capabilities...';
        } else {
            dom.tagsSelectedText.textContent = `${selectedTags.size} selected`;
        }
    }

    function toggleTagsDropdown() {
        dom.tagsCheckboxes.classList.toggle('expanded');
    }

    // --- Filtering & Sorting ---
    function applyFilters() {
        const searchTerm = dom.search.value.toLowerCase().trim();
        const provider = dom.providerFilter.value;
        const family = dom.familyFilter.value;
        const type = dom.typeFilter.value;

        filteredModels = allModels.filter(m => {
            // Search
            const matchSearch = !searchTerm ||
                (m.name && m.name.toLowerCase().includes(searchTerm)) ||
                (m.id && m.id.toLowerCase().includes(searchTerm));

            // Provider/Developer
            const matchProvider = !provider || m.owned_by === provider;

            // Family
            const matchFamily = !family || m._family === family;

            // Type
            const matchType = !type || m.type === type;

            // Capabilities (AND logic: must have ALL selected)
            let matchTags = true;
            if (selectedTags.size > 0) {
                if (!Array.isArray(m.tags)) {
                    matchTags = false;
                } else {
                    matchTags = [...selectedTags].every(t => m.tags.includes(t));
                }
            }

            return matchSearch && matchProvider && matchFamily && matchType && matchTags;
        });

        sortData();
        renderTable();
        updateStats();
    }

    function sortData() {
        const col = columns.find(c => c.key === sortConfig.key);
        const isNumeric = col && (col.type === 'number' || col.type === 'price');

        filteredModels.sort((a, b) => {
            let valA = getNestedValue(a, sortConfig.key);
            let valB = getNestedValue(b, sortConfig.key);

            if (valA === undefined || valA === null) valA = isNumeric ? -Infinity : '';
            if (valB === undefined || valB === null) valB = isNumeric ? -Infinity : '';

            if (isNumeric) {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            } else {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function handleSort(key) {
        if (!columns.find(c => c.key === key)?.sortable) return;

        if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.key = key;
            sortConfig.direction = 'asc';
        }

        renderHeaders();
        sortData();
        renderTable();
    }

    // --- Rendering ---
    function renderHeaders() {
        dom.headerRow.innerHTML = '';

        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = col.className || '';

            if (col.key === 'select') {
                th.classList.add('no-sort');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = 'select-all';
                cb.addEventListener('change', toggleSelectAll);
                th.appendChild(cb);
            } else {
                th.textContent = col.label;
                if (col.sortable) {
                    th.addEventListener('click', () => handleSort(col.key));
                    if (sortConfig.key === col.key) {
                        const arrow = document.createElement('span');
                        arrow.className = 'sort-indicator';
                        arrow.textContent = sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
                        th.appendChild(arrow);
                    }
                } else {
                    th.classList.add('no-sort');
                }
            }

            dom.headerRow.appendChild(th);
        });
    }

    function renderTable() {
        dom.tableBody.innerHTML = '';

        filteredModels.forEach(model => {
            const tr = document.createElement('tr');
            const isSelected = selectedIds.has(model.id);

            columns.forEach(col => {
                const td = document.createElement('td');
                td.className = col.className || '';

                if (col.key === 'select') {
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = isSelected;
                    cb.addEventListener('change', () => toggleSelect(model.id));
                    td.appendChild(cb);
                } else if (col.key === 'tags') {
                    // Render capabilities as badges
                    if (model.tags && Array.isArray(model.tags) && model.tags.length > 0) {
                        td.innerHTML = model.tags.map(t => `<span class="tag-badge">${t}</span>`).join('');
                    } else {
                        td.textContent = '-';
                    }
                } else if (col.type === 'price') {
                    const val = getNestedValue(model, col.key);
                    const formatted = formatPrice(val, col.multiplier);
                    td.textContent = formatted;
                    if (formatted === '-') td.classList.add('empty');
                } else if (col.type === 'number') {
                    td.textContent = formatNumber(getNestedValue(model, col.key));
                } else {
                    const val = getNestedValue(model, col.key) || '-';
                    td.textContent = val;
                    td.title = val;
                }

                tr.appendChild(td);
            });

            dom.tableBody.appendChild(tr);
        });

        // Update select-all checkbox state
        const selectAllCb = $('#select-all');
        if (selectAllCb) {
            const allSelected = filteredModels.length > 0 && filteredModels.every(m => selectedIds.has(m.id));
            const someSelected = filteredModels.some(m => selectedIds.has(m.id));
            selectAllCb.checked = allSelected;
            selectAllCb.indeterminate = someSelected && !allSelected;
        }
    }

    function toggleSelect(id) {
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
        } else {
            selectedIds.add(id);
        }
        renderTable();
        updateStats();
    }

    function toggleSelectAll(e) {
        const checked = e.target.checked;
        filteredModels.forEach(m => {
            if (checked) {
                selectedIds.add(m.id);
            } else {
                selectedIds.delete(m.id);
            }
        });
        renderTable();
        updateStats();
    }

    function updateStats() {
        dom.selectionStats.textContent = `${selectedIds.size} selected`;
        dom.modelCount.textContent = `${filteredModels.length} of ${allModels.length} models`;
    }

    // --- Export Functions ---
    function getExportData() {
        if (selectedIds.size > 0) {
            return allModels.filter(m => selectedIds.has(m.id));
        }
        return filteredModels;
    }

    function exportCSV() {
        const data = getExportData();
        if (!data.length) return alert('No data to export');

        const headers = [
            'Model Name', 'ID', 'Developer', 'Family', 'Type', 'Context', 'Max Output',
            'Input $/1M', 'Output $/1M', 'Cache Read $/1M', 'Cache Write $/1M',
            'Image $/img', 'Web Search $/1k', 'Capabilities', 'Description'
        ];

        const rows = data.map(m => [
            m.name || '',
            m.id || '',
            m.owned_by || '',
            m._family || '',
            m.type || '',
            m.context_window || '',
            m.max_tokens || '',
            m.pricing?.input ? (parseFloat(m.pricing.input) * 1e6).toFixed(4) : '',
            m.pricing?.output ? (parseFloat(m.pricing.output) * 1e6).toFixed(4) : '',
            m.pricing?.input_cache_read ? (parseFloat(m.pricing.input_cache_read) * 1e6).toFixed(4) : '',
            m.pricing?.input_cache_write ? (parseFloat(m.pricing.input_cache_write) * 1e6).toFixed(4) : '',
            m.pricing?.image || '',
            m.pricing?.web_search || '',
            Array.isArray(m.tags) ? m.tags.join('; ') : '',
            (m.description || '').replace(/"/g, '""')
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        downloadFile(csvContent, 'ai-models.csv', 'text/csv');
    }

    function exportJSON() {
        const data = getExportData();
        if (!data.length) return alert('No data to export');
        downloadFile(JSON.stringify(data, null, 2), 'ai-models.json', 'application/json');
    }

    function exportHTML() {
        const data = getExportData();
        if (!data.length) return alert('No data to export');

        const headers = ['Model Name', 'Developer', 'Type', 'Capabilities', 'Context', 'Max Output', 'Input $/1M', 'Output $/1M', 'Cache Read', 'Cache Write', 'Image', 'Web Search'];

        let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>AI Models Export</title>
<style>body{font-family:sans-serif;margin:20px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
tr:nth-child(even){background:#fafafa}.tag{display:inline-block;background:#e8f0fe;color:#1a73e8;padding:2px 6px;border-radius:3px;font-size:11px;margin:1px}</style></head><body>
<h1>AI Models Pricing</h1><table><thead><tr>`;

        headers.forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';

        data.forEach(m => {
            const caps = Array.isArray(m.tags) ? m.tags.map(t => `<span class="tag">${t}</span>`).join(' ') : '-';
            html += '<tr>';
            html += `<td>${m.name || '-'}</td>`;
            html += `<td>${m.owned_by || '-'}</td>`;
            html += `<td>${m.type || '-'}</td>`;
            html += `<td>${caps}</td>`;
            html += `<td>${formatNumber(m.context_window)}</td>`;
            html += `<td>${formatNumber(m.max_tokens)}</td>`;
            html += `<td>${formatPrice(m.pricing?.input, 1e6)}</td>`;
            html += `<td>${formatPrice(m.pricing?.output, 1e6)}</td>`;
            html += `<td>${formatPrice(m.pricing?.input_cache_read, 1e6)}</td>`;
            html += `<td>${formatPrice(m.pricing?.input_cache_write, 1e6)}</td>`;
            html += `<td>${formatPrice(m.pricing?.image, 1)}</td>`;
            html += `<td>${formatPrice(m.pricing?.web_search, 1)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></body></html>';
        downloadFile(html, 'ai-models.html', 'text/html');
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Event Bindings ---
    function bindEvents() {
        dom.search.addEventListener('input', applyFilters);
        dom.providerFilter.addEventListener('change', applyFilters);
        dom.familyFilter.addEventListener('change', applyFilters);
        dom.typeFilter.addEventListener('change', applyFilters);
        dom.tagsSelectBox.addEventListener('click', toggleTagsDropdown);

        // Close tags dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const container = $('#tags-dropdown-container');
            if (!container.contains(e.target)) {
                dom.tagsCheckboxes.classList.remove('expanded');
            }
        });

        dom.btnCsv.addEventListener('click', exportCSV);
        dom.btnJson.addEventListener('click', exportJSON);
        dom.btnHtml.addEventListener('click', exportHTML);
        dom.btnRefresh.addEventListener('click', () => fetchData(true));
    }

    // --- Init ---
    function init() {
        renderHeaders();
        bindEvents();
        fetchData();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
