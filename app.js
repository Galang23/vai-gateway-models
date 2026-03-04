(() => {
    'use strict';

    // --- Configuration ---
    const API_URL = 'https://ai-gateway.vercel.sh/v1/models';
    const CACHE_KEY = 'ai_models_data_v2';
    const CACHE_TS_KEY = 'ai_models_timestamp_v2';
    const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
    const COMPARE_QUERY_KEY = 'compare';
    const COLUMN_WIDTHS_KEY = 'ai_models_column_widths';

    // --- State ---
    let allModels = [];
    let filteredModels = [];
    let selectedIds = new Set();
    let sortConfig = { key: 'name', direction: 'asc' };
    let selectedTags = new Set();
    let selectedProviders = new Set();
    let selectedFamilies = new Set();
    let selectedTypes = new Set();
    let compareMode = false;
    let hasParsedCompareQuery = false;
    let columnWidths = loadColumnWidths();

    // --- Column Definitions ---
    const columns = [
        { key: 'select', label: '', sortable: false, className: 'col-select' },
        { key: 'name', label: 'Model Name', sortable: true, className: 'col-name' },
        { key: 'type', label: 'Type', sortable: true },
        { key: 'tags', label: 'Capabilities', sortable: false, className: 'col-tags' },
        { key: 'context_window', label: 'Context', sortable: true, type: 'number', className: 'col-number' },
        { key: 'max_tokens', label: 'Max Output', sortable: true, type: 'number', className: 'col-number' },
        { key: 'pricing.input', label: 'Input $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.output', label: 'Output $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.input_cache_read', label: 'Cache Read $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.input_cache_write', label: 'Cache Write $/1M', sortable: true, type: 'price', multiplier: 1e6, className: 'col-price' },
        { key: 'pricing.image', label: 'Image $/img', sortable: true, type: 'price', multiplier: 1, className: 'col-price' },
        { key: 'pricing.video', label: 'Video $/sec', sortable: true, type: 'price', multiplier: 1, className: 'col-price' },
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
        providerSelectBox: $('#provider-select-box'),
        providerCheckboxes: $('#provider-checkboxes'),
        providerSelectedText: $('#provider-selected-text'),
        familySelectBox: $('#family-select-box'),
        familyCheckboxes: $('#family-checkboxes'),
        familySelectedText: $('#family-selected-text'),
        typeSelectBox: $('#type-select-box'),
        typeCheckboxes: $('#type-checkboxes'),
        typeSelectedText: $('#type-selected-text'),
        tagsSelectBox: $('#tags-select-box'),
        tagsCheckboxes: $('#tags-checkboxes'),
        tagsSelectedText: $('#tags-selected-text'),
        selectionStats: $('#selection-stats'),
        cacheStatus: $('#cache-status'),
        modelCount: $('#model-count'),
        btnCsv: $('#btn-csv'),
        btnJson: $('#btn-json'),
        btnHtml: $('#btn-html'),
        btnResetWidths: $('#btn-reset-widths'),
        btnRefresh: $('#btn-refresh'),
        filterToggle: $('#filter-toggle'),
        controlsSection: $('#controls-section'),
        exportRow: $('.export-row'),
        tableContainer: $('.table-container'),
        compareBar: $('#compare-bar'),
        compareInfo: $('#compare-info'),
        btnCompare: $('#btn-compare'),
        btnExitCompare: $('#btn-exit-compare'),
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

    function loadColumnWidths() {
        try {
            const raw = localStorage.getItem(COLUMN_WIDTHS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveColumnWidths() {
        try {
            localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
        } catch (e) {
            console.warn('Column width cache write error:', e);
        }
    }

    function updateResetWidthsButtonState() {
        if (!dom.btnResetWidths) return;
        dom.btnResetWidths.disabled = Object.keys(columnWidths).length === 0;
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

    // --- Mobile Filter Toggle ---
    function toggleFilters() {
        const isCollapsed = dom.filterToggle.classList.toggle('collapsed');
        if (isCollapsed) {
            dom.controlsSection.classList.remove('expanded');
        } else {
            dom.controlsSection.classList.add('expanded');
        }
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
    function hydrateViewFromData() {
        initFilters();
        if (!hasParsedCompareQuery) {
            applyCompareFromURL();
            hasParsedCompareQuery = true;
        }
        renderHeaders();
        updateCompareUI();
        applyFilters();
    }

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
                hydrateViewFromData();
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
            // API returns { object: 'list', data: [...] }
            allModels = json.data || [];
            saveToCache(allModels);
            processModels();
            updateCacheStatus(true, 0);
            hydrateViewFromData();
        } catch (err) {
            console.error('Fetch error:', err);
            // Try to load local `pricing.json` as a fallback (useful for local development
            // and when the remote API is unreachable). The local file follows the same
            // structure: { object: 'list', data: [...] }
            try {
                const localRes = await fetch('./pricing.json');
                if (!localRes.ok) throw new Error(`Local pricing.json HTTP ${localRes.status}`);
                const localJson = await localRes.json();
                allModels = localJson.data || localJson || [];
                saveToCache(allModels);
                processModels();
                updateCacheStatus(true, 0);
                hydrateViewFromData();
            } catch (localErr) {
                console.error('Local pricing.json load error:', localErr);
                if (!silent) {
                    dom.error.textContent = `Failed to load data: ${err.message}`;
                    dom.error.classList.remove('hidden');
                }
            }
        } finally {
            dom.loading.classList.add('hidden');
        }
    }

    // Process models to add derived fields
    function processModels() {
        allModels.forEach(m => {
            m._family = extractFamily(m.name);
            // keep raw pricing copy, but do not overwrite if it already exists
            if (!m._pricing_raw && m.pricing) {
                m._pricing_raw = JSON.parse(JSON.stringify(m.pricing));
            }
            // normalize common pricing keys so UI can read them consistently
            m.pricing = normalizePricing(m._pricing_raw || m.pricing || {}, m.type);
        });
    }

    function normalizePricing(pricing, modelType) {
        // Return a normalized pricing object with keys the UI expects:
        // input, output, input_cache_read, input_cache_write, image, web_search
        const out = {};

        const pick = (val) => {
            if (val === undefined || val === null) return undefined;
            return val;
        };

        // Simple direct mappings
        out.input = pick(pricing.input ?? pricing.input_price ?? pricing.prompt ?? pricing.prompt_price);
        out.output = pick(pricing.output ?? pricing.completion ?? pricing.completion_price);
        out.input_cache_read = pick(pricing.input_cache_read ?? pricing.input_cache ?? pricing.cache_read);
        out.input_cache_write = pick(pricing.input_cache_write ?? pricing.input_cache_write ?? pricing.cache_write);
        out.web_search = pick(pricing.web_search ?? pricing.web_search_price);

        // Image pricing: either `image` or `image_dimension_quality_pricing` or first tier
        if (modelType !== 'video') {
            if (pricing.image) {
                out.image = pricing.image;
            } else if (Array.isArray(pricing.image_dimension_quality_pricing) && pricing.image_dimension_quality_pricing.length) {
                // prefer entry with size 'default', otherwise pick the first
                const def = pricing.image_dimension_quality_pricing.find(p => p.size === 'default');
                out.image = (def && def.cost) || pricing.image_dimension_quality_pricing[0].cost;
            } else if (pricing.image_pricing) {
                out.image = pricing.image_pricing;
            }
        }

        // Video pricing: if there's video_duration_pricing, pick the lowest cost_per_second as representative
        if (Array.isArray(pricing.video_duration_pricing) && pricing.video_duration_pricing.length) {
            let min = null;
            pricing.video_duration_pricing.forEach(entry => {
                const rawCost = entry.cost_per_second ?? entry.cost ?? entry.cost_per_second_usd;
                const c = parseFloat(rawCost);
                if (!isNaN(c)) {
                    if (min === null || c < min) min = c;
                }
            });
            if (min !== null) out.video = String(min);
        }

        if (!out.video && modelType === 'video') {
            out.video = pick(pricing.video ?? pricing.video_price ?? pricing.cost_per_second);
        }

        // Pricing tiers: prefer top-level input/output if present, otherwise derive from tiers
        if (!out.input && Array.isArray(pricing.input_tiers) && pricing.input_tiers.length) {
            out.input = pricing.input_tiers[0].cost || pricing.input_tiers[0].price;
        }
        if (!out.output && Array.isArray(pricing.output_tiers) && pricing.output_tiers.length) {
            out.output = pricing.output_tiers[0].cost || pricing.output_tiers[0].price;
        }

        // Some models store numeric strings; keep as-is (formatPrice will parse)

        return out;
    }

    function normalizeCompareToken(input) {
        if (!input) return '';
        return String(input)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[\-_]+/g, ' ');
    }

    function formatTierRange(min, max) {
        const start = Number.isFinite(min) ? Number(min).toLocaleString() : '0';
        if (max === undefined || max === null) return `${start}+`;
        return `${start}-${Number(max).toLocaleString()}`;
    }

    function getPriceIndicators(model, col) {
        const raw = model?._pricing_raw || {};
        const indicators = [];
        const priceKey = col.key;
        const multiplier = col.multiplier || 1;

        const tierMap = {
            'pricing.input': 'input_tiers',
            'pricing.output': 'output_tiers',
            'pricing.input_cache_read': 'input_cache_read_tiers',
            'pricing.input_cache_write': 'input_cache_write_tiers',
        };

        const tierKey = tierMap[priceKey];
        if (tierKey && Array.isArray(raw[tierKey]) && raw[tierKey].length > 0) {
            const detail = raw[tierKey]
                .slice(0, 4)
                .map((tier) => `${formatTierRange(tier.min, tier.max)}: ${formatPrice(tier.cost || tier.price, multiplier)}`)
                .join(', ');
            indicators.push({
                label: 'tiered',
                title: `Tiered pricing available (${raw[tierKey].length} tiers)`,
                detail: detail || `${raw[tierKey].length} tiers available`,
            });
        }

        if (priceKey === 'pricing.image' && Array.isArray(raw.image_dimension_quality_pricing) && raw.image_dimension_quality_pricing.length > 0) {
            const variants = raw.image_dimension_quality_pricing
                .slice(0, 4)
                .map((entry) => `${entry.size || 'default'}: ${formatPrice(entry.cost, multiplier)}`)
                .join(', ');
            indicators.push({
                label: 'variants',
                title: variants ? `Image pricing variants: ${variants}` : 'Image pricing variants available',
                detail: variants || 'Multiple image variants',
            });
        }

        if (priceKey === 'pricing.video' && Array.isArray(raw.video_duration_pricing) && raw.video_duration_pricing.length > 0) {
            const variants = raw.video_duration_pricing
                .slice(0, 4)
                .map((entry) => `${entry.mode || entry.resolution || 'default'}: ${formatPrice(entry.cost_per_second || entry.cost || entry.cost_per_second_usd, multiplier)}`)
                .join(', ');
            indicators.push({
                label: 'variants',
                title: variants ? `Video pricing variants: ${variants}` : 'Video pricing variants available',
                detail: variants || 'Multiple video variants',
            });
        }

        return indicators;
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

        // Developer multi-select
        dom.providerCheckboxes.innerHTML = '';
        [...providers].sort().forEach(p => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = p;
            cb.checked = selectedProviders.has(p);
            cb.addEventListener('change', handleProviderChange);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + p));
            dom.providerCheckboxes.appendChild(label);
        });

        // Family multi-select
        dom.familyCheckboxes.innerHTML = '';
        [...families].sort().forEach(f => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = f;
            cb.checked = selectedFamilies.has(f);
            cb.addEventListener('change', handleFamilyChange);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + f));
            dom.familyCheckboxes.appendChild(label);
        });

        // Type multi-select
        dom.typeCheckboxes.innerHTML = '';
        [...types].sort().forEach(t => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = t;
            cb.checked = selectedTypes.has(t);
            cb.addEventListener('change', handleTypeChange);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + t));
            dom.typeCheckboxes.appendChild(label);
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

        updateProviderLabel();
        updateFamilyLabel();
        updateTypeLabel();
    }

    // --- Event Handlers ---
    function handleProviderChange(e) {
        if (e.target.checked) {
            selectedProviders.add(e.target.value);
        } else {
            selectedProviders.delete(e.target.value);
        }
        updateProviderLabel();
        applyFilters();
    }

    function handleFamilyChange(e) {
        if (e.target.checked) {
            selectedFamilies.add(e.target.value);
        } else {
            selectedFamilies.delete(e.target.value);
        }
        updateFamilyLabel();
        applyFilters();
    }

    function handleTypeChange(e) {
        if (e.target.checked) {
            selectedTypes.add(e.target.value);
        } else {
            selectedTypes.delete(e.target.value);
        }
        updateTypeLabel();
        applyFilters();
    }

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

    function updateProviderLabel() {
        if (selectedProviders.size === 0) {
            dom.providerSelectedText.textContent = 'All Developers';
        } else {
            dom.providerSelectedText.textContent = `${selectedProviders.size} selected`;
        }
    }

    function updateFamilyLabel() {
        if (selectedFamilies.size === 0) {
            dom.familySelectedText.textContent = 'All Families';
        } else {
            dom.familySelectedText.textContent = `${selectedFamilies.size} selected`;
        }
    }

    function updateTypeLabel() {
        if (selectedTypes.size === 0) {
            dom.typeSelectedText.textContent = 'All Types';
        } else {
            dom.typeSelectedText.textContent = `${selectedTypes.size} selected`;
        }
    }

    function toggleProviderDropdown() {
        dom.providerCheckboxes.classList.toggle('expanded');
    }

    function toggleFamilyDropdown() {
        dom.familyCheckboxes.classList.toggle('expanded');
    }

    function toggleTypeDropdown() {
        dom.typeCheckboxes.classList.toggle('expanded');
    }

    function toggleTagsDropdown() {
        dom.tagsCheckboxes.classList.toggle('expanded');
    }

    function getSelectedModelNames() {
        return [...selectedIds]
            .map((id) => {
                const model = allModels.find((m) => m.id === id);
                return model?.name || id;
            })
            .filter(Boolean);
    }

    function setCompareQuery(pushHistory = false) {
        const url = new URL(window.location.href);
        const selectedNames = getSelectedModelNames();
        if (compareMode && selectedNames.length >= 2) {
            url.searchParams.set(COMPARE_QUERY_KEY, selectedNames.join(','));
        } else {
            url.searchParams.delete(COMPARE_QUERY_KEY);
        }

        if (pushHistory) {
            history.pushState(null, '', url.toString());
        } else {
            history.replaceState(null, '', url.toString());
        }
    }

    function applyCompareFromURL() {
        const params = new URLSearchParams(window.location.search);
        const compareValue = params.get(COMPARE_QUERY_KEY);

        if (!compareValue) {
            compareMode = false;
            return;
        }

        const tokens = compareValue
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean);

        if (!tokens.length) {
            compareMode = false;
            return;
        }

        selectedIds.clear();

        tokens.forEach((token) => {
            const lower = token.toLowerCase();
            const normalized = normalizeCompareToken(token);
            const match = allModels.find(
                (m) =>
                    m.id === token ||
                    m.id.toLowerCase() === lower ||
                    (m.name && m.name.toLowerCase() === lower) ||
                    normalizeCompareToken(m.id) === normalized ||
                    normalizeCompareToken(m.name) === normalized
            );
            if (match) selectedIds.add(match.id);
        });

        compareMode = selectedIds.size >= 2;
    }

    function enterCompareMode(pushHistory = true) {
        if (selectedIds.size < 2) return;
        compareMode = true;
        setCompareQuery(pushHistory);
        renderHeaders();
        updateCompareUI();
        applyFilters();
    }

    function exitCompareMode(pushHistory = true) {
        compareMode = false;
        setCompareQuery(pushHistory);
        renderHeaders();
        updateCompareUI();
        applyFilters();
    }

    function updateCompareUI() {
        const selectedCount = selectedIds.size;

        if (selectedCount === 0 && !compareMode) {
            dom.compareBar.classList.add('hidden');
        } else {
            dom.compareBar.classList.remove('hidden');
        }

        if (compareMode) {
            dom.compareInfo.textContent = `Comparing ${selectedCount} model${selectedCount === 1 ? '' : 's'}`;
            dom.btnCompare.classList.add('hidden');
            dom.btnExitCompare.classList.remove('hidden');
        } else {
            if (selectedCount >= 2) {
                dom.compareInfo.textContent = `${selectedCount} selected - ready to compare`;
            } else if (selectedCount === 1) {
                dom.compareInfo.textContent = 'Select 1 more model to compare';
            } else {
                dom.compareInfo.textContent = 'Select 2 or more models to compare';
            }
            dom.btnCompare.classList.remove('hidden');
            dom.btnCompare.disabled = selectedCount < 2;
            dom.btnExitCompare.classList.add('hidden');
        }
    }

    function handleSelectionChanged() {
        if (compareMode && selectedIds.size < 2) {
            exitCompareMode(false);
            return;
        }
        if (compareMode) {
            setCompareQuery(false);
        }
        updateCompareUI();
        applyFilters();
    }

    function syncWithUrlState() {
        const params = new URLSearchParams(window.location.search);
        if (params.has(COMPARE_QUERY_KEY)) {
            applyCompareFromURL();
        } else {
            compareMode = false;
        }
        renderHeaders();
        updateCompareUI();
        applyFilters();
    }

    function positionCompareBarForViewport() {
        if (!dom.compareBar || !dom.exportRow || !dom.tableContainer || !dom.controlsSection) return;

        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) {
            if (dom.compareBar.parentElement !== dom.controlsSection.parentElement) {
                dom.controlsSection.parentElement.insertBefore(dom.compareBar, dom.tableContainer);
            } else if (dom.compareBar.nextElementSibling !== dom.tableContainer) {
                dom.controlsSection.parentElement.insertBefore(dom.compareBar, dom.tableContainer);
            }
            return;
        }

        if (dom.compareBar.parentElement !== dom.exportRow) {
            dom.exportRow.appendChild(dom.compareBar);
        }
    }

    // --- Filtering & Sorting ---
    function applyFilters() {
        const searchTerm = dom.search.value.toLowerCase().trim();

        filteredModels = allModels.filter(m => {
            // Search
            const matchSearch = !searchTerm ||
                (m.name && m.name.toLowerCase().includes(searchTerm)) ||
                (m.id && m.id.toLowerCase().includes(searchTerm));

            // Provider/Developer
            const matchProvider = selectedProviders.size === 0 || selectedProviders.has(m.owned_by);

            // Family
            const matchFamily = selectedFamilies.size === 0 || selectedFamilies.has(m._family);

            // Type
            const matchType = selectedTypes.size === 0 || selectedTypes.has(m.type);

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

        if (compareMode) {
            filteredModels = filteredModels.filter((m) => selectedIds.has(m.id));
        }

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

    function getColumnIndex(colKey) {
        return columns.findIndex((col) => col.key === colKey);
    }

    function getColumnWidth(colKey) {
        const width = Number(columnWidths[colKey]);
        return Number.isFinite(width) && width > 0 ? width : null;
    }

    function applyExplicitWidth(cell, colKey) {
        const width = getColumnWidth(colKey);
        if (!width) return;
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;
        cell.style.maxWidth = `${width}px`;
    }

    function applyColumnWidthToRenderedCells(colKey, width) {
        const index = getColumnIndex(colKey);
        if (index < 0) return;

        const headerCell = dom.headerRow.children[index];
        if (headerCell) {
            headerCell.style.width = `${width}px`;
            headerCell.style.minWidth = `${width}px`;
            headerCell.style.maxWidth = `${width}px`;
        }

        [...dom.tableBody.rows].forEach((row) => {
            const cell = row.children[index];
            if (!cell) return;
            cell.style.width = `${width}px`;
            cell.style.minWidth = `${width}px`;
            cell.style.maxWidth = `${width}px`;
        });
    }

    function startColumnResize(event, colKey) {
        event.preventDefault();
        event.stopPropagation();

        const index = getColumnIndex(colKey);
        if (index < 0) return;

        const headerCell = dom.headerRow.children[index];
        if (!headerCell) return;

        const startX = event.clientX;
        const startWidth = headerCell.getBoundingClientRect().width;
        const minWidth = colKey === 'name' ? 140 : 90;

        document.body.classList.add('is-resizing-columns');

        const onMouseMove = (moveEvent) => {
            const nextWidth = Math.max(minWidth, Math.round(startWidth + (moveEvent.clientX - startX)));
            columnWidths[colKey] = nextWidth;
            applyColumnWidthToRenderedCells(colKey, nextWidth);
        };

        const onMouseUp = () => {
            document.body.classList.remove('is-resizing-columns');
            saveColumnWidths();
            updateResetWidthsButtonState();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function autoFitColumn(colKey) {
        const index = getColumnIndex(colKey);
        if (index < 0) return;

        const headerCell = dom.headerRow.children[index];
        if (!headerCell) return;

        const minWidth = colKey === 'name' ? 140 : 90;
        const maxWidth = 700;
        const padding = 20;
        let targetWidth = headerCell.scrollWidth + padding;

        const rows = [...dom.tableBody.rows];
        const sampleRows = rows.length > 400 ? rows.slice(0, 400) : rows;

        sampleRows.forEach((row) => {
            const cell = row.children[index];
            if (!cell) return;
            targetWidth = Math.max(targetWidth, cell.scrollWidth + padding);
        });

        const nextWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(targetWidth)));
        columnWidths[colKey] = nextWidth;
        applyColumnWidthToRenderedCells(colKey, nextWidth);
        saveColumnWidths();
        updateResetWidthsButtonState();
    }

    // --- Rendering ---
    function renderHeaders() {
        dom.headerRow.innerHTML = '';

        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = col.className || '';
            th.dataset.colKey = col.key;
            applyExplicitWidth(th, col.key);

            if (col.key === 'select') {
                th.classList.add('no-sort');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = 'select-all';
                cb.disabled = compareMode;
                cb.title = compareMode ? 'Select all is disabled in compare mode' : 'Select all visible models';
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

            if (col.key !== 'select') {
                const resizeHandle = document.createElement('span');
                resizeHandle.className = 'col-resize-handle';
                resizeHandle.title = 'Drag to resize, double-click to auto-fit';
                resizeHandle.addEventListener('click', (e) => e.stopPropagation());
                resizeHandle.addEventListener('mousedown', (e) => startColumnResize(e, col.key));
                resizeHandle.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    autoFitColumn(col.key);
                });
                th.appendChild(resizeHandle);
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
                td.dataset.colKey = col.key;
                applyExplicitWidth(td, col.key);

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
                    const priceText = document.createElement('span');
                    priceText.className = 'price-main';
                    priceText.textContent = formatted;
                    td.appendChild(priceText);

                    const indicators = getPriceIndicators(model, col);
                    indicators.forEach((indicator) => {
                        const meta = document.createElement('span');
                        meta.className = 'price-meta';
                        meta.textContent = indicator.label;
                        meta.title = indicator.title;
                        td.appendChild(meta);
                    });

                    if (indicators.length > 0) {
                        const detail = document.createElement('div');
                        detail.className = 'price-detail';
                        detail.textContent = indicators.map((i) => i.detail).join(' | ');
                        detail.title = indicators.map((i) => i.title).join(' | ');
                        td.appendChild(detail);
                    }

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
        handleSelectionChanged();
    }

    function toggleSelectAll(e) {
        if (compareMode) return;
        const checked = e.target.checked;
        filteredModels.forEach(m => {
            if (checked) {
                selectedIds.add(m.id);
            } else {
                selectedIds.delete(m.id);
            }
        });
        handleSelectionChanged();
    }

    function updateStats() {
        if (compareMode) {
            dom.selectionStats.textContent = `${selectedIds.size} selected (compare mode)`;
            dom.modelCount.textContent = `Comparing ${filteredModels.length} model${filteredModels.length === 1 ? '' : 's'}`;
        } else {
            dom.selectionStats.textContent = `${selectedIds.size} selected`;
            dom.modelCount.textContent = `${filteredModels.length} of ${allModels.length} models`;
        }
    }

    function resetColumnWidths() {
        columnWidths = {};
        saveColumnWidths();
        renderHeaders();
        renderTable();
        updateResetWidthsButtonState();
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
            'Image $/img', 'Video $/sec', 'Web Search $/1k', 'Capabilities', 'Description', 'Raw Pricing JSON'
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
            m.pricing?.video || '',
            m.pricing?.web_search || '',
            Array.isArray(m.tags) ? m.tags.join('; ') : '',
            (m.description || '').replace(/"/g, '""'),
            JSON.stringify(m._pricing_raw || {}).replace(/"/g, '""')
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

        const headers = ['Model Name', 'Developer', 'Type', 'Capabilities', 'Context', 'Max Output', 'Input $/1M', 'Output $/1M', 'Cache Read', 'Cache Write', 'Image', 'Video', 'Web Search', 'Raw Pricing'];

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
            html += `<td>${formatPrice(m.pricing?.video, 1)}</td>`;
            html += `<td>${formatPrice(m.pricing?.web_search, 1)}</td>`;
            html += `<td><code>${JSON.stringify(m._pricing_raw || {})}</code></td>`;
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
        dom.providerSelectBox.addEventListener('click', toggleProviderDropdown);
        dom.familySelectBox.addEventListener('click', toggleFamilyDropdown);
        dom.typeSelectBox.addEventListener('click', toggleTypeDropdown);
        dom.tagsSelectBox.addEventListener('click', toggleTagsDropdown);

        // Mobile filter toggle
        dom.filterToggle.addEventListener('click', toggleFilters);

        // Close tags dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const providerContainer = $('#provider-dropdown-container');
            if (providerContainer && !providerContainer.contains(e.target)) {
                dom.providerCheckboxes.classList.remove('expanded');
            }

            const familyContainer = $('#family-dropdown-container');
            if (familyContainer && !familyContainer.contains(e.target)) {
                dom.familyCheckboxes.classList.remove('expanded');
            }

            const typeContainer = $('#type-dropdown-container');
            if (typeContainer && !typeContainer.contains(e.target)) {
                dom.typeCheckboxes.classList.remove('expanded');
            }

            const tagsContainer = $('#tags-dropdown-container');
            if (tagsContainer && !tagsContainer.contains(e.target)) {
                dom.tagsCheckboxes.classList.remove('expanded');
            }
        });

        dom.btnCsv.addEventListener('click', exportCSV);
        dom.btnJson.addEventListener('click', exportJSON);
        dom.btnHtml.addEventListener('click', exportHTML);
        dom.btnResetWidths.addEventListener('click', resetColumnWidths);
        dom.btnRefresh.addEventListener('click', () => fetchData(true));
        dom.btnCompare.addEventListener('click', () => enterCompareMode(true));
        dom.btnExitCompare.addEventListener('click', () => exitCompareMode(true));

        window.addEventListener('popstate', syncWithUrlState);
        window.addEventListener('resize', positionCompareBarForViewport);
    }

    // --- Init ---
    function init() {
        // Set initial collapsed state for mobile
        dom.filterToggle.classList.add('collapsed');
        
        renderHeaders();
        bindEvents();
        positionCompareBarForViewport();
        updateCompareUI();
        updateResetWidthsButtonState();
        fetchData();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
