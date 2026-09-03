/* Money Notebook — app logic (phone-first, offline) */
const $ = (id) => document.getElementById(id);
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AV = ['linear-gradient(135deg,#a5b4fc,#22d3ee)', 'linear-gradient(135deg,#fcd34d,#fb7185)', 'linear-gradient(135deg,#6ee7b7,#3b82f6)', 'linear-gradient(135deg,#f0abfc,#818cf8)', 'linear-gradient(135deg,#fdba74,#f43f5e)'];
const avStyle = (name) => AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const fdate = (iso) => { try { const d = new Date(iso); return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const toLocalInput = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

let state = { view: 'home', bookId: null, filter: 'all', search: '', txType: 'out', editBookId: null, editTxId: null };

const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._x); t._x = setTimeout(() => t.classList.remove('show'), 1800); };
const openSheet = (id) => $(id).classList.remove('hidden');
const closeSheets = () => document.querySelectorAll('.sheet-wrap').forEach(s => s.classList.add('hidden'));
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheets(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

// ---------- navigation ----------
function go(view, bookId = null) {
  state.view = view; state.bookId = bookId;
  $('view-home').classList.toggle('hidden', view !== 'home');
  $('view-book').classList.toggle('hidden', view !== 'book');
  $('navBack').classList.toggle('hidden', view === 'home');
  $('tabHome').classList.toggle('active', view === 'home');
  $('tabPersons').classList.toggle('active', view === 'book' && !$('personSection').classList.contains('hidden'));
  if (view === 'home') { $('appTitle').textContent = 'Money Notebook'; $('appSubtitle').textContent = 'offline • fast • simple'; renderHome(); }
  else renderBook();
  window.scrollTo({ top: 0 });
}
$('navBack').onclick = () => go('home');
$('tabHome').onclick = () => go('home');
$('tabAdd').onclick = () => state.view === 'home' ? openBookModal() : openTxModal();
$('tabPersons').onclick = () => { if (state.view !== 'book') return toast('Open a book first'); $('personSection').classList.toggle('hidden'); $('tabPersons').classList.toggle('active', !$('personSection').classList.contains('hidden')); };
$('personToggle').onclick = () => $('personSection').classList.toggle('hidden');
$('fab').onclick = () => state.view === 'home' ? openBookModal() : openTxModal();

// ---------- home ----------
async function renderHome() {
  const books = await DB.listBooks();
  const g = await DB.grand();
  $('grandBalance').textContent = fmt(g.balance);
  $('grandIn').textContent = fmt(g.in);
  $('grandOut').textContent = fmt(g.out);
  $('bookCount').textContent = books.length;
  $('emptyHome').classList.toggle('hidden', books.length > 0);
  $('notebookList').innerHTML = books.map(b => {
    const s = DB.sums(b.id);
    return `<div class="book glass" onclick="go('book','${b.id}')">
      <div class="avatar" style="background:${avStyle(b.name)}">${esc(b.name[0]?.toUpperCase() || '₹')}</div>
      <div class="book-info"><h4>${esc(b.name)}</h4><p>▲ ${fmt(s.in)} &nbsp;•&nbsp; ▼ ${fmt(s.out)} &nbsp;•&nbsp; ${s.count} entries</p></div>
      <div class="book-bal"><strong class="${s.balance < 0 ? 'neg' : 'pos'}">${fmt(s.balance)}</strong><span>balance</span></div>
    </div>`;
  }).join('');
}

// ---------- book detail ----------
async function renderBook() {
  const books = await DB.listBooks();
  const b = books.find(x => x.id === state.bookId);
  if (!b) return go('home');
  $('appTitle').textContent = b.name;
  const s = DB.sums(b.id);
  $('appSubtitle').textContent = `${s.count} entries`;
  $('bookBalance').textContent = fmt(s.balance);
  $('bookBalance').style.color = s.balance < 0 ? 'var(--out)' : '#fff';
  $('bookStart').textContent = fmt(b.startAmount);
  $('bookIn').textContent = fmt(s.in);
  $('bookOut').textContent = fmt(s.out);

  // persons
  const plist = DB.personSummary(b.id);
  $('personDatalist').innerHTML = DB.personNames(b.id).map(n => `<option value="${esc(n)}">`).join('');
  $('personList').innerHTML = plist.length ? plist.map(p => `
    <div class="prow" onclick="filterPerson('${esc(p.name.replace(/'/g, "\\'"))}')">
      <div class="dot" style="background:${avStyle(p.name)}">${esc(p.name[0].toUpperCase())}</div>
      <div><b>${esc(p.name)}</b><small>Gave ${fmt(p.out)} • Got ${fmt(p.in)} • ${p.count} entries</small></div>
      <strong class="${p.net < 0 ? 'neg' : 'pos'}">${p.net < 0 ? '−' + fmt(Math.abs(p.net)) : '+' + fmt(p.net)}</strong>
    </div>`).join('') : '<p style="color:var(--mut);font-size:13px">No persons yet.</p>';

  // transactions
  let txs = await DB.listTx(b.id);
  if (state.filter !== 'all') txs = txs.filter(t => t.type === state.filter);
  if (state.search) {
    const q = state.search.toLowerCase();
    txs = txs.filter(t => (t.person + ' ' + t.note + ' ' + t.amount).toLowerCase().includes(q));
  }
  $('txCount').textContent = txs.length;
  // running balance (newest-first list, compute oldest→newest then map)
  let run = Number(b.startAmount) || 0;
  const ordered = [...txs].reverse();
  const balMap = {};
  for (const t of ordered) { run += t.type === 'in' ? Number(t.amount) : -Number(t.amount); balMap[t.id] = run; }
  $('txList').innerHTML = txs.length ? txs.map(t => `
    <div class="tx glass" onclick="openTxModal('${t.id}')">
      <div class="tx-ic ${t.type}">${t.type === 'in' ? '▲' : '▼'}</div>
      <div class="tx-info"><b>${esc(t.person)} • ${t.type === 'in' ? 'gave' : 'took'} ${fmt(t.amount)}</b><small>${esc(t.note || '—')} • ${fdate(t.date)}</small></div>
      <div class="tx-amt"><strong class="${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'}₹${esc(Number(t.amount).toLocaleString('en-IN'))}</strong><span>bal ${fmt(balMap[t.id])}</span></div>
    </div>`).join('')
    : `<div class="glass empty"><div class="empty-emoji">🧾</div><h3>No entries</h3><p>Tap + to add gave / got money.</p></div>`;
}
window.filterPerson = (name) => { state.search = name; $('searchInput').value = name; renderBook(); };
document.querySelectorAll('.seg [data-f]').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.seg [data-f]').forEach(x => x.classList.remove('active'));
  btn.classList.add('active'); state.filter = btn.dataset.f; renderBook();
});
$('searchInput').addEventListener('input', e => { state.search = e.target.value; renderBook(); });
$('bookMenuBtn').onclick = () => openSheet('menuModal');
$('editBookBtn').onclick = () => { closeSheets(); openBookModal(state.bookId); };
$('exportBookBtn').onclick = async () => {
  const books = await DB.listBooks(); const b = books.find(x => x.id === state.bookId);
  const txs = await DB.listTx(b.id);
  const csv = 'date,type,person,amount,note,balance\n' + (() => { let r = Number(b.startAmount) || 0; return [...txs].reverse().map(t => { r += t.type === 'in' ? +t.amount : -+t.amount; return [t.date, t.type, `"${t.person}"`, t.amount, `"${(t.note || '').replace(/"/g, '""')}"`, r].join(','); }).join('\n'); })();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = b.name.replace(/\s+/g, '_') + '_khata.csv'; a.click();
  closeSheets(); toast('CSV exported');
};

// ---------- notebook modal ----------
window.openBookModal = async (id = null) => {
  state.editBookId = id;
  $('bookModalTitle').textContent = id ? 'Edit Notebook' : 'New Notebook';
  $('deleteBookBtn').classList.toggle('hidden', !id);
  if (id) {
    const b = (await DB.listBooks()).find(x => x.id === id);
    $('bookName').value = b.name; $('bookStartAmt').value = b.startAmount;
  } else { $('bookName').value = ''; $('bookStartAmt').value = ''; }
  openSheet('bookModal'); setTimeout(() => $('bookName').focus(), 150);
};
$('saveBookBtn').onclick = async () => {
  const name = $('bookName').value.trim();
  if (!name) return toast('Enter notebook name');
  await DB.saveBook({ id: state.editBookId, name, startAmount: $('bookStartAmt').value });
  closeSheets(); toast('Notebook saved'); go('home');
};
$('deleteBookBtn').onclick = async () => { if (!confirm('Delete this book + all entries?')) return; await DB.deleteBook(state.editBookId); closeSheets(); toast('Deleted'); go('home'); };
$('delBookBtn2').onclick = async () => { if (!confirm('Delete this book + all entries?')) return; await DB.deleteBook(state.bookId); closeSheets(); toast('Deleted'); go('home'); };

// ---------- transaction modal ----------
window.openTxModal = async (txId = null) => {
  if (!state.bookId && state.view === 'book') return;
  if (state.view === 'home') { toast('Open a book first'); return; }
  state.editTxId = txId;
  $('txModalTitle').textContent = txId ? 'Edit Entry' : 'New Entry';
  $('deleteTxBtn').classList.toggle('hidden', !txId);
  const books = await DB.listBooks();
  const b = books.find(x => x.id === state.bookId);
  $('personDatalist').innerHTML = DB.personNames(b.id).map(n => `<option value="${esc(n)}">`).join('');
  if (txId) {
    const t = (await DB.listTx(b.id)).find(x => x.id === txId);
    setTxType(t.type); $('txAmount').value = t.amount; $('txPerson').value = t.person;
    $('txNote').value = t.note || ''; $('txDate').value = toLocalInput(new Date(t.date));
  } else {
    setTxType('out'); $('txAmount').value = ''; $('txPerson').value = '';
    $('txNote').value = ''; $('txDate').value = toLocalInput(new Date());
  }
  updatePreview(); openSheet('txModal');
  setTimeout(() => $('txAmount').focus(), 150);
};
function setTxType(t) {
  state.txType = t;
  $('typeIn').classList.toggle('active', t === 'in');
  $('typeOut').classList.toggle('active', t === 'out');
  updatePreview();
}
$('typeIn').onclick = () => setTxType('in');
$('typeOut').onclick = () => setTxType('out');
$('txAmount').addEventListener('input', updatePreview);
function updatePreview() {
  const books0 = true;
  DB.listBooks().then(books => {
    const b = books.find(x => x.id === state.bookId); if (!b) return;
    const s = DB.sums(b.id);
    const a = Number($('txAmount').value) || 0;
    $('runBalancePreview').textContent = 'Balance after this: ' + fmt(s.balance + (state.txType === 'in' ? a : -a));
  });
}
$('saveTxBtn').onclick = async () => {
  const amount = Number($('txAmount').value);
  if (!amount || amount <= 0) return toast('Enter valid amount');
  const person = $('txPerson').value.trim() || 'Unknown';
  const d = $('txDate').value ? new Date($('txDate').value).toISOString() : new Date().toISOString();
  await DB.saveTx({ id: state.editTxId, bookId: state.bookId, type: state.txType, amount, person, note: $('txNote').value, date: d });
  closeSheets(); toast(state.txType === 'in' ? 'Money in saved ✓' : 'Money out saved ✓');
  renderBook();
};
$('deleteTxBtn').onclick = async () => { if (!confirm('Delete this entry?')) return; await DB.deleteTx(state.editTxId); closeSheets(); toast('Entry deleted'); renderBook(); };

// ---------- PWA install ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt = null; $('installBtn').classList.add('hidden'); };

// ---------- boot ----------
go('home');
