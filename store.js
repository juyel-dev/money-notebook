/* ============================================================
   Money Notebook — Storage Adapter
   NOW: localStorage (offline-first, zero setup, phone-friendly)
   FUTURE: Supabase (Postgres + Auth + Realtime) — drop-in scope
   ------------------------------------------------------------
   To add Supabase later, you only need to:
   1. Fill SUPABASE_URL + SUPABASE_ANON_KEY in supabase-client.js
   2. Set DB.backend = 'supabase' (or 'dual' for offline queue)
   3. SQL schema is documented at bottom of this file.
   No UI code (app.js) needs to change — it only calls DB.* methods.
   ============================================================ */
const DB = (() => {
  const KEY = 'money_notebook_v1';
  let backend = 'local'; // 'local' | 'supabase' | 'dual'

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { notebooks: [], transactions: [], queue: [] };
      const d = JSON.parse(raw);
      return { notebooks: d.notebooks || [], transactions: d.transactions || [], queue: d.queue || [] };
    } catch { return { notebooks: [], transactions: [], queue: [] }; }
  }
  function persist(d) {
    localStorage.setItem(KEY, JSON.stringify(d));
    // FUTURE (dual mode): push {op, payload, at} into d.queue,
    // then SupabaseSync.pushQueue() uploads when online.
  }

  let cache = load();
  const save = () => persist(cache);

  // ---- math helpers (single source of truth) ----
  const sums = (bookId) => {
    const txs = cache.transactions.filter(t => t.bookId === bookId);
    let tin = 0, tout = 0;
    for (const t of txs) { const a = Number(t.amount) || 0; t.type === 'in' ? tin += a : tout += a; }
    const book = cache.notebooks.find(b => b.id === bookId);
    const start = book ? Number(book.startAmount) || 0 : 0;
    return { in: tin, out: tout, balance: start + tin - tout, count: txs.length };
  };

  return {
    get backend() { return backend; },
    setBackend(name) { backend = name; },

    // --- notebooks ---
    async listBooks() {
      return [...cache.notebooks].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async saveBook({ id, name, startAmount }) {
      const now = Date.now();
      if (id) {
        const b = cache.notebooks.find(x => x.id === id);
        if (b) { b.name = name; b.startAmount = Number(startAmount) || 0; b.updatedAt = now; }
      } else {
        cache.notebooks.push({ id: uid(), name, startAmount: Number(startAmount) || 0, createdAt: now, updatedAt: now });
      }
      save(); return true;
    },
    async deleteBook(id) {
      cache.notebooks = cache.notebooks.filter(b => b.id !== id);
      cache.transactions = cache.transactions.filter(t => t.bookId !== id);
      save();
    },

    // --- transactions ---
    async listTx(bookId) {
      return cache.transactions
        .filter(t => t.bookId === bookId)
        .sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt - a.createdAt);
    },
    async allTx() { return cache.transactions; },
    async saveTx({ id, bookId, type, amount, person, note, date }) {
      const now = Date.now();
      const row = {
        id: id || uid(), bookId, type: type === 'in' ? 'in' : 'out',
        amount: Number(amount) || 0, person: (person || 'Unknown').trim() || 'Unknown',
        note: (note || '').trim(), date: date || new Date().toISOString(),
        createdAt: now
      };
      if (id) {
        const i = cache.transactions.findIndex(t => t.id === id);
        if (i > -1) cache.transactions[i] = { ...cache.transactions[i], ...row, id };
      } else cache.transactions.push(row);
      const b = cache.notebooks.find(x => x.id === bookId);
      if (b) b.updatedAt = now;
      save(); return true;
    },
    async deleteTx(id) {
      cache.transactions = cache.transactions.filter(t => t.id !== id);
      save();
    },

    // --- aggregates ---
    sums,
    async grand() {
      let bal = 0, tin = 0, tout = 0;
      for (const b of cache.notebooks) {
        const s = sums(b.id);
        bal += s.balance; tin += s.in; tout += s.out;
      }
      return { balance: bal, in: tin, out: tout };
    },
    personSummary(bookId) {
      const map = {};
      for (const t of cache.transactions.filter(t => t.bookId === bookId)) {
        const k = t.person.trim().toLowerCase();
        if (!map[k]) map[k] = { name: t.person.trim(), in: 0, out: 0, count: 0 };
        t.type === 'in' ? map[k].in += Number(t.amount) : map[k].out += Number(t.amount);
        map[k].count++;
      }
      return Object.values(map).map(p => ({ ...p, net: p.in - p.out }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    },
    personNames(bookId) {
      return [...new Set(cache.transactions.filter(t => t.bookId === bookId).map(t => t.person.trim()))].slice(0, 50);
    }
  };
})();

/* ============ FUTURE SUPABASE SCHEMA (copy-paste when ready) ============
create table books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  start_amount numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table entries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  type text check (type in ('in','out')),
  amount numeric not null check (amount > 0),
  person text default 'Unknown',
  note text default '',
  date timestamptz default now(),
  created_at timestamptz default now()
);
alter table books enable row level security;
alter table entries enable row level security;
-- policies: user_id = auth.uid(), entries via book ownership join.
========================================================================= */
