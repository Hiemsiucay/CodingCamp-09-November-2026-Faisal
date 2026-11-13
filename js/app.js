/* ==========================================================================
   Pengeluaran Visualizer — application logic
   Vanilla JS, localStorage persistence, hand-drawn SVG donut chart.
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'pengeluaran-visualizer.v1';
  const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const DATE_FMT_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  const SHORT_MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULT_CATEGORIES = [
    { id: 'food', name: 'Food', color: '#f97316' },
    { id: 'transport', name: 'Transport', color: '#3b82f6' },
    { id: 'fun', name: 'Fun', color: '#a855f7' }
  ];

  const PALETTE = [
    { hex: '#ec4899', name: 'Pink' },
    { hex: '#14b8a6', name: 'Teal' },
    { hex: '#f59e0b', name: 'Amber' },
    { hex: '#8b5cf6', name: 'Violet' },
    { hex: '#06b6d4', name: 'Cyan' },
    { hex: '#ef4444', name: 'Red' },
    { hex: '#84cc16', name: 'Lime' },
    { hex: '#64748b', name: 'Slate' }
  ];

  const FALLBACK_CATEGORY = { id: 'uncategorized', name: 'Uncategorized', color: '#94a3b8' };
  const SORT_OPTIONS = new Set(['date-desc', 'date-asc', 'amount-desc', 'amount-asc', 'category-asc', 'name-asc']);
  const THEMES = new Set(['light', 'dark']);

  const state = {
    transactions: [],
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
    theme: null,
    sort: 'date-desc',
    selectedCategoryId: 'food',
    selectedMonth: currentMonthKey(),
    draftColor: PALETTE[0].hex,
    search: ''
  };

  let els = {};
  let toastTimer = null;
  let saveWarningShown = false;
  let pinnedCategoryId = null;
  let chartRows = [];
  let chartTotal = 0;

  /* ------------------------------------------------------------------ */
  /* Boot: apply the saved theme before first paint, then hydrate data.  */
  /* ------------------------------------------------------------------ */

  const saved = readSavedData();

  applyInitialTheme(saved.data && THEMES.has(saved.data.theme) ? saved.data.theme : null);

  if (saved.data) {
    hydrate(saved.data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    cacheElements();

    const today = todayStr();
    els.date.max = today;
    els.date.value = today;
    els.sort.value = state.sort;

    renderCategoryChips();
    bindEvents();
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    renderAll();
    watchSystemTheme();
  }

  function cacheElements() {
    const $ = (selector) => document.querySelector(selector);

    els = {
      form: $('#tx-form'),
      name: $('#item-name'),
      amount: $('#amount'),
      date: $('#tx-date'),
      nameError: $('#item-name-error'),
      amountError: $('#amount-error'),
      dateError: $('#date-error'),
      categoryError: $('#category-error'),
      categoryField: $('.category-field'),
      categoryChips: $('#category-chips'),
      newCatPanel: $('#new-category-panel'),
      newCatName: $('#new-category-name'),
      newCatError: $('#new-category-error'),
      swatches: $('#color-swatches'),
      createCategory: $('#create-category'),
      cancelCategory: $('#cancel-category'),
      themeToggle: $('#theme-toggle'),
      totalBalance: $('#total-balance'),
      txCount: $('#tx-count'),
      heroMonth: $('#hero-month'),
      heroMonthCount: $('#hero-month-count'),
      heroTopCat: $('#hero-top-cat'),
      heroRibbon: $('#hero-ribbon'),
      listCount: $('#list-count'),
      txList: $('#tx-list'),
      search: $('#search'),
      sort: $('#sort'),
      donut: $('#donut'),
      donutLabel: $('#donut-label'),
      donutValue: $('#donut-value'),
      donutSub: $('#donut-sub'),
      chartCaption: $('#chart-caption'),
      chartLegend: $('#chart-legend'),
      monthLabel: $('#month-label'),
      monthPrev: $('#month-prev'),
      monthNext: $('#month-next'),
      monthTotal: $('#month-total'),
      monthDelta: $('#month-delta'),
      monthCount: $('#month-count'),
      monthAvg: $('#month-avg'),
      monthTop: $('#month-top'),
      monthCategories: $('#month-categories'),
      monthBars: $('#month-bars'),
      toast: $('#toast'),
      toastMessage: $('#toast-message'),
      toastAction: $('#toast-action')
    };
  }

  function bindEvents() {
    els.form.addEventListener('submit', onFormSubmit);
    els.name.addEventListener('input', () => clearFieldError(els.name));
    els.amount.addEventListener('input', () => clearFieldError(els.amount));
    els.date.addEventListener('change', () => clearFieldError(els.date));

    els.categoryChips.addEventListener('change', onCategoryChange);
    els.categoryChips.addEventListener('click', (event) => {
      if (event.target.closest('#add-category-toggle')) {
        toggleCategoryPanel();
      }
    });

    els.createCategory.addEventListener('click', createCategory);
    els.cancelCategory.addEventListener('click', () => closeCategoryPanel(true));
    els.newCatName.addEventListener('input', () => setCategoryPanelError(''));
    els.newCatName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createCategory();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeCategoryPanel(true);
      }
    });
    els.swatches.addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-color]');
      if (!swatch) return;
      state.draftColor = swatch.dataset.color;
      renderSwatches();
    });

    els.themeToggle.addEventListener('click', toggleTheme);
    els.sort.addEventListener('change', () => {
      state.sort = els.sort.value;
      save();
      renderList();
    });
    els.search.addEventListener('input', () => {
      state.search = els.search.value;
      renderList();
    });

    els.txList.addEventListener('click', onListClick);

    els.monthPrev.addEventListener('click', () => changeMonth(-1));
    els.monthNext.addEventListener('click', () => changeMonth(1));
    els.monthBars.addEventListener('click', (event) => {
      const bar = event.target.closest('[data-month]');
      if (!bar) return;
      state.selectedMonth = bar.dataset.month;
      renderMonthly();
      const next = els.monthBars.querySelector(`[data-month="${bar.dataset.month}"]`);
      if (next) next.focus({ preventScroll: true });
    });

    els.toastAction.addEventListener('click', () => {
      const action = els.toastAction._action;
      hideToast();
      if (typeof action === 'function') {
        action();
      }
    });

    window.addEventListener('storage', onStorageChange);
  }

  /* ------------------------------------------------------------------ */
  /* Storage & theme                                                     */
  /* ------------------------------------------------------------------ */

  function readSavedData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { data: null };
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? { data: parsed } : { data: null };
    } catch (error) {
      return { data: null };
    }
  }

  function hydrate(data) {
    if (THEMES.has(data.theme)) {
      state.theme = data.theme;
    }

    if (SORT_OPTIONS.has(data.sort)) {
      state.sort = data.sort;
    }

    if (Array.isArray(data.categories)) {
      const merged = DEFAULT_CATEGORIES.map((category) => ({ ...category }));
      const ids = new Set(merged.map((category) => category.id));

      data.categories.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const id = typeof raw.id === 'string' ? raw.id.slice(0, 64) : '';
        const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 30) : '';
        const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '';
        if (!id || !name || !color || ids.has(id)) return;
        ids.add(id);
        merged.push({ id, name, color, custom: true });
      });

      state.categories = merged;
    }

    if (Array.isArray(data.transactions)) {
      const seen = new Set();
      state.transactions = data.transactions
        .filter((raw) => {
          if (!raw || typeof raw !== 'object') return false;
          if (typeof raw.id !== 'string' || seen.has(raw.id)) return false;
          if (typeof raw.name !== 'string' || !raw.name.trim()) return false;
          if (!Number.isFinite(raw.amount) || raw.amount <= 0 || raw.amount > 1e9) return false;
          if (typeof raw.category !== 'string') return false;
          if (!isValidDateStr(raw.date)) return false;
          seen.add(raw.id);
          return true;
        })
        .map((raw) => ({
          id: raw.id,
          name: raw.name.trim().slice(0, 80),
          amount: roundMoney(raw.amount),
          category: raw.category,
          date: raw.date,
          createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
        }));
    }

    if (!state.categories.some((category) => category.id === state.selectedCategoryId)) {
      state.selectedCategoryId = state.categories[0].id;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        transactions: state.transactions,
        categories: state.categories,
        theme: state.theme,
        sort: state.sort
      }));
    } catch (error) {
      if (!saveWarningShown) {
        saveWarningShown = true;
        if (els.toast) {
          showToast('Storage is unavailable — changes will not persist.');
        }
      }
    }
  }

  function applyInitialTheme(theme) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = theme || (prefersDark ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === 'dark';
    const meta = document.getElementById('theme-color');

    if (meta) {
      meta.setAttribute('content', isDark ? '#0b100e' : '#f4f7f5');
    }

    if (els.themeToggle) {
      els.themeToggle.setAttribute('aria-pressed', String(isDark));
      const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      els.themeToggle.setAttribute('aria-label', label);
      els.themeToggle.setAttribute('title', label);
    }
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    state.theme = next;
    applyTheme(next);
    save();
  }

  function watchSystemTheme() {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => {
      if (!state.theme) {
        applyTheme(event.matches ? 'dark' : 'light');
      }
    };

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
    } else if (typeof query.addListener === 'function') {
      query.addListener(onChange);
    }
  }

  function onStorageChange(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;

    try {
      const data = JSON.parse(event.newValue);
      if (!data || typeof data !== 'object') return;
      hydrate(data);
      els.sort.value = state.sort;
      if (THEMES.has(data.theme)) applyTheme(data.theme);
      renderCategoryChips();
      renderAll();
    } catch (error) {
      /* Ignore malformed updates from other tabs. */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function money(value) {
    return CURRENCY.format(Number.isFinite(value) ? value : 0);
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function todayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function currentMonthKey() {
    return todayStr().slice(0, 7);
  }

  function monthKeyFromDate(dateStr) {
    return dateStr.slice(0, 7);
  }

  function isValidDateStr(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` === value;
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return (sameYear ? DATE_FMT : DATE_FMT_YEAR).format(date);
  }

  function monthLabel(key) {
    return MONTH_FMT.format(new Date(`${key}-01T00:00:00`));
  }

  function shortMonthLabel(key) {
    return SHORT_MONTH_FMT.format(new Date(`${key}-01T00:00:00`));
  }

  function daysInMonth(key) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    return new Date(year, month, 0).getDate();
  }

  function shiftMonth(key, delta) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7)) - 1;
    const date = new Date(year, month + delta, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createSvg(tag) {
    return document.createElementNS(SVG_NS, tag);
  }

  function getCategory(id) {
    return state.categories.find((category) => category.id === id) || FALLBACK_CATEGORY;
  }

  function sumTransactions(list) {
    return list.reduce((total, tx) => total + tx.amount, 0);
  }

  function groupByCategory(list) {
    const groups = new Map();

    list.forEach((tx) => {
      const category = getCategory(tx.category);
      const current = groups.get(category.id) || { category, total: 0, count: 0 };
      current.total += tx.amount;
      current.count += 1;
      groups.set(category.id, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }

  function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
  }

  function pulse(element) {
    if (!element) return;
    element.classList.remove('is-pulsing');
    void element.offsetWidth;
    element.classList.add('is-pulsing');
  }

  /* ------------------------------------------------------------------ */
  /* Categories                                                          */
  /* ------------------------------------------------------------------ */

  function renderCategoryChips() {
    els.categoryChips.replaceChildren();

    state.categories.forEach((category) => {
      const label = document.createElement('label');
      label.className = 'chip';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = category.id;
      input.checked = category.id === state.selectedCategoryId;

      const dot = document.createElement('span');
      dot.className = 'chip__dot';
      dot.style.setProperty('--c', category.color);

      const name = document.createElement('span');
      name.textContent = category.name;

      label.append(input, dot, name);
      els.categoryChips.append(label);
    });

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.id = 'add-category-toggle';
    addButton.className = 'chip chip--add';
    addButton.setAttribute('aria-expanded', String(!els.newCatPanel.hidden));
    addButton.setAttribute('aria-controls', 'new-category-panel');
    addButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      <span>New</span>`;
    els.categoryChips.append(addButton);
  }

  function onCategoryChange(event) {
    const input = event.target.closest('input[name="category"]');
    if (!input) return;
    state.selectedCategoryId = input.value;
    setCategoryError('');
  }

  function toggleCategoryPanel() {
    if (els.newCatPanel.hidden) {
      openCategoryPanel();
    } else {
      closeCategoryPanel();
    }
  }

  function openCategoryPanel() {
    els.newCatPanel.hidden = false;
    els.newCatName.value = '';
    setCategoryPanelError('');
    state.draftColor = firstUnusedColor();
    renderSwatches();
    setCategoryToggleExpanded(true);
    els.newCatName.focus();
  }

  function closeCategoryPanel(restoreFocus = false) {
    els.newCatPanel.hidden = true;
    els.newCatName.value = '';
    setCategoryPanelError('');
    setCategoryToggleExpanded(false);
    if (restoreFocus) {
      const toggle = document.getElementById('add-category-toggle');
      if (toggle) toggle.focus();
    }
  }

  function setCategoryToggleExpanded(expanded) {
    const toggle = document.getElementById('add-category-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
  }

  function firstUnusedColor() {
    const used = new Set(state.categories.map((category) => category.color.toLowerCase()));
    const unused = PALETTE.find((color) => !used.has(color.hex.toLowerCase()));
    return (unused || PALETTE[state.categories.length % PALETTE.length]).hex;
  }

  function renderSwatches() {
    els.swatches.replaceChildren();

    PALETTE.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.dataset.color = color.hex;
      button.style.setProperty('--swatch', color.hex);
      button.setAttribute('aria-label', `Use ${color.name}`);
      button.setAttribute('title', color.name);
      const selected = state.draftColor.toLowerCase() === color.hex.toLowerCase();
      button.setAttribute('aria-pressed', String(selected));

      if (selected) {
        button.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="m5 12 4 4L19 6"/>
          </svg>`;
      }

      els.swatches.append(button);
    });
  }

  function createCategory() {
    const name = els.newCatName.value.trim().replace(/\s+/g, ' ');

    if (!name) {
      setCategoryPanelError('Enter a category name.');
      els.newCatName.focus();
      return;
    }

    const duplicate = state.categories.some((category) => category.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setCategoryPanelError('That category already exists.');
      els.newCatName.focus();
      return;
    }

    const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    state.categories.push({ id, name, color: state.draftColor, custom: true });
    state.selectedCategoryId = id;
    save();

    closeCategoryPanel();
    renderCategoryChips();
    setCategoryError('');
    showToast(`Category "${name}" added.`);

    const selectedInput = els.categoryChips.querySelector('input:checked');
    if (selectedInput) selectedInput.focus();
  }

  function setCategoryPanelError(message) {
    els.newCatError.textContent = message;
    els.newCatName.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  /* ------------------------------------------------------------------ */
  /* Add / delete transactions                                           */
  /* ------------------------------------------------------------------ */

  function onFormSubmit(event) {
    event.preventDefault();

    const name = els.name.value.trim();
    const amountRaw = els.amount.value.trim();
    const amount = Number(amountRaw.replace(',', '.'));
    const date = els.date.value;
    const today = todayStr();
    let firstInvalid = null;
    let valid = true;

    setInputError(els.name, els.nameError, '');
    setInputError(els.amount, els.amountError, '');
    setInputError(els.date, els.dateError, '');
    setCategoryError('');

    if (!name) {
      setInputError(els.name, els.nameError, 'Give this expense a name.');
      firstInvalid = firstInvalid || els.name;
      valid = false;
    }

    if (!amountRaw) {
      setInputError(els.amount, els.amountError, 'Enter an amount.');
      firstInvalid = firstInvalid || els.amount;
      valid = false;
    } else if (!Number.isFinite(amount) || amount <= 0) {
      setInputError(els.amount, els.amountError, 'Use a number greater than zero.');
      firstInvalid = firstInvalid || els.amount;
      valid = false;
    } else if (roundMoney(amount) < 0.01) {
      setInputError(els.amount, els.amountError, 'Amount must be at least $0.01.');
      firstInvalid = firstInvalid || els.amount;
      valid = false;
    } else if (amount > 1e9) {
      setInputError(els.amount, els.amountError, 'That amount is too large.');
      firstInvalid = firstInvalid || els.amount;
      valid = false;
    }

    if (!date) {
      setInputError(els.date, els.dateError, 'Pick a date.');
      firstInvalid = firstInvalid || els.date;
      valid = false;
    } else if (!isValidDateStr(date)) {
      setInputError(els.date, els.dateError, 'Pick a valid date.');
      firstInvalid = firstInvalid || els.date;
      valid = false;
    } else if (date > today) {
      setInputError(els.date, els.dateError, 'Pick today or an earlier date.');
      firstInvalid = firstInvalid || els.date;
      valid = false;
    }

    if (!state.categories.some((category) => category.id === state.selectedCategoryId)) {
      setCategoryError('Choose a category.');
      firstInvalid = firstInvalid || els.categoryChips.querySelector('input');
      valid = false;
    }

    if (!valid) {
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const transaction = {
      id: uid(),
      name: name.slice(0, 60),
      amount: roundMoney(amount),
      category: state.selectedCategoryId,
      date,
      createdAt: Date.now()
    };

    state.transactions.push(transaction);
    state.selectedMonth = monthKeyFromDate(date);
    save();
    renderAll();

    els.name.value = '';
    els.amount.value = '';
    els.date.value = today;
    els.name.focus();
    pulse(els.totalBalance);
    showToast(`Added ${transaction.name} · ${money(transaction.amount)}`);
  }

  function setInputError(input, errorElement, message) {
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (errorElement) errorElement.textContent = message;
  }

  function clearFieldError(input) {
    const errorElement = input === els.name
      ? els.nameError
      : input === els.amount
        ? els.amountError
        : els.dateError;
    setInputError(input, errorElement, '');
  }

  function setCategoryError(message) {
    els.categoryError.textContent = message;
    els.categoryField.classList.toggle('is-invalid', Boolean(message));
  }

  function onListClick(event) {
    const deleteButton = event.target.closest('[data-delete-id]');
    if (deleteButton) {
      deleteTransaction(deleteButton.dataset.deleteId);
      return;
    }

    const action = event.target.closest('[data-action]');
    if (!action) return;

    if (action.dataset.action === 'focus-form') {
      focusForm();
    } else if (action.dataset.action === 'clear-search') {
      state.search = '';
      els.search.value = '';
      renderList();
      els.search.focus();
    }
  }

  function focusForm() {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    els.name.focus({ preventScroll: true });
  }

  function deleteTransaction(id) {
    const index = state.transactions.findIndex((transaction) => transaction.id === id);
    if (index === -1) return;

    const [removed] = state.transactions.splice(index, 1);
    save();
    renderAll();

    showToast(`Deleted "${removed.name}"`, 'Undo', () => {
      state.transactions.splice(Math.min(index, state.transactions.length), 0, removed);
      save();
      renderAll();
      showToast('Transaction restored.');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */

  function showToast(message, actionLabel, action) {
    if (!els.toast) return;
    clearTimeout(toastTimer);
    els.toastMessage.textContent = message;
    els.toastAction._action = typeof action === 'function' ? action : null;

    if (actionLabel && typeof action === 'function') {
      els.toastAction.hidden = false;
      els.toastAction.textContent = actionLabel;
    } else {
      els.toastAction.hidden = true;
      els.toastAction.textContent = '';
    }

    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(hideToast, 6500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (!els.toast) return;
    els.toast.classList.remove('is-visible');
    els.toastAction._action = null;
  }

  /* ------------------------------------------------------------------ */
  /* Transaction list                                                    */
  /* ------------------------------------------------------------------ */

  function renderList() {
    const query = state.search.trim().toLowerCase();
    const filtered = state.transactions.filter((transaction) => {
      if (!query) return true;
      const categoryName = getCategory(transaction.category).name.toLowerCase();
      return transaction.name.toLowerCase().includes(query) || categoryName.includes(query);
    });
    const sorted = sortTransactions(filtered);

    els.listCount.textContent = query
      ? `${filtered.length} of ${state.transactions.length}`
      : pluralize(state.transactions.length, 'item');

    els.txList.replaceChildren();

    if (state.transactions.length === 0) {
      els.txList.append(createEmptyState(
        'No transactions yet',
        'Add your first expense and it will appear here instantly.',
        'focus-form',
        'Add your first expense'
      ));
      return;
    }

    if (sorted.length === 0) {
      els.txList.append(createEmptyState(
        'No matches found',
        'Try a different name or category, or clear the search.',
        'clear-search',
        'Clear search'
      ));
      return;
    }

    const fragment = document.createDocumentFragment();

    sorted.forEach((transaction) => {
      const category = getCategory(transaction.category);

      const item = document.createElement('li');
      item.className = 'tx';

      const dot = document.createElement('span');
      dot.className = 'tx-dot';
      dot.style.setProperty('--c', category.color);

      const main = document.createElement('div');
      main.className = 'tx-main';

      const name = document.createElement('p');
      name.className = 'tx-name';
      name.textContent = transaction.name;
      name.title = transaction.name;

      const meta = document.createElement('p');
      meta.className = 'tx-meta';

      const categoryName = document.createElement('span');
      categoryName.className = 'tx-cat';
      categoryName.textContent = category.name;

      const separator = document.createElement('span');
      separator.className = 'tx-meta__sep';
      separator.textContent = '·';
      separator.setAttribute('aria-hidden', 'true');

      const time = document.createElement('time');
      time.dateTime = transaction.date;
      time.textContent = formatDate(transaction.date);

      meta.append(categoryName, separator, time);
      main.append(name, meta);

      const amount = document.createElement('span');
      amount.className = 'tx-amount';
      amount.textContent = money(transaction.amount);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tx-delete';
      remove.dataset.deleteId = transaction.id;
      remove.setAttribute('aria-label', `Delete ${transaction.name}`);
      remove.setAttribute('title', 'Delete');
      remove.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13M10 11v5M14 11v5"/>
        </svg>`;

      item.append(dot, main, amount, remove);
      fragment.append(item);
    });

    els.txList.append(fragment);
  }

  function sortTransactions(list) {
    const copy = list.slice();
    const newestFirst = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    const categoryName = (transaction) => getCategory(transaction.category).name;

    switch (state.sort) {
      case 'date-asc':
        return copy.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      case 'amount-desc':
        return copy.sort((a, b) => b.amount - a.amount || newestFirst(a, b));
      case 'amount-asc':
        return copy.sort((a, b) => a.amount - b.amount || newestFirst(a, b));
      case 'category-asc':
        return copy.sort((a, b) => categoryName(a).localeCompare(categoryName(b), undefined, { sensitivity: 'base' }) || newestFirst(a, b));
      case 'name-asc':
        return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || newestFirst(a, b));
      case 'date-desc':
      default:
        return copy.sort(newestFirst);
    }
  }

  function createEmptyState(title, text, action, label) {
    const wrapper = document.createElement('li');
    wrapper.className = 'empty';

    const icon = document.createElement('span');
    icon.className = 'empty__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/>
        <path d="M9 8h6M9 12h6M9 16h3"/>
      </svg>`;

    const heading = document.createElement('p');
    heading.className = 'empty__title';
    heading.textContent = title;

    const description = document.createElement('p');
    description.className = 'empty__text';
    description.textContent = text;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'empty__cta';
    button.dataset.action = action;
    button.textContent = label;

    wrapper.append(icon, heading, description, button);
    return wrapper;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering — everything                                              */
  /* ------------------------------------------------------------------ */

  function renderAll() {
    renderHero();
    renderChart();
    renderList();
    renderMonthly();
  }

  function renderHero() {
    const total = sumTransactions(state.transactions);
    const currentMonth = currentMonthKey();
    const monthTransactions = state.transactions.filter((transaction) => monthKeyFromDate(transaction.date) === currentMonth);
    const monthTotal = sumTransactions(monthTransactions);
    const categories = groupByCategory(state.transactions);
    const top = categories[0];

    els.totalBalance.textContent = money(total);
    els.txCount.textContent = String(state.transactions.length);
    els.heroMonth.textContent = money(monthTotal);
    els.heroMonthCount.textContent = pluralize(monthTransactions.length, 'item');
    els.heroTopCat.textContent = top
      ? `Top: ${top.category.name} · ${percentText(top.total, total)}`
      : 'No spending yet';

    els.heroRibbon.replaceChildren();

    if (categories.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'is-empty';
      els.heroRibbon.append(empty);
      return;
    }

    categories.forEach((row) => {
      const segment = document.createElement('span');
      segment.style.background = row.category.color;
      segment.style.flex = `${row.total} 1 0`;
      els.heroRibbon.append(segment);
    });
  }

  function renderChart() {
    const rows = groupByCategory(state.transactions);
    const total = sumTransactions(state.transactions);

    chartRows = rows;
    chartTotal = total;
    pinnedCategoryId = null;

    const donut = els.donut;
    donut.replaceChildren();
    donut.classList.remove('has-active');
    donut.setAttribute('role', 'img');

    const radius = 46;
    const circumference = 2 * Math.PI * radius;

    const track = createSvg('circle');
    track.setAttribute('cx', '60');
    track.setAttribute('cy', '60');
    track.setAttribute('r', String(radius));
    track.setAttribute('stroke-width', '15');
    track.setAttribute('class', 'donut-track');
    donut.append(track);

    if (rows.length > 0) {
      let offset = 0;
      const gap = rows.length > 1 ? 2.2 : 0;

      rows.forEach((row, index) => {
        const share = row.total / total;
        const length = share * circumference;
        const visible = Math.max(length - gap, 0.4);

        const segment = createSvg('circle');
        segment.setAttribute('cx', '60');
        segment.setAttribute('cy', '60');
        segment.setAttribute('r', String(radius));
        segment.setAttribute('fill', 'none');
        segment.setAttribute('stroke', row.category.color);
        segment.setAttribute('stroke-width', '15');
        segment.setAttribute('stroke-dasharray', `${visible} ${Math.max(circumference - visible, 0)}`);
        segment.setAttribute('stroke-dashoffset', String(-offset));
        segment.setAttribute('transform', 'rotate(-90 60 60)');
        segment.setAttribute('class', 'donut-seg');
        segment.dataset.categoryId = row.category.id;

        const title = createSvg('title');
        title.textContent = `${row.category.name}: ${money(row.total)} (${percentText(row.total, total)})`;
        segment.append(title);

        segment.addEventListener('pointerenter', () => previewCategory(row.category.id));
        segment.addEventListener('pointerleave', restoreCategoryFocus);
        segment.addEventListener('click', () => pinCategory(row.category.id));

        donut.append(segment);

        if (typeof segment.animate === 'function') {
          try {
            segment.animate(
              [
                { strokeDasharray: `0 ${circumference}` },
                { strokeDasharray: `${visible} ${Math.max(circumference - visible, 0)}` }
              ],
              {
                duration: 620,
                delay: index * 60,
                easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
                fill: 'backwards'
              }
            );
          } catch (error) {
            /* Animation is decorative — ignore failures. */
          }
        }

        offset += length;
      });

      const summary = rows
        .map((row) => `${row.category.name}: ${money(row.total)} (${percentText(row.total, total)})`)
        .join(', ');
      donut.setAttribute('aria-label', `Spending by category. ${summary}`);
      els.chartCaption.textContent = `All time · ${pluralize(rows.length, 'category', 'categories')}`;
    } else {
      donut.setAttribute('aria-label', 'No spending data yet');
      els.chartCaption.textContent = 'All time';
    }

    els.chartLegend.replaceChildren();

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'legend-empty';
      empty.textContent = 'Add an expense to see the breakdown.';
      els.chartLegend.append(empty);
    } else {
      rows.forEach((row) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'legend-item';
        button.dataset.categoryId = row.category.id;
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('title', `Highlight ${row.category.name}`);
        button.setAttribute('aria-label', `${row.category.name}: ${money(row.total)}, ${percentText(row.total, total)}. Highlight category.`);

        const dot = document.createElement('span');
        dot.className = 'legend__dot';
        dot.style.setProperty('--c', row.category.color);

        const name = document.createElement('span');
        name.className = 'legend__name';
        name.textContent = row.category.name;

        const percent = document.createElement('span');
        percent.className = 'legend__pct';
        percent.textContent = percentText(row.total, total);

        const value = document.createElement('span');
        value.className = 'legend__value';
        value.textContent = money(row.total);

        button.append(dot, name, percent, value);
        button.addEventListener('pointerenter', () => previewCategory(row.category.id));
        button.addEventListener('pointerleave', restoreCategoryFocus);
        button.addEventListener('focus', () => previewCategory(row.category.id));
        button.addEventListener('blur', restoreCategoryFocus);
        button.addEventListener('click', () => pinCategory(row.category.id));

        els.chartLegend.append(button);
      });
    }

    resetDonutCenter();
  }

  function percentText(part, total) {
    if (!total) return '0%';
    const percent = (part / total) * 100;
    if (percent > 0 && percent < 1) return '<1%';
    return `${Math.round(percent)}%`;
  }

  function resetDonutCenter() {
    els.donutLabel.textContent = 'Total spent';
    els.donutValue.textContent = money(chartTotal);
    els.donutSub.textContent = chartTotal > 0
      ? pluralize(chartRows.length, 'category', 'categories')
      : 'No spending yet';
  }

  function previewCategory(categoryId) {
    paintChartFocus(categoryId);
  }

  function restoreCategoryFocus() {
    paintChartFocus(pinnedCategoryId);
  }

  function pinCategory(categoryId) {
    pinnedCategoryId = pinnedCategoryId === categoryId ? null : categoryId;
    els.chartLegend.querySelectorAll('[data-category-id]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.categoryId === pinnedCategoryId));
    });
    paintChartFocus(pinnedCategoryId);
  }

  function paintChartFocus(categoryId) {
    const row = chartRows.find((item) => item.category.id === categoryId) || null;
    const activeId = row ? row.category.id : null;

    els.donut.classList.toggle('has-active', Boolean(activeId));
    els.donut.querySelectorAll('.donut-seg').forEach((segment) => {
      segment.classList.toggle('is-active', segment.dataset.categoryId === activeId);
    });

    if (row) {
      els.donutLabel.textContent = row.category.name;
      els.donutValue.textContent = money(row.total);
      els.donutSub.textContent = `${percentText(row.total, chartTotal)} of spending`;
    } else {
      resetDonutCenter();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Monthly summary                                                     */
  /* ------------------------------------------------------------------ */

  function monthBounds() {
    const keys = state.transactions.map((transaction) => monthKeyFromDate(transaction.date));
    keys.push(currentMonthKey());
    keys.sort();
    return { min: keys[0], max: keys[keys.length - 1] };
  }

  function changeMonth(delta) {
    const bounds = monthBounds();
    const next = shiftMonth(state.selectedMonth, delta);
    if (next < bounds.min || next > bounds.max) return;
    state.selectedMonth = next;
    renderMonthly();
  }

  function renderMonthly() {
    const bounds = monthBounds();

    if (state.selectedMonth < bounds.min) state.selectedMonth = bounds.min;
    if (state.selectedMonth > bounds.max) state.selectedMonth = bounds.max;

    const key = state.selectedMonth;
    const current = currentMonthKey();
    const transactions = state.transactions.filter((transaction) => monthKeyFromDate(transaction.date) === key);
    const total = sumTransactions(transactions);
    const categories = groupByCategory(transactions);
    const top = categories[0];
    const previousKey = shiftMonth(key, -1);
    const previousTransactions = state.transactions.filter((transaction) => monthKeyFromDate(transaction.date) === previousKey);
    const previousTotal = sumTransactions(previousTransactions);

    els.monthLabel.textContent = monthLabel(key);
    els.monthTotal.textContent = money(total);
    els.monthCount.textContent = String(transactions.length);

    const days = key === current ? new Date().getDate() : daysInMonth(key);
    els.monthAvg.textContent = money(total / days);

    els.monthTop.replaceChildren();
    els.monthTop.removeAttribute('title');
    if (top) {
      const dot = document.createElement('span');
      dot.className = 'mini-dot';
      dot.style.setProperty('--c', top.category.color);
      const label = document.createElement('span');
      label.textContent = top.category.name;
      els.monthTop.append(dot, label);
      els.monthTop.title = top.category.name;
    } else {
      els.monthTop.textContent = '—';
    }

    els.monthDelta.className = 'delta is-flat';
    if (previousTotal > 0) {
      const change = ((total - previousTotal) / previousTotal) * 100;
      if (Math.abs(change) < 0.5) {
        els.monthDelta.textContent = 'Same as last month';
      } else {
        els.monthDelta.className = `delta ${change > 0 ? 'is-up' : 'is-down'}`;
        els.monthDelta.textContent = `${change > 0 ? '↑' : '↓'} ${Math.abs(Math.round(change))}% vs ${shortMonthLabel(previousKey)}`;
      }
    } else if (total > 0) {
      els.monthDelta.textContent = 'No spend last month';
    } else {
      els.monthDelta.textContent = 'No spending';
    }

    els.monthPrev.disabled = key <= bounds.min;
    els.monthNext.disabled = key >= bounds.max;

    els.monthCategories.replaceChildren();

    if (categories.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'bars-empty';
      empty.textContent = 'Nothing spent in this month yet.';
      els.monthCategories.append(empty);
    } else {
      const visibleRows = categories.slice(0, 6);

      visibleRows.forEach((row) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'cat-bar';

        const head = document.createElement('div');
        head.className = 'cat-bar__head';

        const name = document.createElement('span');
        name.className = 'cat-bar__name';
        const dot = document.createElement('span');
        dot.className = 'mini-dot';
        dot.style.setProperty('--c', row.category.color);
        const nameText = document.createElement('span');
        nameText.textContent = row.category.name;
        name.append(dot, nameText);

        const amount = document.createElement('span');
        amount.className = 'cat-bar__amount';
        amount.textContent = `${money(row.total)} · ${percentText(row.total, total)}`;

        head.append(name, amount);

        const track = document.createElement('div');
        track.className = 'cat-bar__track';
        const fill = document.createElement('span');
        fill.className = 'cat-bar__fill';
        fill.style.width = `${Math.max((row.total / total) * 100, 1.5)}%`;
        fill.style.background = row.category.color;
        track.append(fill);

        wrapper.append(head, track);
        els.monthCategories.append(wrapper);
      });

      if (categories.length > visibleRows.length) {
        const more = document.createElement('p');
        more.className = 'bars-empty';
        more.textContent = `+ ${categories.length - visibleRows.length} more ${categories.length - visibleRows.length === 1 ? 'category' : 'categories'}`;
        els.monthCategories.append(more);
      }
    }

    renderMonthTrend(key);
  }

  function renderMonthTrend(selectedKey) {
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      months.push(shiftMonth(selectedKey, -offset));
    }

    const totals = months.map((month) => {
      const total = sumTransactions(state.transactions.filter((transaction) => monthKeyFromDate(transaction.date) === month));
      return { month, total };
    });
    const maximum = Math.max(...totals.map((entry) => entry.total), 1);

    els.monthBars.replaceChildren();

    totals.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'trend-btn';
      button.dataset.month = entry.month;
      button.setAttribute('aria-pressed', String(entry.month === selectedKey));
      button.setAttribute('aria-label', `${monthLabel(entry.month)}: ${money(entry.total)}. Show this month.`);
      button.title = `${monthLabel(entry.month)} · ${money(entry.total)}`;

      const track = document.createElement('span');
      track.className = 'trend-btn__track';

      const fill = document.createElement('span');
      fill.className = 'trend-btn__fill';
      fill.style.height = entry.total > 0 ? `${Math.max((entry.total / maximum) * 100, 4)}%` : '0%';
      track.append(fill);

      const label = document.createElement('span');
      label.className = 'trend-btn__label';
      label.textContent = shortMonthLabel(entry.month);

      button.append(track, label);
      els.monthBars.append(button);
    });
  }


})();
