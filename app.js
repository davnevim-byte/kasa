/* ═══════════════════════════════════════
   KASA — Rodinné Finance
   app.js — hlavní logika aplikace
═══════════════════════════════════════ */

'use strict';

// ═══ KONFIGURACE KATEGORIÍ ═══

const CATEGORIES = [
  { id: 'jidlo',      name: 'Jídlo',       icon: '🛒', color: '#f97316', type: 'both' },
  { id: 'domacnost',  name: 'Domácnost',   icon: '🏠', color: '#3b82f6', type: 'both' },
  { id: 'doprava',    name: 'Doprava',      icon: '🚗', color: '#8b5cf6', type: 'both' },
  { id: 'obleceni',   name: 'Oblečení',    icon: '👗', color: '#ec4899', type: 'both' },
  { id: 'zdravi',     name: 'Zdraví',      icon: '💊', color: '#10b981', type: 'both' },
  { id: 'zabava',     name: 'Zábava',      icon: '🎬', color: '#f59e0b', type: 'both' },
  { id: 'tech',       name: 'Tech',         icon: '📱', color: '#06b6d4', type: 'both' },
  { id: 'cestovani',  name: 'Cestování',   icon: '✈️', color: '#0ea5e9', type: 'both' },
  { id: 'vzdelani',   name: 'Vzdělání',    icon: '🎓', color: '#7c3aed', type: 'both' },
  { id: 'navstevy',   name: 'Návštěvy',    icon: '🫂', color: '#f43f5e', type: 'both' },
  { id: 'vyplata',    name: 'Výplata',     icon: '💼', color: '#22c55e', type: 'income' },
  { id: 'jine',       name: 'Jiné příjmy', icon: '💰', color: '#84cc16', type: 'income' },
];

const EXPENSE_CATS = CATEGORIES.filter(c => c.type !== 'income');
const ALL_CATS = CATEGORIES;

// ═══ STAV APLIKACE ═══

const state = {
  currentScreen: 'dashboard',
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  txFilter: 'all',
  searchQuery: '',
  editingTxId: null,
  cameraStream: null,
};

// ═══ DATOVÁ VRSTVA ═══

const DB = {
  // Načíst všechny transakce
  getTransactions() {
    try {
      return JSON.parse(localStorage.getItem('kasa_transactions') || '[]');
    } catch { return []; }
  },

  // Uložit všechny transakce
  saveTransactions(txs) {
    localStorage.setItem('kasa_transactions', JSON.stringify(txs));
  },

  // Přidat transakci
  addTransaction(tx) {
    const txs = this.getTransactions();
    txs.unshift(tx);
    this.saveTransactions(txs);
    // Sync Supabase pokud dostupný
    if (window.SupaSync) SupaSync.pushTransaction(tx);
  },

  // Smazat transakci
  deleteTransaction(id) {
    const txs = this.getTransactions().filter(t => t.id !== id);
    this.saveTransactions(txs);
    if (window.SupaSync) SupaSync.deleteTransaction(id);
  },

  // Transakce pro daný měsíc/rok
  getMonthTransactions(month, year) {
    return this.getTransactions().filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  },

  // Nastavení
  getSetting(key, def = null) {
    const v = localStorage.getItem('kasa_' + key);
    if (v === null) return def;
    try { return JSON.parse(v); } catch { return v; }
  },

  setSetting(key, val) {
    localStorage.setItem('kasa_' + key, typeof val === 'string' ? val : JSON.stringify(val));
  },

  // Budgety
  getBudgets() {
    try {
      return JSON.parse(localStorage.getItem('kasa_budgets') || '{}');
    } catch { return {}; }
  },

  setBudgets(b) {
    localStorage.setItem('kasa_budgets', JSON.stringify(b));
  },

  // Opakující se výdaje
  getRecurring() {
    try {
      return JSON.parse(localStorage.getItem('kasa_recurring') || '[]');
    } catch { return []; }
  },

  saveRecurring(r) {
    localStorage.setItem('kasa_recurring', JSON.stringify(r));
  },

  // Rychlé šablony
  getTemplates() {
    try {
      return JSON.parse(localStorage.getItem('kasa_templates') || '[]');
    } catch { return []; }
  },

  saveTemplates(t) {
    localStorage.setItem('kasa_templates', JSON.stringify(t));
  },
};


// ═══ VÝCHOZÍ NASTAVENÍ (předvyplněno) ═══
(function initDefaults() {
  if (!localStorage.getItem('kasa_sb_url'))  localStorage.setItem('kasa_sb_url',  'https://vmcofryclsvsbdttzkhs.supabase.co');
  if (!localStorage.getItem('kasa_sb_key'))  localStorage.setItem('kasa_sb_key',  'sb_publishable_vo7EGx2VNfZ11_L2_FNYlw_bHfhAZmU');
  if (!localStorage.getItem('kasa_gemini_key')) localStorage.setItem('kasa_gemini_key', 'AIzaSyBVAkO9jiX2nljYfJUFiiSJovdyHxBrapg');
})();

// ═══ POMOCNÉ FUNKCE ═══

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtCZK(amount) {
  const abs = Math.abs(amount);
  return abs.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' Kč';
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || { name: 'Ostatní', icon: '📎', color: '#6b7280' };
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

const MONTH_NAMES = [
  'Leden','Únor','Březen','Duben','Květen','Červen',
  'Červenec','Srpen','Září','Říjen','Listopad','Prosinec'
];

// Toast notifikace
let toastTimer;
function showToast(msg, type = '') {
  let el = document.getElementById('toast-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-el';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  requestAnimationFrame(() => {
    el.classList.add('show');
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  });
}


// ═══ TÉMA (světlý / tmavý) ═══

const Theme = (() => {
  const KEY = 'kasa_theme';

  function apply(mode) {
    document.body.classList.toggle('light', mode === 'light');
    // Aktualizuj meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = mode === 'light' ? '#f5f4f0' : '#0b0d16';
  }

  function toggle() {
    const current = DB.getSetting(KEY, 'dark');
    const next = current === 'dark' ? 'light' : 'dark';
    DB.setSetting(KEY, next);
    apply(next);
    updateToggleUI();
  }

  function updateToggleUI() {
    const input = document.getElementById('theme-toggle-input');
    if (input) input.checked = DB.getSetting(KEY, 'dark') === 'light';
  }

  function init() {
    // Aplikuj uložené téma okamžitě
    apply(DB.getSetting(KEY, 'dark'));

    // Toggle v nastavení
    const input = document.getElementById('theme-toggle-input');
    if (input) {
      updateToggleUI();
      input.addEventListener('change', toggle);
    }
  }

  return { init, apply, updateToggleUI };
})();

// ═══ PIN SYSTÉM ═══

const PinManager = (() => {
  const PIN_KEY = 'kasa_pin';
  const DEFAULT_PIN = '142023';

  let entered = '';
  let mode = 'verify'; // 'verify' | 'set_new_1' | 'set_new_2'
  let newPinTemp = '';

  function init() {
    // Nastav výchozí PIN pokud není uložen
    if (!localStorage.getItem(PIN_KEY)) {
      localStorage.setItem(PIN_KEY, DEFAULT_PIN);
    }

    // Numpad
    document.querySelectorAll('.num-btn[data-num]').forEach(btn => {
      btn.addEventListener('click', () => pressDigit(btn.dataset.num));
    });
    document.getElementById('pin-del').addEventListener('click', deleteDigit);

    // Klávesnice
    document.addEventListener('keydown', e => {
      if (!document.getElementById('screen-pin').classList.contains('hidden')) {
        if (e.key >= '0' && e.key <= '9') pressDigit(e.key);
        if (e.key === 'Backspace') deleteDigit();
      }
    });
  }

  function pressDigit(d) {
    if (entered.length >= 6) return;
    entered += d;
    updateDots();
    if (entered.length === 6) {
      setTimeout(() => check(), 120);
    }
  }

  function deleteDigit() {
    entered = entered.slice(0, -1);
    updateDots();
  }

  function updateDots() {
    ['d1','d2','d3','d4','d5','d6'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('filled', i < entered.length);
    });
  }

  function check() {
    if (mode === 'verify') {
      const saved = localStorage.getItem(PIN_KEY);
      if (entered === saved) {
        // Správný PIN
        document.getElementById('screen-pin').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        App.init();
      } else {
        showError('Špatný PIN');
        shake();
        entered = '';
        updateDots();
      }
    } else if (mode === 'set_new_1') {
      newPinTemp = entered;
      entered = '';
      updateDots();
      setSubtitle('Zadejte PIN znovu pro potvrzení');
      mode = 'set_new_2';
    } else if (mode === 'set_new_2') {
      if (entered === newPinTemp) {
        localStorage.setItem(PIN_KEY, entered);
        showToast('✓ PIN byl změněn', 'success');
        // Návrat do nastavení
        entered = '';
        newPinTemp = '';
        mode = 'verify';
        document.getElementById('screen-pin').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        setSubtitle('Zadejte PIN');
      } else {
        showError('PINy se neshodují');
        shake();
        entered = '';
        newPinTemp = '';
        mode = 'set_new_1';
        setSubtitle('Zvolte nový PIN (6 číslic)');
        updateDots();
      }
    }
  }

  function showError(msg) {
    document.getElementById('pin-error').textContent = msg;
    setTimeout(() => { document.getElementById('pin-error').textContent = ''; }, 2000);
  }

  function setSubtitle(txt) {
    document.getElementById('pin-subtitle').textContent = txt;
  }

  function shake() {
    const dots = document.querySelector('.pin-dots');
    dots.classList.remove('shake');
    void dots.offsetWidth;
    dots.classList.add('shake');
  }

  function startChangePin() {
    mode = 'set_new_1';
    entered = '';
    updateDots();
    setSubtitle('Zvolte nový PIN (6 číslic)');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('screen-pin').classList.remove('hidden');
  }

  return { init, startChangePin };
})();

// ═══ NAVIGACE ═══

const Nav = (() => {
  function goTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item[data-screen]').forEach(b => b.classList.remove('active'));

    const screen = document.getElementById('screen-' + screenId);
    if (screen) screen.classList.add('active');

    const navBtn = document.querySelector(`.nav-item[data-screen="${screenId}"]`);
    if (navBtn) navBtn.classList.add('active');

    state.currentScreen = screenId;

    // Refresh dat při přepnutí
    if (screenId === 'dashboard') Dashboard.render();
    if (screenId === 'transactions') TxList.render();
    if (screenId === 'stats') Stats.render();
    if (screenId === 'settings') Settings.load();
  }

  function init() {
    document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.screen));
    });
  }

  return { init, goTo };
})();


// ═══ RYCHLÉ ŠABLONY ═══

const Templates = (() => {
  let longPressTimer = null;

  function render() {
    const row = document.getElementById('templates-row');
    const tpls = DB.getTemplates();

    if (!tpls.length) {
      row.innerHTML = '<div class="tpl-empty">Žádné šablony — přidej první tapem na "+ Přidat"</div>';
      return;
    }

    row.innerHTML = tpls.map((t, i) => {
      const cat = getCat(t.category);
      return `
        <button class="tpl-btn" data-idx="${i}">
          <div class="tpl-badge">✎</div>
          <div class="tpl-ico">${cat.icon}</div>
          <div class="tpl-name">${t.name || cat.name}</div>
          <div class="tpl-amt">${fmtCZK(t.amount)}</div>
        </button>`;
    }).join('');

    row.querySelectorAll('.tpl-btn').forEach(btn => {
      // Krátký tap = použít šablonu
      btn.addEventListener('click', () => {
        const t = DB.getTemplates()[+btn.dataset.idx];
        if (!t) return;
        useTpl(t);
      });

      // Dlouhý tap = editovat/smazat
      btn.addEventListener('pointerdown', () => {
        longPressTimer = setTimeout(() => {
          btn.classList.add('long-press');
          showTplMenu(+btn.dataset.idx);
          btn.classList.remove('long-press');
        }, 550);
      });
      btn.addEventListener('pointerup', () => clearTimeout(longPressTimer));
      btn.addEventListener('pointerleave', () => clearTimeout(longPressTimer));
    });
  }

  function useTpl(t) {
    AddTx.open({
      type: t.type || 'expense',
      amount: t.amount,
      category: t.category,
      description: t.name,
    });
    showToast(`Šablona: ${t.name} — zkontroluj a ulož`, '');
  }

  function showAddModal(editIdx = null) {
    const existing = editIdx !== null ? DB.getTemplates()[editIdx] : null;

    const bg = document.createElement('div');
    bg.className = 'tpl-modal-bg';

    const cats = EXPENSE_CATS.map(c =>
      `<option value="${c.id}" ${existing?.category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');

    bg.innerHTML = `
      <div class="tpl-modal">
        <div class="tpl-modal-title">${existing ? 'Upravit šablonu' : 'Nová šablona'}</div>
        <div class="field-section">
          <div class="field-label">Název</div>
          <input id="tpl-name" class="field-input" placeholder="např. Albert, Benzín..." value="${existing?.name || ''}">
        </div>
        <div class="field-section">
          <div class="field-label">Částka (Kč)</div>
          <input id="tpl-amount" class="field-input" type="number" inputmode="decimal" placeholder="0" value="${existing?.amount || ''}">
        </div>
        <div class="field-section">
          <div class="field-label">Kategorie</div>
          <select id="tpl-cat" class="field-input" style="background:var(--s1)">${cats}</select>
        </div>
        <div class="tpl-modal-actions">
          <button class="tpl-action-btn primary" id="tpl-save">Uložit šablonu</button>
          ${existing ? '<button class="tpl-action-btn danger" id="tpl-delete">Smazat šablonu</button>' : ''}
          <button class="tpl-action-btn secondary" id="tpl-cancel">Zrušit</button>
        </div>
      </div>`;

    document.body.appendChild(bg);
    setTimeout(() => document.getElementById('tpl-name').focus(), 100);

    const close = () => bg.remove();

    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    document.getElementById('tpl-cancel').addEventListener('click', close);

    document.getElementById('tpl-save').addEventListener('click', () => {
      const name = document.getElementById('tpl-name').value.trim();
      const amount = parseFloat(document.getElementById('tpl-amount').value);
      const category = document.getElementById('tpl-cat').value;
      if (!name) { showToast('Zadej název', 'error'); return; }
      if (!amount || amount <= 0) { showToast('Zadej částku', 'error'); return; }

      const tpls = DB.getTemplates();
      const tpl = { id: genId(), name, amount, category, type: 'expense' };
      if (editIdx !== null) tpls[editIdx] = { ...tpls[editIdx], ...tpl };
      else tpls.push(tpl);
      if (tpls.length > 8) { showToast('Max. 8 šablon', 'error'); return; }
      DB.saveTemplates(tpls);
      close();
      render();
      showToast('Šablona uložena ✓', 'success');
    });

    if (existing) {
      document.getElementById('tpl-delete').addEventListener('click', () => {
        const tpls = DB.getTemplates();
        tpls.splice(editIdx, 1);
        DB.saveTemplates(tpls);
        close();
        render();
        showToast('Šablona smazána', '');
      });
    }
  }

  function showTplMenu(idx) {
    showAddModal(idx);
  }

  function init() {
    document.getElementById('btn-add-template').addEventListener('click', () => showAddModal());
  }

  return { init, render };
})();

// ═══ DASHBOARD ═══

const Dashboard = (() => {
  function render() {
    const { currentMonth: m, currentYear: y } = state;
    document.getElementById('month-label').textContent = MONTH_NAMES[m] + ' ' + y;

    const txs = DB.getMonthTransactions(m, y);
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net = income - expense;

    const netEl = document.getElementById('balance-net');
    netEl.textContent = (net >= 0 ? '+' : '') + fmtCZK(net);
    netEl.style.color = net >= 0 ? 'var(--green)' : 'var(--rose)';

    document.getElementById('total-income').textContent = '+' + fmtCZK(income);
    document.getElementById('total-expenses').textContent = '-' + fmtCZK(expense);

    Templates.render();
    renderCatsGrid(txs.filter(t => t.type === 'expense'));
    renderRecent(txs);
  }

  function renderCatsGrid(expTxs) {
    const budgets = DB.getBudgets();
    const totals = {};
    expTxs.forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    // Minulý měsíc pro trendy
    let prevM = state.currentMonth - 1, prevY = state.currentYear;
    if (prevM < 0) { prevM = 11; prevY--; }
    const prevTxs = DB.getMonthTransactions(prevM, prevY).filter(t => t.type === 'expense');
    const prevTotals = {};
    prevTxs.forEach(t => { prevTotals[t.category] = (prevTotals[t.category] || 0) + t.amount; });

    const sorted = EXPENSE_CATS
      .map(c => ({ ...c, total: totals[c.id] || 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);

    const grid = document.getElementById('cats-grid');
    if (sorted.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div>Zatím žádné výdaje</div></div>';
      return;
    }

    grid.innerHTML = sorted.map(c => {
      const budget = budgets[c.id];
      let budgetBar = '';
      if (budget && budget > 0) {
        const pct = Math.min((c.total / budget) * 100, 100);
        const col = pct >= 90 ? '#ef4455' : pct >= 70 ? '#f59e0b' : '#2fd6be';
        budgetBar = `
          <div class="cat-budget-bar">
            <div class="cat-budget-fill" style="width:${pct}%;background:${col}"></div>
          </div>`;
      }
      // Trend vs minulý měsíc
      let trendBadge = '';
      const prevAmt = prevTotals[c.id] || 0;
      if (c.total > 0 && prevAmt > 0) {
        const pct = Math.round(((c.total - prevAmt) / prevAmt) * 100);
        if (Math.abs(pct) > 5) {
          const cls = pct > 0 ? 'up' : 'down';
          trendBadge = `<div class="cat-trend ${cls}">${pct > 0 ? '+' : ''}${pct}%</div>`;
        }
      }
      return `
        <div class="cat-tile" style="--cat-c:${c.color}">
          <div class="ct-icon">${c.icon}</div>
          <div class="ct-name">${c.name}</div>
          <div class="ct-amt">${fmtCZK(c.total)}</div>
          ${trendBadge}
          ${budgetBar}
        </div>`;
    }).join('');
  }

  function renderRecent(txs) {
    const el = document.getElementById('recent-list');
    const recent = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    el.innerHTML = renderTxItems(recent) || '<div class="empty-state"><div class="empty-icon">✦</div><div>Zatím žádné transakce</div></div>';
  }

  function initMonthNav() {
    document.getElementById('prev-month').addEventListener('click', () => {
      state.currentMonth--;
      if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
      render();
    });
    document.getElementById('next-month').addEventListener('click', () => {
      const now = new Date();
      if (state.currentYear === now.getFullYear() && state.currentMonth === now.getMonth()) return;
      state.currentMonth++;
      if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
      render();
    });
    document.getElementById('btn-sync').addEventListener('click', () => {
      if (window.SupaSync) {
        SupaSync.pull().then(() => { render(); showToast('Synchronizováno ✓', 'success'); });
      } else {
        showToast('Supabase není nastaveno', 'error');
      }
    });
  }

  return { render, initMonthNav };
})();

// ═══ SEZNAM TRANSAKCÍ (sdílená funkce renderování) ═══

function renderTxItems(txs) {
  if (!txs.length) return '';
  return txs.map(tx => {
    const cat = getCat(tx.category);
    const name1 = DB.getSetting('name1', 'Já');
    const name2 = DB.getSetting('name2', 'Partner');
    const personLabel = tx.person === 'p2' ? name2 : name1;
    return `
      <div class="tx-item" data-id="${tx.id}">
        <div class="tx-ico" style="background:color-mix(in srgb, ${cat.color} 15%, var(--s1))">${cat.icon}</div>
        <div class="tx-body">
          <div class="tx-desc">${tx.description || cat.name}</div>
          <div class="tx-meta">${fmtDate(tx.date)} · ${personLabel}${tx.notes ? ' · ' + tx.notes : ''}</div>
        </div>
        <div class="tx-amt ${tx.type}">${tx.type === 'expense' ? '-' : '+'}${fmtCZK(tx.amount)}</div>
      ${tx.photos && tx.photos.length ? `<span style="font-size:13px;flex-shrink:0" title="${tx.photos.length} foto">🖼</span>` : ''}
      </div>`;
  }).join('');
}

// ═══ SEZNAM TRANSAKCÍ (obrazovka) ═══

const TxList = (() => {
  function render() {
    const { currentMonth: m, currentYear: y, txFilter, searchQuery } = state;
    let txs = DB.getMonthTransactions(m, y);

    // Filtr type
    if (txFilter === 'expense') txs = txs.filter(t => t.type === 'expense');
    if (txFilter === 'income') txs = txs.filter(t => t.type === 'income');

    // Hledání
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      txs = txs.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        getCat(t.category).name.toLowerCase().includes(q)
      );
    }

    // Seřadit podle data
    txs.sort((a, b) => new Date(b.date) - new Date(a.date));

    const el = document.getElementById('transactions-list');
    if (!txs.length) {
      el.innerHTML = '<div class="empty-state" style="margin-top:40px"><div class="empty-icon">🔍</div><div>Žádné transakce nenalezeny</div></div>';
      return;
    }

    // Seskupit dle data
    const groups = {};
    txs.forEach(tx => {
      const d = tx.date;
      if (!groups[d]) groups[d] = [];
      groups[d].push(tx);
    });

    el.innerHTML = Object.entries(groups).map(([date, items]) => `
      <div class="tx-date-group">
        <div class="tx-date-lbl">${fmtDate(date)}</div>
        <div class="tx-list">${renderTxItems(items)}</div>
      </div>
    `).join('');

    // Click na tx → smazat/detail
    el.querySelectorAll('.tx-item').forEach(item => {
      item.addEventListener('click', () => AddTx.openEdit(item.dataset.id));
    });
  }

  function initFilters() {
    document.querySelectorAll('#filter-chips .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filter-chips .chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.txFilter = btn.dataset.filter;
        render();
      });
    });
    document.getElementById('search-input').addEventListener('input', e => {
      state.searchQuery = e.target.value;
      render();
    });
  }

  return { render, initFilters };
})();

// ═══ PŘIDAT / EDITOVAT TRANSAKCI ═══

const AddTx = (() => {
  let currentType = 'expense';
  let selectedCat = null;
  let selectedPerson = 'p1';
  let isEdit = false;
  let editId = null;

  let photos = []; // {dataUrl, url, uploading}

  function open(preset = {}) {
    isEdit = false;
    editId = null;
    currentType = preset.type || 'expense';
    selectedCat = preset.category || null;
    selectedPerson = 'p1';
    photos = [];

    document.getElementById('tx-amount').value = preset.amount || '';
    document.getElementById('tx-desc').value = preset.description || '';
    document.getElementById('tx-date').value = preset.date || todayISO();
    document.getElementById('tx-note').value = preset.notes || '';
    renderPhotoRow();

    // Overlay title
    document.querySelector('#overlay-add .ol-title').textContent = 'Nová transakce';
    document.getElementById('save-tx').textContent = 'Uložit';

    updateTypeSwitch();
    renderCatGrid();
    renderPersonSw();
    openOverlay('overlay-add');
    setTimeout(() => document.getElementById('tx-amount').focus(), 350);
  }

  function openEdit(id) {
    const tx = DB.getTransactions().find(t => t.id === id);
    if (!tx) return;
    isEdit = true;
    editId = id;
    currentType = tx.type;
    selectedCat = tx.category;
    selectedPerson = tx.person || 'p1';

    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-desc').value = tx.description || '';
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-note').value = tx.notes || '';

    document.querySelector('#overlay-add .ol-title').textContent = 'Upravit transakci';
    document.getElementById('save-tx').textContent = 'Uložit';

    // Načti existující fotky
    photos = (tx.photos || []).map(url => ({ url, dataUrl: null, uploading: false }));

    updateTypeSwitch();
    renderCatGrid();
    renderPersonSw();
    renderPhotoRow();
    openOverlay('overlay-add');

    // Přidej tlačítko smazat
    addDeleteBtn(id);
  }

  function addDeleteBtn(id) {
    let btn = document.getElementById('delete-tx-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'delete-tx-btn';
      btn.className = 'sg-btn danger';
      btn.style.cssText = 'margin-top:8px;margin-bottom:16px';
      document.querySelector('.overlay-scroll').appendChild(btn);
    }
    btn.textContent = '🗑 Smazat transakci';
    btn.style.display = 'block';
    btn.onclick = () => {
      if (confirm('Opravdu smazat tuto transakci?')) {
        DB.deleteTransaction(id);
        closeOverlay('overlay-add');
        refreshCurrentScreen();
        showToast('Transakce smazána', 'error');
      }
    };
  }

  function updateTypeSwitch() {
    document.querySelectorAll('.ts-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === currentType);
    });
    renderCatGrid();
  }

  function renderCatGrid() {
    const cats = currentType === 'income'
      ? CATEGORIES.filter(c => c.type === 'income')
      : EXPENSE_CATS;

    document.getElementById('cat-grid').innerHTML = cats.map(c => `
      <button class="cg-btn ${selectedCat === c.id ? 'sel' : ''}"
              style="--cc:${c.color}"
              data-cat="${c.id}">
        <span class="cg-ico">${c.icon}</span>
        <span class="cg-lbl">${c.name}</span>
      </button>
    `).join('');

    document.querySelectorAll('.cg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCat = btn.dataset.cat;
        document.querySelectorAll('.cg-btn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      });
    });
  }

  function renderPersonSw() {
    const n1 = DB.getSetting('name1', 'Já');
    const n2 = DB.getSetting('name2', 'Partner');
    document.getElementById('person-sw').innerHTML = `
      <button class="psw-btn ${selectedPerson === 'p1' ? 'active' : ''}" data-p="p1">${n1}</button>
      <button class="psw-btn ${selectedPerson === 'p2' ? 'active' : ''}" data-p="p2">${n2}</button>
    `;
    document.querySelectorAll('.psw-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPerson = btn.dataset.p;
        document.querySelectorAll('.psw-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function save() {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    if (!amount || amount <= 0) { showToast('Zadejte částku', 'error'); return; }
    if (!selectedCat) { showToast('Vyberte kategorii', 'error'); return; }

    const tx = {
      id: isEdit ? editId : genId(),
      type: currentType,
      amount,
      category: selectedCat,
      description: document.getElementById('tx-desc').value.trim(),
      date: document.getElementById('tx-date').value || todayISO(),
      person: selectedPerson,
      notes: document.getElementById('tx-note').value.trim(),
      photos: photos.filter(p => p.url).map(p => p.url),
      createdAt: isEdit
        ? (DB.getTransactions().find(t => t.id === editId)?.createdAt || Date.now())
        : Date.now(),
    };

    if (isEdit) {
      const txs = DB.getTransactions().map(t => t.id === editId ? tx : t);
      DB.saveTransactions(txs);
      if (window.SupaSync) SupaSync.pushTransaction(tx);
      showToast('Transakce upravena ✓', 'success');
    } else {
      DB.addTransaction(tx);
      showToast((tx.type === 'expense' ? '−' : '+') + fmtCZK(tx.amount) + ' uloženo ✓', 'success');
    }

    closeOverlay('overlay-add');
    refreshCurrentScreen();
    checkBudgets(tx);
  }

  function checkBudgets(tx) {
    if (tx.type !== 'expense') return;
    const budgets = DB.getBudgets();
    const budget = budgets[tx.category];
    if (!budget) return;
    const { currentMonth: m, currentYear: y } = state;
    const monthTxs = DB.getMonthTransactions(m, y).filter(t => t.type === 'expense' && t.category === tx.category);
    const total = monthTxs.reduce((s, t) => s + t.amount, 0);
    const pct = (total / budget) * 100;
    const cat = getCat(tx.category);
    if (pct >= 100) {
      showToast(`⚠️ ${cat.name}: překročen limit!`, 'error');
      Notifs.send(
        `⚠️ Limit překročen — ${cat.icon} ${cat.name}`,
        `Utratili jste ${fmtCZK(total)} z limitu ${fmtCZK(budget)} (${Math.round(pct)}%)`,
        'over'
      );
    } else if (pct >= 80) {
      showToast(`⚡ ${cat.name}: ${Math.round(pct)}% limitu`, '');
      Notifs.send(
        `⚡ Blíží se limit — ${cat.icon} ${cat.name}`,
        `Utratili jste ${Math.round(pct)}% z měsíčního limitu (${fmtCZK(total)} / ${fmtCZK(budget)})`,
        'warn'
      );
    }
  }

  function renderPhotoRow() {
    const row = document.getElementById('photo-row');
    if (!row) return;
    const thumbs = photos.map((p, i) => {
      const src = p.dataUrl || p.url || '';
      return `
        <div class="photo-thumb-wrap" data-i="${i}">
          <img class="photo-thumb" src="${src}" alt="foto">
          ${p.uploading ? '<div class="photo-uploading"><div class="proc-ring"></div></div>' : ''}
          <button class="photo-del" data-del="${i}">×</button>
        </div>`;
    }).join('');

    row.innerHTML = thumbs + `
      <label class="photo-add-btn" id="photo-add-label">
        <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none">
        <span class="photo-add-ico">＋</span>
        <span class="photo-add-txt">Přidat foto</span>
      </label>`;

    // Click thumb = lightbox
    row.querySelectorAll('.photo-thumb-wrap').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('photo-del')) return;
        const p = photos[+el.dataset.i];
        openLightbox(p.dataUrl || p.url);
      });
    });

    // Delete
    row.querySelectorAll('.photo-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        photos.splice(+btn.dataset.del, 1);
        renderPhotoRow();
      });
    });

    // File input
    document.getElementById('photo-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      const idx = photos.length;
      photos.push({ dataUrl, url: null, uploading: true });
      renderPhotoRow();
      // Upload na Supabase
      const url = await PhotoStore.upload(file);
      photos[idx].url = url || dataUrl; // fallback na dataUrl pokud Supabase není
      photos[idx].uploading = false;
      renderPhotoRow();
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.readAsDataURL(file);
    });
  }

  function init() {
    document.getElementById('nav-add').addEventListener('click', () => open());
    document.getElementById('close-add').addEventListener('click', () => closeOverlay('overlay-add'));
    document.getElementById('save-tx').addEventListener('click', save);
    document.getElementById('btn-open-scan').addEventListener('click', () => {
      Camera.open();
    });

    document.querySelectorAll('.ts-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentType = btn.dataset.type;
        updateTypeSwitch();
      });
    });

    // Klik na tx v dashboardu
    document.getElementById('recent-list').addEventListener('click', e => {
      const item = e.target.closest('.tx-item');
      if (item) openEdit(item.dataset.id);
    });
  }

  return { init, open, openEdit, renderPersonSw };
})();

// ═══ LIGHTBOX ═══

function openLightbox(src) {
  const bg = document.createElement('div');
  bg.className = 'lightbox-bg';
  bg.innerHTML = `
    <img class="lightbox-img" src="${src}" alt="foto">
    <button class="lightbox-close">✕</button>`;
  document.body.appendChild(bg);
  bg.addEventListener('click', e => {
    if (e.target === bg || e.target.classList.contains('lightbox-close')) bg.remove();
  });
}

// ═══ OVERLAY HELPERS ═══

function openOverlay(id) {
  // Odstraň delete button pokud zbyl
  const old = document.getElementById('delete-tx-btn');
  if (old) old.remove();

  const el = document.getElementById(id);
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('open'));
  document.getElementById('app').style.overflow = 'hidden';
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  setTimeout(() => { el.style.display = 'none'; }, 330);
  document.getElementById('app').style.overflow = '';

  // Zastav kameru pokud to byl scan overlay
  if (id === 'overlay-scan') Camera.stop();
}

function refreshCurrentScreen() {
  if (state.currentScreen === 'dashboard') Dashboard.render();
  if (state.currentScreen === 'transactions') TxList.render();
  if (state.currentScreen === 'stats') Stats.render();
}


// ═══ FOTO ÚLOŽIŠTĚ (Supabase Storage) ═══

const PhotoStore = (() => {
  async function upload(file) {
    try {
      if (!window.SupaSync) return null;
      const sb = await SupaSync.getClient();
      if (!sb) return null;

      // Ensure bucket exists (ignore error if already exists)
      await sb.storage.createBucket('receipts', { public: true }).catch(() => {});

      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await sb.storage.from('receipts').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error) { console.warn('Photo upload error:', error); return null; }

      const { data: urlData } = sb.storage.from('receipts').getPublicUrl(path);
      return urlData?.publicUrl || null;
    } catch (e) {
      console.warn('PhotoStore.upload failed:', e);
      return null;
    }
  }

  return { upload };
})();

// ═══ KAMERA & SKENOVÁNÍ ÚČTENKY ═══

const Camera = (() => {
  let stream = null;

  function open() {
    const apiKey = DB.getSetting('gemini_key', 'AIzaSyBVAkO9jiX2nljYfJUFiiSJovdyHxBrapg');
    if (!apiKey) {
      showToast('Nastav API klíč v Nastavení', 'error');
      return;
    }
    openOverlay('overlay-scan');
    startCamera();
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      document.getElementById('cam-video').srcObject = stream;
    } catch (e) {
      showToast('Kamera není dostupná', 'error');
      closeOverlay('overlay-scan');
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  async function capture() {
    const video = document.getElementById('cam-video');
    const canvas = document.getElementById('cap-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    // Zmenši obrázek pro rychlejší přenos (max 1200px)
    const maxDim = 1200;
    let w = canvas.width, h = canvas.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale); h = Math.round(h * scale);
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(tmp, 0, 0);
    }

    const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    const procEl = document.getElementById('cam-processing');
    procEl.classList.remove('hidden');
    procEl.querySelector('p').textContent = 'Analyzuji účtenku pomocí AI…';

    try {
      const result = await analyzeReceipt(base64);
      stop();
      closeOverlay('overlay-scan');
      procEl.classList.add('hidden');

      AddTx.open({
        type: 'expense',
        amount: result.amount || '',
        category: result.category || '',
        description: result.description || '',
        date: result.date || todayISO(),
      });
      if (result.notes) document.getElementById('tx-note').value = result.notes;
      showToast('Účtenka naskenována ✓', 'success');
    } catch (e) {
      procEl.classList.add('hidden');
      console.error('Scan error:', e);
      // Zobraz konkrétní chybu
      const msg = e.message || '';
      if (msg.includes('API_KEY') || msg.includes('key')) {
        showToast('Chybný API klíč — zkontroluj nastavení', 'error');
      } else if (msg.includes('quota') || msg.includes('limit')) {
        showToast('Překročen limit API — zkus znovu za chvíli', 'error');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        showToast('Chyba sítě — zkontroluj připojení', 'error');
      } else {
        showToast('Nepodařilo se přečíst účtenku: ' + (msg.slice(0, 40) || 'neznámá chyba'), 'error');
      }
    }
  }

  async function analyzeReceipt(base64) {
    const apiKey = DB.getSetting('gemini_key', 'AIzaSyBVAkO9jiX2nljYfJUFiiSJovdyHxBrapg');
    const catList = EXPENSE_CATS.map(c => `${c.id} (${c.name})`).join(', ');
    const prompt = `Přečti tuto účtenku a vrať POUZE JSON (bez markdown, bez komentářů) ve formátu:
{"amount": číslo, "description": "název obchodu nebo co nakoupeno", "category": "id kategorie", "date": "YYYY-MM-DD nebo null", "notes": "krátká poznámka nebo null"}

Dostupné kategorie: ${catList}
Dnešní datum: ${todayISO()}
Pokud datum na účtence není, použij null.
Měna je CZK. Vrať pouze čistý JSON, nic jiného.`;

    // Zkus nejprve gemini-2.0-flash, pak fallback na gemini-1.5-flash
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastError = null;

    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: 'image/jpeg', data: base64 } },
                  { text: prompt }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
            })
          }
        );

        const data = await res.json();
        if (data.error) {
          lastError = new Error(data.error.message || JSON.stringify(data.error));
          continue; // zkus další model
        }
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          lastError = new Error('Prázdná odpověď od AI');
          continue;
        }

        let text = data.candidates[0].content.parts[0].text.trim();
        // Vyčisti markdown bloky pokud jsou
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        // Najdi JSON objekt pokud je obalen textem
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          lastError = new Error('AI nevrátilo JSON');
          continue;
        }
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Všechny modely selhaly');
  }

  function init() {
    document.getElementById('btn-shutter').addEventListener('click', capture);
    document.getElementById('close-scan').addEventListener('click', () => {
      stop();
      closeOverlay('overlay-scan');
    });
  }

  return { init, open, stop };
})();

// ═══ STATISTIKY / GRAFY ═══

const Stats = (() => {
  let viewYear = new Date().getFullYear();
  let activeTab = 'month';

  function render() {
    if (activeTab === 'month') renderMonth();
    else renderYear();
  }

  // ─── MĚSÍČNÍ POHLED ───

  function renderMonth() {
    renderPie();
    renderBar();
    renderPersonStats();
  }

  function renderPie() {
    const { currentMonth: m, currentYear: y } = state;
    const txs = DB.getMonthTransactions(m, y).filter(t => t.type === 'expense');
    const canvas = document.getElementById('pie-chart');
    const ctx = canvas.getContext('2d');
    const size = Math.min(canvas.offsetWidth || 220, 220);
    canvas.width = size; canvas.height = size;

    const totals = {};
    txs.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    const entries = Object.entries(totals).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
    const total = entries.reduce((s,[,v]) => s+v, 0);

    ctx.clearRect(0, 0, size, size);
    if (!entries.length) {
      ctx.fillStyle = '#252a40';
      ctx.beginPath(); ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#656b8a'; ctx.font = '13px DM Sans,sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('Žádné výdaje', size/2, size/2 + 5);
      document.getElementById('pie-legend').innerHTML = ''; return;
    }

    let startAngle = -Math.PI / 2;
    const cx = size/2, cy = size/2, r = size/2 - 6, innerR = r * 0.52;
    entries.forEach(([catId, val]) => {
      const cat = getCat(catId);
      const angle = (val / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + angle);
      ctx.closePath(); ctx.fillStyle = cat.color; ctx.fill();
      startAngle += angle;
    });
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI*2);
    ctx.fillStyle = '#12151f'; ctx.fill();
    ctx.fillStyle = '#e6e3f3'; ctx.font = `bold ${size < 160 ? 13 : 16}px DM Mono,monospace`;
    ctx.textAlign = 'center'; ctx.fillText(fmtCZK(total), cx, cy - 2);
    ctx.font = `${size < 160 ? 9 : 10}px DM Sans,sans-serif`;
    ctx.fillStyle = '#656b8a'; ctx.fillText('celkem výdajů', cx, cy + 14);

    document.getElementById('pie-legend').innerHTML = entries.map(([catId, val]) => {
      const cat = getCat(catId);
      const pct = Math.round((val / total) * 100);
      return `<div class="leg-row">
        <span class="leg-dot" style="background:${cat.color}"></span>
        <span class="leg-name">${cat.icon} ${cat.name}</span>
        <span class="leg-pct">${pct}% · ${fmtCZK(val)}</span>
      </div>`;
    }).join('');
  }

  function renderBar() {
    const canvas = document.getElementById('bar-chart');
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 320, H = 160;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      let m = state.currentMonth - i, y = state.currentYear;
      while (m < 0) { m += 12; y--; }
      months.push({ m, y });
    }
    const data = months.map(({ m, y }) => {
      const txs = DB.getMonthTransactions(m, y);
      return {
        label: MONTH_NAMES[m].slice(0, 3),
        income: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
    drawBarChart(ctx, data, W, H);
  }

  function renderPersonStats() {
    const { currentMonth: m, currentYear: y } = state;
    const txs = DB.getMonthTransactions(m, y);
    const n1 = DB.getSetting('name1', 'Já'), n2 = DB.getSetting('name2', 'Partner');
    const p1 = { inc: 0, exp: 0 }, p2 = { inc: 0, exp: 0 };
    txs.forEach(t => {
      const p = t.person === 'p2' ? p2 : p1;
      if (t.type === 'income') p.inc += t.amount; else p.exp += t.amount;
    });
    document.getElementById('person-stats').innerHTML = `
      <div class="person-row">
        <div class="pr-name">👤 ${n1}</div>
        <div class="pr-amounts"><span class="pr-inc">+${fmtCZK(p1.inc)}</span><span class="pr-exp">-${fmtCZK(p1.exp)}</span></div>
      </div>
      <div class="person-row">
        <div class="pr-name">👤 ${n2}</div>
        <div class="pr-amounts"><span class="pr-inc">+${fmtCZK(p2.inc)}</span><span class="pr-exp">-${fmtCZK(p2.exp)}</span></div>
      </div>`;
  }

  // ─── ROČNÍ POHLED ───

  function renderYear() {
    document.getElementById('year-label').textContent = viewYear;
    renderYearBar();
    renderYearSummary();
    renderTrends();
    renderMonthsList();
  }

  function getYearData(year) {
    return Array.from({ length: 12 }, (_, m) => {
      const txs = DB.getMonthTransactions(m, year);
      return {
        label: MONTH_NAMES[m].slice(0, 3),
        income: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
  }

  function renderYearBar() {
    const canvas = document.getElementById('year-bar-chart');
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 320, H = 200;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    drawBarChart(ctx, getYearData(viewYear), W, H);
  }

  function renderYearSummary() {
    const data = getYearData(viewYear);
    const totInc = data.reduce((s, d) => s + d.income, 0);
    const totExp = data.reduce((s, d) => s + d.expense, 0);
    const net = totInc - totExp;
    const activeMonths = data.filter(d => d.income > 0 || d.expense > 0).length || 1;
    const avgExp = totExp / activeMonths;

    document.getElementById('year-summary').innerHTML = `
      <div class="ys-card income-card">
        <div class="ys-label">Celkové příjmy</div>
        <div class="ys-val">+${fmtCZK(totInc)}</div>
      </div>
      <div class="ys-card expense-card">
        <div class="ys-label">Celkové výdaje</div>
        <div class="ys-val">-${fmtCZK(totExp)}</div>
      </div>
      <div class="ys-card net-card">
        <div class="ys-label">Bilance roku</div>
        <div class="ys-val" style="color:${net >= 0 ? 'var(--green)' : 'var(--rose)'}">${net >= 0 ? '+' : ''}${fmtCZK(net)}</div>
      </div>
      <div class="ys-card avg-card">
        <div class="ys-label">Prům. výdaj/měsíc</div>
        <div class="ys-val">${fmtCZK(avgExp)}</div>
      </div>`;
  }

  function renderTrends() {
    const m = state.currentMonth, y = state.currentYear;
    const thisTxs = DB.getMonthTransactions(m, y).filter(t => t.type === 'expense');
    let prevM = m - 1, prevY = y;
    if (prevM < 0) { prevM = 11; prevY--; }
    const prevTxs = DB.getMonthTransactions(prevM, prevY).filter(t => t.type === 'expense');

    const thisTotal = {}, prevTotal = {};
    thisTxs.forEach(t => { thisTotal[t.category] = (thisTotal[t.category] || 0) + t.amount; });
    prevTxs.forEach(t => { prevTotal[t.category] = (prevTotal[t.category] || 0) + t.amount; });

    const allCats = new Set([...Object.keys(thisTotal), ...Object.keys(prevTotal)]);
    const rows = [...allCats].map(catId => {
      const cat = getCat(catId);
      const cur = thisTotal[catId] || 0;
      const prev = prevTotal[catId] || 0;
      let badge = '', badgeCls = '';
      if (prev === 0 && cur > 0) { badge = 'nové'; badgeCls = 'new'; }
      else if (cur === 0) { badge = '−100%'; badgeCls = 'down'; }
      else {
        const pct = Math.round(((cur - prev) / prev) * 100);
        badge = (pct > 0 ? '+' : '') + pct + '%';
        badgeCls = pct > 5 ? 'up' : pct < -5 ? 'down' : 'same';
      }
      return { cat, cur, prev, badge, badgeCls };
    }).filter(r => r.cur > 0).sort((a, b) => b.cur - a.cur);

    document.getElementById('trends-list').innerHTML = rows.length
      ? rows.map(r => `
        <div class="trend-row">
          <div class="trend-ico">${r.cat.icon}</div>
          <div class="trend-name">${r.cat.name}</div>
          <div class="trend-amt">${fmtCZK(r.cur)}</div>
          <div class="trend-badge ${r.badgeCls}">${r.badge}</div>
        </div>`).join('')
      : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Žádná data pro tento měsíc</div>';
  }

  function renderMonthsList() {
    const data = getYearData(viewYear);
    const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
    const el = document.getElementById('year-months-list');
    el.innerHTML = data.map((d, m) => {
      const incPct = (d.income / maxVal * 100).toFixed(1);
      const expPct = (d.expense / maxVal * 100).toFixed(1);
      const isEmpty = d.income === 0 && d.expense === 0;
      return `
        <div class="ym-row" data-m="${m}">
          <div class="ym-name">${d.label}</div>
          <div class="ym-bars">
            <div class="ym-bar-row">
              <div class="ym-bar-track"><div class="ym-bar-fill inc" style="width:${incPct}%"></div></div>
              <div class="ym-val inc">${isEmpty ? '—' : '+' + fmtCZK(d.income)}</div>
            </div>
            <div class="ym-bar-row">
              <div class="ym-bar-track"><div class="ym-bar-fill exp" style="width:${expPct}%"></div></div>
              <div class="ym-val exp">${isEmpty ? '—' : '-' + fmtCZK(d.expense)}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    // Tap na měsíc → přejdi na dashboard daného měsíce
    el.querySelectorAll('.ym-row').forEach(row => {
      row.addEventListener('click', () => {
        state.currentMonth = +row.dataset.m;
        state.currentYear = viewYear;
        Nav.goTo('dashboard');
      });
    });
  }

  // ─── SDÍLENÝ BAR CHART ───

  function drawBarChart(ctx, data, W, H) {
    const padL = 4, padR = 4, padT = 8, padB = 24;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
    const groupW = chartW / data.length;
    const barW = groupW * 0.3;
    const gap = groupW * 0.05;

    data.forEach((d, i) => {
      const x = padL + i * groupW + groupW / 2;
      const ih = (d.income / maxVal) * chartH;
      ctx.fillStyle = '#2fd6be'; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(x - barW - gap/2, padT + chartH - ih, barW, ih || 1, [3,3,0,0]);
      ctx.fill();

      const eh = (d.expense / maxVal) * chartH;
      ctx.fillStyle = '#ef4455';
      ctx.beginPath();
      ctx.roundRect(x + gap/2, padT + chartH - eh, barW, eh || 1, [3,3,0,0]);
      ctx.fill();

      ctx.globalAlpha = 1; ctx.fillStyle = '#656b8a';
      ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(d.label, x, H - 6);
    });
  }

  // ─── INIT (tabs + year nav) ───

  function init() {
    document.querySelectorAll('.stab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('stats-month-view').classList.toggle('hidden', activeTab !== 'month');
        document.getElementById('stats-year-view').classList.toggle('hidden', activeTab !== 'year');
        render();
      });
    });

    document.getElementById('year-prev').addEventListener('click', () => { viewYear--; renderYear(); });
    document.getElementById('year-next').addEventListener('click', () => {
      if (viewYear < new Date().getFullYear()) { viewYear++; renderYear(); }
    });
  }

  return { render, init };
})();



// ═══ NASTAVENÍ ═══

const Settings = (() => {
  function load() {
    Theme.updateToggleUI();
    document.getElementById('s-name').value = DB.getSetting('name1', '');
    document.getElementById('s-name2').value = DB.getSetting('name2', '');
    document.getElementById('s-sb-url').value = DB.getSetting('sb_url', 'https://vmcofryclsvsbdttzkhs.supabase.co');
    document.getElementById('s-sb-key').value = DB.getSetting('sb_key', 'sb_publishable_vo7EGx2VNfZ11_L2_FNYlw_bHfhAZmU');
    renderHouseholdStatus();
    renderBudgetSettings();
    renderRecurringSettings();
  }

  function renderHouseholdStatus() {
    const hhId = DB.getSetting('household_id', null);
    const hhCode = DB.getSetting('household_code', null);
    const el = document.getElementById('household-status');
    if (hhId && hhCode) {
      el.innerHTML = `Připojeno k domácnosti:<br>Kód: <span class="hs-code">${hhCode}</span><br><small style="color:var(--text3)">Sdílejte tento kód s partnerem/kou</small>`;
    } else {
      el.innerHTML = '<span style="color:var(--text3)">Zatím nejste v domácnosti</span>';
    }
  }

  function renderBudgetSettings() {
    const budgets = DB.getBudgets();
    const existing = document.getElementById('budget-settings');
    if (existing) existing.remove();

    const sg = document.createElement('div');
    sg.id = 'budget-settings';
    sg.className = 'setting-group';
    sg.innerHTML = `
      <div class="sg-title">Měsíční limity (budgety)</div>
      <div class="sg-help">Nastavte max. výdaje pro kategorii. Při překročení 80% dostanete upozornění.</div>
      ${EXPENSE_CATS.map(c => `
        <div class="sg-row">
          <label>${c.icon} ${c.name}</label>
          <input type="number" class="s-input budget-input" data-cat="${c.id}"
                 placeholder="bez limitu" value="${budgets[c.id] || ''}"
                 inputmode="numeric" style="max-width:120px">
          <span style="color:var(--text3);font-size:12px">Kč</span>
        </div>
      `).join('')}
      <button class="sg-btn" id="save-budgets">Uložit limity</button>
    `;

    // Vlož před tlačítko změnit PIN
    const pinGroup = document.querySelector('#screen-settings .setting-group:nth-child(4)');
    if (pinGroup) pinGroup.before(sg);
    else document.querySelector('#screen-settings .screen-scroll').appendChild(sg);

    document.getElementById('save-budgets').addEventListener('click', saveBudgets);
  }

  function saveBudgets() {
    const b = {};
    document.querySelectorAll('.budget-input').forEach(inp => {
      const val = parseFloat(inp.value);
      if (val > 0) b[inp.dataset.cat] = val;
    });
    DB.setBudgets(b);
    showToast('Limity uloženy ✓', 'success');
  }

  function renderRecurringSettings() {
    const recurring = DB.getRecurring();
    const existing = document.getElementById('recurring-settings');
    if (existing) existing.remove();

    const sg = document.createElement('div');
    sg.id = 'recurring-settings';
    sg.className = 'setting-group';
    sg.innerHTML = `
      <div class="sg-title">Opakující se výdaje</div>
      <div class="sg-help">Automaticky se přidají každý měsíc.</div>
      <div id="recurring-list">
        ${recurring.length === 0
          ? '<div style="color:var(--text3);font-size:13px">Žádné opakující se výdaje</div>'
          : recurring.map(r => `
            <div class="recurring-item" data-rid="${r.id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;font-size:13px">${getCat(r.category).icon} ${r.description || getCat(r.category).name}</span>
              <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--rose)">-${fmtCZK(r.amount)}</span>
              <button style="background:none;border:none;color:var(--rose);font-size:16px;padding:2px 6px" class="del-recurring">×</button>
            </div>`).join('')}
      </div>
      <button class="sg-btn" id="add-recurring-btn">+ Přidat opakující se výdaj</button>
    `;

    const ver = document.querySelector('.app-ver');
    if (ver) ver.before(sg);
    else document.querySelector('#screen-settings .screen-scroll').appendChild(sg);

    sg.querySelectorAll('.del-recurring').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = btn.closest('.recurring-item').dataset.rid;
        const r = DB.getRecurring().filter(x => x.id !== rid);
        DB.saveRecurring(r);
        renderRecurringSettings();
        showToast('Odstraněno', '');
      });
    });

    document.getElementById('add-recurring-btn').addEventListener('click', () => {
      showAddRecurringDialog();
    });
  }

  function showAddRecurringDialog() {
    // Inline formulář
    const form = document.createElement('div');
    form.style.cssText = 'background:var(--s2);border:1px solid var(--border2);border-radius:var(--r-sm);padding:12px;display:flex;flex-direction:column;gap:8px;margin-top:4px';
    form.innerHTML = `
      <input type="number" class="s-input" id="r-amount" placeholder="Částka (Kč)" inputmode="decimal">
      <input type="text" class="s-input" id="r-desc" placeholder="Název (např. Nájem, Netflix...)">
      <select class="s-input" id="r-cat" style="background:var(--s2)">
        ${EXPENSE_CATS.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px">
        <button class="sg-btn-sm" id="r-save" style="flex:1">Uložit</button>
        <button class="sg-btn" id="r-cancel" style="flex:1;padding:9px">Zrušit</button>
      </div>
    `;

    const btn = document.getElementById('add-recurring-btn');
    btn.before(form);
    btn.style.display = 'none';

    document.getElementById('r-cancel').addEventListener('click', () => {
      form.remove();
      btn.style.display = '';
    });

    document.getElementById('r-save').addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('r-amount').value);
      const desc = document.getElementById('r-desc').value.trim();
      const cat = document.getElementById('r-cat').value;
      if (!amount || amount <= 0) { showToast('Zadejte částku', 'error'); return; }

      const rec = DB.getRecurring();
      rec.push({ id: genId(), amount, description: desc, category: cat });
      DB.saveRecurring(rec);
      form.remove();
      btn.style.display = '';
      renderRecurringSettings();
      showToast('Přidáno ✓', 'success');
    });
  }

  function init() {
    // Uložení jmen
    document.getElementById('s-name').addEventListener('change', e => {
      DB.setSetting('name1', e.target.value);
      AddTx.renderPersonSw();
    });
    document.getElementById('s-name2').addEventListener('change', e => {
      DB.setSetting('name2', e.target.value);
      AddTx.renderPersonSw();
    });

    // Supabase
    document.getElementById('btn-save-sb').addEventListener('click', async () => {
      const url = document.getElementById('s-sb-url').value.trim();
      const key = document.getElementById('s-sb-key').value.trim();
      if (!url || !key) { showToast('Vyplňte URL i Key', 'error'); return; }
      DB.setSetting('sb_url', url);
      DB.setSetting('sb_key', key);
      showToast('Nastavení uloženo', 'success');
      if (window.SupaSync) {
        const ok = await SupaSync.init();
        showToast(ok ? 'Supabase připojeno ✓' : 'Chyba připojení', ok ? 'success' : 'error');
      }
    });

    // SQL hint
    document.getElementById('sb-sql-btn').addEventListener('click', () => {
      document.getElementById('sql-block').classList.toggle('hidden');
    });

    // Domácnost
    document.getElementById('btn-create-hh').addEventListener('click', async () => {
      if (window.SupaSync) {
        const code = await SupaSync.createHousehold();
        if (code) { renderHouseholdStatus(); showToast('Domácnost vytvořena: ' + code, 'success'); }
      } else {
        showToast('Nejprve nastavte Supabase', 'error');
      }
    });

    document.getElementById('btn-join-hh').addEventListener('click', async () => {
      const code = document.getElementById('invite-input').value.trim().toUpperCase();
      if (!code) { showToast('Zadejte kód', 'error'); return; }
      if (window.SupaSync) {
        const ok = await SupaSync.joinHousehold(code);
        if (ok) { renderHouseholdStatus(); showToast('Připojeno k domácnosti ✓', 'success'); }
        else showToast('Kód nenalezen', 'error');
      } else {
        showToast('Nejprve nastavte Supabase', 'error');
      }
    });

    // PIN
    document.getElementById('btn-change-pin').addEventListener('click', () => PinManager.startChangePin());

    // Export
    document.getElementById('btn-export').addEventListener('click', exportCSV);

    // Smazat vše
    document.getElementById('btn-clear-data').addEventListener('click', () => {
      if (confirm('Opravdu smazat VŠECHNA data? Tato akce je nevratná!')) {
        if (confirm('Jste si jisti? Vše bude ztraceno.')) {
          const pin = localStorage.getItem('kasa_pin');
          localStorage.clear();
          if (pin) localStorage.setItem('kasa_pin', pin);
          showToast('Data smazána', 'error');
          Dashboard.render();
        }
      }
    });

    // Notifikace
    updateNotifStatus();
    document.getElementById('btn-enable-notifs').addEventListener('click', async () => {
      const ok = await Notifs.requestPermission();
      showToast(ok ? '🔔 Notifikace povoleny ✓' : 'Notifikace zamítnuty v prohlížeči', ok ? 'success' : 'error');
      updateNotifStatus();
    });

    // API klíč (Anthropic)
    const apiGroup = buildApiKeyGroup();
    const sbGroup = document.querySelector('#screen-settings .setting-group:nth-child(3)');
    if (sbGroup) sbGroup.after(apiGroup);
  }

  function updateNotifStatus() {
    const el = document.getElementById('notif-status');
    if (!el) return;
    if (!('Notification' in window)) {
      el.innerHTML = '<span style="color:var(--text3)">Notifikace nejsou v tomto prohlížeči podporovány</span>';
      return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') el.innerHTML = '<span style="color:var(--green)">✓ Notifikace jsou povoleny</span>';
    else if (perm === 'denied') el.innerHTML = '<span style="color:var(--rose)">✗ Notifikace jsou zakázány — povol je v nastavení prohlížeče</span>';
    else el.innerHTML = '<span style="color:var(--text3)">Notifikace nejsou povoleny</span>';
  }

  function buildApiKeyGroup() {
    const sg = document.createElement('div');
    sg.className = 'setting-group';
    sg.innerHTML = `
      <div class="sg-title">Skenování účtenek (AI)</div>
      <div class="sg-help">Google Gemini API klíč — zdarma. <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a> → Get API key</div>
      <div class="sg-row">
        <label>Gemini Key</label>
        <input type="password" id="s-api-key" class="s-input" placeholder="AIza...">
      </div>
      <button class="sg-btn" id="save-api-key">Uložit klíč</button>
    `;
    sg.querySelector('#save-api-key').addEventListener('click', () => {
      const key = sg.querySelector('#s-api-key').value.trim();
      if (!key) { showToast('Zadejte API klíč', 'error'); return; }
      DB.setSetting('anthropic_key', key);
      showToast('API klíč uložen ✓', 'success');
    });
    setTimeout(() => {
      const el = sg.querySelector('#s-api-key');
      if (el) el.value = DB.getSetting('gemini_key', 'AIzaSyBVAkO9jiX2nljYfJUFiiSJovdyHxBrapg');
    }, 100);
    return sg;
  }

  return { init, load };
})();

// ═══ EXPORT CSV ═══

function exportCSV() {
  const txs = DB.getTransactions();
  const n1 = DB.getSetting('name1', 'Já');
  const n2 = DB.getSetting('name2', 'Partner');
  const header = 'Datum,Typ,Kategorie,Popis,Částka,Osoba,Poznámka\n';
  const rows = txs.map(t => {
    const cat = getCat(t.category).name;
    const person = t.person === 'p2' ? n2 : n1;
    return [t.date, t.type === 'expense' ? 'Výdaj' : 'Příjem', cat,
      `"${(t.description||'').replace(/"/g,'""')}"`,
      t.amount, person,
      `"${(t.notes||'').replace(/"/g,'""')}"`].join(',');
  }).join('\n');

  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kasa-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export stažen ✓', 'success');
}


// ═══ NOTIFIKACE ═══

const Notifs = (() => {
  let swReg = null;

  async function requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  async function send(title, body, type = '') {
    if (!('Notification' in window)) return;
    // Požádej o povolení pokud ještě nemáme
    if (Notification.permission === 'default') {
      await requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const icon = './icon.svg';
    const badge = './icon.svg';
    const tag = 'kasa-budget-' + type;

    try {
      // Přes Service Worker (funguje i na pozadí na Androidu)
      if (swReg) {
        await swReg.showNotification(title, { body, icon, badge, tag, vibrate: [200, 100, 200] });
      } else {
        new Notification(title, { body, icon, tag });
      }
    } catch (e) {
      // Fallback
      try { new Notification(title, { body, icon, tag }); } catch {}
    }
  }

  async function checkAllBudgets() {
    const budgets = DB.getBudgets();
    if (!Object.keys(budgets).length) return;
    const { currentMonth: m, currentYear: y } = state;

    const exceeded = [];
    const warning = [];

    EXPENSE_CATS.forEach(cat => {
      const budget = budgets[cat.id];
      if (!budget) return;
      const txs = DB.getMonthTransactions(m, y).filter(t => t.type === 'expense' && t.category === cat.id);
      const total = txs.reduce((s, t) => s + t.amount, 0);
      const pct = (total / budget) * 100;
      if (pct >= 100) exceeded.push({ cat, total, budget, pct });
      else if (pct >= 80) warning.push({ cat, total, budget, pct });
    });

    if (exceeded.length > 0) {
      const names = exceeded.map(e => e.cat.icon + ' ' + e.cat.name).join(', ');
      await send('⚠️ Překročeny limity', `Kategorie: ${names}`, 'over-all');
    } else if (warning.length > 0) {
      const names = warning.map(w => `${w.cat.icon} ${w.cat.name} ${Math.round(w.pct)}%`).join(', ');
      await send('⚡ Blíží se limity', names, 'warn-all');
    }
  }

  function setSwReg(reg) { swReg = reg; }

  return { requestPermission, send, checkAllBudgets, setSwReg };
})();

// ═══ SUPABASE SYNC ═══

window.SupaSync = (() => {
  let sb = null;

  async function init() {
    const url = DB.getSetting('sb_url', 'https://vmcofryclsvsbdttzkhs.supabase.co');
    const key = DB.getSetting('sb_key', 'sb_publishable_vo7EGx2VNfZ11_L2_FNYlw_bHfhAZmU');
    if (!url || !key) return false;

    // Dynamicky načti Supabase JS
    if (!window.supabase) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      } catch { return false; }
    }

    try {
      sb = window.supabase.createClient(url, key);
      return true;
    } catch { return false; }
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function createHousehold() {
    if (!sb) { await init(); }
    if (!sb) return null;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await sb.from('households').insert([{ name: 'Moje domácnost', invite_code: code }]).select().single();
    if (error) { console.error(error); return null; }
    DB.setSetting('household_id', data.id);
    DB.setSetting('household_code', data.invite_code);
    return data.invite_code;
  }

  async function joinHousehold(code) {
    if (!sb) { await init(); }
    if (!sb) return false;
    const { data, error } = await sb.from('households').select().eq('invite_code', code).single();
    if (error || !data) return false;
    DB.setSetting('household_id', data.id);
    DB.setSetting('household_code', data.invite_code);
    await pull();
    return true;
  }

  async function pushTransaction(tx) {
    if (!sb) { await init(); }
    if (!sb) return;
    const hhId = DB.getSetting('household_id', null);
    if (!hhId) return;
    await sb.from('transactions').upsert([{ ...tx, household_id: hhId }]);
  }

  async function deleteTransaction(id) {
    if (!sb) return;
    await sb.from('transactions').delete().eq('id', id);
  }

  async function pull() {
    if (!sb) { await init(); }
    if (!sb) return;
    const hhId = DB.getSetting('household_id', null);
    if (!hhId) return;
    const { data, error } = await sb.from('transactions').select().eq('household_id', hhId).order('date', { ascending: false });
    if (error || !data) { console.warn('Supabase pull error:', error); return; }
    // Remote data je zdrojem pravdy — přepíše lokální
    DB.saveTransactions(data);
  }

  async function pushAllLocal() {
    if (!sb) { await init(); }
    if (!sb) return;
    const hhId = DB.getSetting('household_id', null);
    if (!hhId) return;
    const txs = DB.getTransactions();
    if (!txs.length) return;
    const withHh = txs.map(t => ({ ...t, household_id: hhId }));
    await sb.from('transactions').upsert(withHh);
  }

  function subscribeRealtime() {
    if (!sb) return;
    const hhId = DB.getSetting('household_id', null);
    if (!hhId) return;
    sb.channel('transactions-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `household_id=eq.${hhId}`
      }, () => {
        pull().then(() => refreshCurrentScreen());
      })
      .subscribe();
  }

  function getClient() { return sb; }
  return { init, getClient, createHousehold, joinHousehold, pushTransaction, pushAllLocal, deleteTransaction, pull, subscribeRealtime };
})();

// ═══ OPAKUJÍCÍ SE VÝDAJE — automatické přidání ═══

function processRecurring() {
  const recurring = DB.getRecurring();
  if (!recurring.length) return;

  const lastRun = DB.getSetting('recurring_last_run', null);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if (lastRun === thisMonth) return;

  // Je začátek měsíce (do 5. dne) nebo první spuštění
  recurring.forEach(r => {
    const txDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    // Zkontroluj zda už nebyla přidána tento měsíc
    const exists = DB.getTransactions().some(t =>
      t.recurringId === r.id &&
      t.date.startsWith(thisMonth)
    );
    if (!exists) {
      DB.addTransaction({
        id: genId(),
        type: 'expense',
        amount: r.amount,
        category: r.category,
        description: r.description || getCat(r.category).name,
        date: txDate,
        person: 'p1',
        notes: 'Automaticky — opakující se výdaj',
        recurringId: r.id,
        createdAt: Date.now(),
      });
    }
  });

  DB.setSetting('recurring_last_run', thisMonth);
  if (recurring.length > 0) showToast(`${recurring.length} opakující se výdaj(e) přidány ✓`, 'success');
}

// ═══ PWA — SERVICE WORKER ═══

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        Notifs.setSwReg(reg);
      })
      .catch(() => {});
  }
}

// ═══ HLAVNÍ INICIALIZACE ═══

const App = {
  init() {
    Theme.init();
    Nav.init();
    Dashboard.initMonthNav();
    Templates.init();
    AddTx.init();
    TxList.initFilters();
    Camera.init();
    Settings.init();
    Stats.init();

    // Overlay stylování
    document.querySelectorAll('.overlay').forEach(o => o.style.display = 'none');

    // Zpracuj opakující se výdaje
    processRecurring();

    // Prvotní render
    Dashboard.render();

    // Supabase init (potichu)
    SupaSync.init().then(ok => {
      if (ok) {
        SupaSync.pull().then(() => {
          Dashboard.render();
          SupaSync.subscribeRealtime();
        });
      }
    });

    // Notifikace — požádej o povolení a zkontroluj budgety
    setTimeout(async () => {
      const granted = await Notifs.requestPermission();
      if (granted) {
        // Zkontroluj budgety jednou denně při otevření
        const lastCheck = DB.getSetting('notif_last_check', null);
        const today = todayISO();
        if (lastCheck !== today) {
          DB.setSetting('notif_last_check', today);
          setTimeout(() => Notifs.checkAllBudgets(), 2000);
        }
      }
    }, 1500);
  }
};

// ═══ SPUŠTĚNÍ ═══

document.addEventListener('DOMContentLoaded', () => {
  // Aplikuj téma co nejdříve (zabraňuje bliknutí)
  const savedTheme = localStorage.getItem('kasa_theme');
  if (savedTheme && savedTheme.replace(/"/g,'') === 'light') {
    document.body.classList.add('light');
  }
  // Fix: 6 teček v PIN
  fixPinDots();
  PinManager.init();
  registerSW();
});

function fixPinDots() {
  // Přidej d5 a d6 do HTML dynamicky
  const dotsEl = document.querySelector('.pin-dots');
  if (dotsEl && dotsEl.children.length === 4) {
    const d5 = document.createElement('span');
    d5.className = 'dot';
    d5.id = 'd5';
    const d6 = document.createElement('span');
    d6.className = 'dot';
    d6.id = 'd6';
    dotsEl.appendChild(d5);
    dotsEl.appendChild(d6);
  }
}
