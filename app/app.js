const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('molot.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('molot.' + k, JSON.stringify(v)); } catch {} }
};
const rub = n => n + 'р';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let cart = store.get('cart', {});   // key -> { name, price, qty }
let stamps = store.get('stamps', 3);

// ---------- Навигация ----------
function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  window.scrollTo({ top: 0 });
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 1800);
}

// ---------- Меню ----------
function sizeLabels(it) {
  if (!it.v || it.p.length < 2) return [];
  const parts = it.v.replace(/\s*(мл|гр)$/, '').split('/');
  return parts.length === it.p.length ? parts : it.p.map((_, i) => 'размер ' + (i + 1));
}
function renderMenu() {
  let html = '', lastGroup = '';
  MENU.forEach(cat => {
    if (cat.group !== lastGroup) { html += `<h2 class="group-title">${cat.group}</h2>`; lastGroup = cat.group; }
    html += `<section class="cat" id="cat-${cat.id}"><h3>${cat.title}</h3>`;
    cat.items.forEach(it => {
      const badges = (it.hit ? '<span class="badge">хит!</span>' : '') + (it.isNew ? '<span class="badge">новинка!</span>' : '');
      const sub = it.v ? `<small>${esc(it.v)}</small>` : '';
      let action;
      if (it.p.length > 1) {
        const labels = sizeLabels(it);
        action = `<div class="sizes">${it.p.map((p, i) =>
          `<button data-add="${esc(it.n)}" data-size="${esc(labels[i])}" data-price="${p}" aria-label="${esc(it.n)} ${esc(labels[i])}">${p}</button>`).join('')}</div>`;
      } else {
        action = `<span class="price">${rub(it.p[0])}</span><button class="add" data-add="${esc(it.n)}" data-price="${it.p[0]}" aria-label="Добавить ${esc(it.n)}">+</button>`;
      }
      html += `<div class="item"><div class="nm">${esc(it.n)}${badges}${sub}</div>${action}</div>`;
    });
    if (cat.extra) html += `<p class="extra">${esc(cat.extra)}</p>`;
    html += '</section>';
  });
  html += '<div class="checks"></div>';
  $('#menuList').innerHTML = html;

  $('#chips').innerHTML = MENU.map(c => `<button data-cat="${c.id}">${c.title}</button>`).join('');
}
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $('#cat-' + b.dataset.cat).scrollIntoView({ behavior: 'smooth' });
  document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b));
});
$('#menuList').addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const name = b.dataset.add + (b.dataset.size ? ` (${b.dataset.size})` : '');
  const price = Number(b.dataset.price);
  const cur = cart[name] || { name, price, qty: 0 };
  cur.qty++; cart[name] = cur; saveCart();
  toast('добавили ♡');
});

// ---------- Корзина ----------
function saveCart() { store.set('cart', cart); renderCart(); }
function renderCart() {
  const lines = Object.values(cart);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const sum = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const badge = $('#cartCount'); badge.hidden = !count; badge.textContent = count;

  if (!count) {
    $('#cartBody').innerHTML = '<div class="empty"><p class="note">пока пусто</p><p>Добавьте что-нибудь из меню — заберёте без очереди.</p></div>';
    return;
  }
  const places = PLACES.filter(p => !p.soon).map(p => `<option>${esc(p.city)}, ${esc(p.name)}</option>`).join('');
  $('#cartBody').innerHTML = lines.map(l => `
    <div class="line"><div class="nm">${esc(l.name)}</div>
      <div class="qty"><button data-dec="${esc(l.name)}">−</button><b>${l.qty}</b><button data-inc="${esc(l.name)}">+</button></div>
      <span class="price">${rub(l.price * l.qty)}</span></div>`).join('') + `
    <label class="field">Где заберём<select id="pickPlace">${places}</select></label>
    <label class="field">Когда<select id="pickTime">${timeSlots()}</select></label>
    <div class="total"><span>Итого</span><span>${rub(sum)}</span></div>
    <button class="btn" id="sendOrder">Заказать к времени</button>
    <button class="btn ghost" id="clearCart">Очистить</button>
    <p class="fine">Прототип: заказ никуда не уходит. В рабочей версии он прилетает бариста на планшет.</p>`;
}
function timeSlots() {
  const now = new Date(), out = ['<option>как можно скорее (~10 мин)</option>'];
  const t = new Date(now.getTime() + 20 * 60000); t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
  for (let i = 0; i < 8; i++, t.setMinutes(t.getMinutes() + 15)) {
    const h = t.getHours(); if (h < 8 || h >= 20) continue;
    out.push(`<option>${String(h).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</option>`);
  }
  return out.join('');
}
$('#cartBody').addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.inc) cart[t.dataset.inc].qty++;
  else if (t.dataset.dec) { if (--cart[t.dataset.dec].qty <= 0) delete cart[t.dataset.dec]; }
  else if (t.id === 'clearCart') cart = {};
  else if (t.id === 'sendOrder') {
    toast('заказ принят, ждём вас ♡'); cart = {}; stamps = Math.min(stamps + 1, 10); store.set('stamps', stamps); renderLoyal();
  } else return;
  saveCart();
});

// ---------- Карта лояльности ----------
function renderLoyal() {
  $('#loyal').innerHTML = Array.from({ length: 10 }, (_, i) =>
    i === 9 ? `<div class="stamp gift ${stamps >= 10 ? 'full' : ''}">♡</div>`
            : `<div class="stamp ${i < stamps ? 'full' : ''}">${i + 1}</div>`).join('');
}
$('#stampBtn').addEventListener('click', () => {
  if (stamps >= 10) { stamps = 0; toast('кофе в подарок! ♡'); }
  else { stamps++; toast(stamps >= 10 ? 'следующий кофе — наш!' : 'штамп добавлен'); }
  store.set('stamps', stamps); renderLoyal();
});

// ---------- Точки ----------
function renderPlaces() {
  $('#places').innerHTML = PLACES.map(p => `
    <div class="place ${p.soon ? 'soon' : ''}">
      <p class="tag">${esc(p.tag)}</p>
      <h4>${esc(p.name)}</h4>
      <p>${esc(p.city)}${p.soon ? ' · скоро открытие' : ' · ' + esc(p.hours)}</p>
      ${p.soon ? '' : `<p><a href="https://yandex.ru/maps/?text=${encodeURIComponent(p.city + ', ' + p.name + ' molot')}" target="_blank" rel="noopener">Маршрут →</a></p>`}
    </div>`).join('');
}

// ---------- Настроение сезона ----------
function setTheme(id) {
  const th = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = th.id;
  $('meta[name=theme-color]').content = th.bg;
  $('#moodName').textContent = th.name;
  store.set('theme', th.id);
  document.querySelectorAll('.theme').forEach(b => b.classList.toggle('on', b.dataset.theme === th.id));
}
function renderThemes() {
  $('#themes').innerHTML = THEMES.map(t => `
    <button class="theme" data-theme="${t.id}">
      <span class="swatch" style="background:${t.bg};color:${t.ink};border-color:${t.ink}">m.</span>
      <span><b>${t.name}</b><span>${t.note}</span></span>
    </button>`).join('');
}
$('#moodBtn').addEventListener('click', () => ($('#moodSheet').hidden = false));
$('#moodSheet').addEventListener('click', e => {
  if (e.target.matches('[data-close]')) $('#moodSheet').hidden = true;
  const b = e.target.closest('.theme'); if (b) { setTheme(b.dataset.theme); $('#moodSheet').hidden = true; }
});

// ---------- Старт ----------
renderMenu(); renderCart(); renderLoyal(); renderPlaces(); renderThemes();
setTheme(store.get('theme', 'tomato'));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
