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

    renderCatsGrid(txs.filter(t => t.type === 'expense'));
    renderRecent(txs);
  }

  function renderCatsGrid(expTxs) {
    const budgets = DB.getBudgets();
    const totals = {};
    expTxs.forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });

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
      return `
        <div class="cat-tile" style="--cat-c:${c.color}">
          <div class="ct-icon">${c.icon}</div>
          <div class="ct-name">${c.name}</div>
          <div class="ct-amt">${fmtCZK(c.total)}</div>
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

  function open(preset = {}) {
    isEdit = false;
    editId = null;
    currentType = preset.type || 'expense';
    selectedCat = preset.category || null;
    selectedPerson = 'p1';

    document.getElementById('tx-amount').value = preset.amount || '';
    document.getElementById('tx-desc').value = preset.description || '';
    document.getElementById('tx-date').value = preset.date || todayISO();
    document.getElementById('tx-note').value = preset.notes || '';

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

    updateTypeSwitch();
    renderCatGrid();
    renderPersonSw();
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
    if (pct >= 100) showToast(`⚠️ ${cat.name}: překročen limit!`, 'error');
    else if (pct >= 80) showToast(`⚡ ${cat.name}: ${Math.round(pct)}% limitu`, '');
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
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    document.getElementById('cam-processing').classList.remove('hidden');

    try {
      const result = await analyzeReceipt(base64);
      stop();
      closeOverlay('overlay-scan');
      document.getElementById('cam-processing').classList.add('hidden');

      // Předvyplň formulář
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
      document.getElementById('cam-processing').classList.add('hidden');
      showToast('Nepodařilo se přečíst účtenku', 'error');
      console.error(e);
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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 }
        })
      }
    );

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.candidates[0].content.parts[0].text.trim().replace(/```json|```/g, '');
    return JSON.parse(text);
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
  function render() {
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
    canvas.width = size;
    canvas.height = size;

    // Spočítej součty
    const totals = {};
    txs.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    const entries = Object.entries(totals).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
    const total = entries.reduce((s,[,v]) => s+v, 0);

    ctx.clearRect(0, 0, size, size);

    if (!entries.length) {
      ctx.fillStyle = '#252a40';
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = '#656b8a';
      ctx.font = '13px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Žádné výdaje', size/2, size/2 + 5);
      document.getElementById('pie-legend').innerHTML = '';
      return;
    }

    // Kresli výseče
    let startAngle = -Math.PI / 2;
    const cx = size / 2, cy = size / 2, r = size / 2 - 6;
    const innerR = r * 0.52;

    entries.forEach(([catId, val]) => {
      const cat = getCat(catId);
      const angle = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + angle);
      ctx.closePath();
      ctx.fillStyle = cat.color;
      ctx.fill();
      startAngle += angle;
    });

    // Vnitřní kruh (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI*2);
    ctx.fillStyle = '#12151f';
    ctx.fill();

    // Střed: celkový výdaj
    ctx.fillStyle = '#e6e3f3';
    ctx.font = `bold ${size < 160 ? 13 : 16}px DM Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(fmtCZK(total), cx, cy - 2);
    ctx.font = `${size < 160 ? 9 : 10}px DM Sans, sans-serif`;
    ctx.fillStyle = '#656b8a';
    ctx.fillText('celkem výdajů', cx, cy + 14);

    // Legenda
    const legend = document.getElementById('pie-legend');
    legend.innerHTML = entries.map(([catId, val]) => {
      const cat = getCat(catId);
      const pct = Math.round((val / total) * 100);
      return `
        <div class="leg-row">
          <span class="leg-dot" style="background:${cat.color}"></span>
          <span class="leg-name">${cat.icon} ${cat.name}</span>
          <span class="leg-pct">${pct}% · ${fmtCZK(val)}</span>
        </div>`;
    }).join('');
  }

  function renderBar() {
    const canvas = document.getElementById('bar-chart');
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 320;
    const H = 160;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    // Posledních 6 měsíců
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let m = state.currentMonth - i;
      let y = state.currentYear;
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

    const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
    const padL = 4, padR = 4, padT = 8, padB = 24;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const groupW = chartW / data.length;
    const barW = groupW * 0.3;
    const gap = groupW * 0.05;

    data.forEach((d, i) => {
      const x = padL + i * groupW + groupW / 2;

      // Příjem
      const ih = (d.income / maxVal) * chartH;
      ctx.fillStyle = '#2fd6be';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const ix = x - barW - gap / 2;
      ctx.roundRect(ix, padT + chartH - ih, barW, ih, [3, 3, 0, 0]);
      ctx.fill();

      // Výdaj
      const eh = (d.expense / maxVal) * chartH;
      ctx.fillStyle = '#ef4455';
      const ex = x + gap / 2;
      ctx.beginPath();
      ctx.roundRect(ex, padT + chartH - eh, barW, eh, [3, 3, 0, 0]);
      ctx.fill();

      // Label
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#656b8a';
      ctx.font = '9px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x, H - 6);
    });
  }

  function renderPersonStats() {
    const { currentMonth: m, currentYear: y } = state;
    const txs = DB.getMonthTransactions(m, y);
    const n1 = DB.getSetting('name1', 'Já');
    const n2 = DB.getSetting('name2', 'Partner');

    const p1 = { inc: 0, exp: 0 };
    const p2 = { inc: 0, exp: 0 };
    txs.forEach(t => {
      const p = t.person === 'p2' ? p2 : p1;
      if (t.type === 'income') p.inc += t.amount;
      else p.exp += t.amount;
    });

    document.getElementById('person-stats').innerHTML = `
      <div class="person-row">
        <div class="pr-name">👤 ${n1}</div>
        <div class="pr-amounts">
          <span class="pr-inc">+${fmtCZK(p1.inc)}</span>
          <span class="pr-exp">-${fmtCZK(p1.exp)}</span>
        </div>
      </div>
      <div class="person-row">
        <div class="pr-name">👤 ${n2}</div>
        <div class="pr-amounts">
          <span class="pr-inc">+${fmtCZK(p2.inc)}</span>
          <span class="pr-exp">-${fmtCZK(p2.exp)}</span>
        </div>
      </div>`;
  }

  return { render };
})();

// ═══ NASTAVENÍ ═══

const Settings = (() => {
  function load() {
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

    // API klíč (Anthropic)
    const apiGroup = buildApiKeyGroup();
    const sbGroup = document.querySelector('#screen-settings .setting-group:nth-child(3)');
    if (sbGroup) sbGroup.after(apiGroup);
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

  return { init, createHousehold, joinHousehold, pushTransaction, pushAllLocal, deleteTransaction, pull, subscribeRealtime };
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
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ═══ HLAVNÍ INICIALIZACE ═══

const App = {
  init() {
    Nav.init();
    Dashboard.initMonthNav();
    AddTx.init();
    TxList.initFilters();
    Camera.init();
    Settings.init();

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
  }
};

// ═══ SPUŠTĚNÍ ═══

document.addEventListener('DOMContentLoaded', () => {
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
