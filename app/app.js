const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Состояние ----------
const S = {
  cart: store.get('cart', []),
  favs: store.get('favs', []),
  user: store.get('user', null),
  branch: store.get('branch', 'lomako'),
  myOrders: store.get('myOrders', []),
  promo: store.get('promo', ''),
  bonus: store.get('bonusUse', 0),
  prefs: store.get('prefs', { status: true, promo: false }),
  theme: store.get('theme', 'tomato'),
  demoLost: store.get('demoLost', false)
};
const save = k => store.set({ cart: 'cart', favs: 'favs', user: 'user', branch: 'branch', myOrders: 'myOrders', promo: 'promo', bonus: 'bonusUse', prefs: 'prefs', theme: 'theme', demoLost: 'demoLost' }[k], S[k]);

let checkout = { state: 'idle', idemKey: null, error: '' }; // idle | sending | error
let flash = '';

const cartCount = () => S.cart.reduce((s, l) => s + l.qty, 0);
const q = () => quote({ cart: S.cart, branchId: S.branch, promo: S.promo, bonus: S.bonus, balance: srv.bonus().balance, usedPromos: store.get('usedPromos', []) });
const fromPrice = it => Math.min(...it.p);

// ---------- Иллюстрации-заглушки (вместо фото) ----------
const ART = {
  coffee: '<path d="M60 80h80l-8 62a10 10 0 0 1-10 8H78a10 10 0 0 1-10-8z"/><path d="M140 92h14a14 14 0 0 1 0 28h-10"/><path d="M82 60c-8-10 8-14 0-26M106 60c-8-10 8-14 0-26M130 60c-8-10 8-14 0-26"/><path d="M44 156h112"/>',
  drinks: '<path d="M70 70h60l-8 80a8 8 0 0 1-8 8H86a8 8 0 0 1-8-8z"/><path d="M104 70l22-40"/><circle cx="130" cy="82" r="14"/><path d="M80 100h40"/>',
  food: '<ellipse cx="100" cy="112" rx="62" ry="22"/><path d="M52 104c4-28 92-28 96 0"/><path d="M84 84c2-8 14-8 16 0M104 80c2-8 14-8 16 0"/><path d="M118 40v30M128 40v30M138 40v30"/>'
};
const ph = (it, big) => `<div class="ph ${big ? 'big' : ''}"><svg viewBox="0 0 200 170" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ART[it.group] || ART.coffee}</g></svg>${big ? '<span class="ph-note">фото скоро</span>' : ''}</div>`;
const icons = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
  menu: '<path d="M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M17 11h2a2 2 0 0 1 0 4h-2"/><path d="M9 3v3M13 3v3"/>',
  orders: '<path d="M6 7h12l1 13H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 5-7 8-7s7 2 8 7"/>'
};
const svgi = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]}</svg>`;

// ---------- Роутер ----------
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
const go = h => { location.hash = h; };
const here = () => location.hash.replace(/^#/, '') || '/home';
function tab() {
  const h = here();
  if (/^\/(menu|cat|item)/.test(h)) return 'menu';
  if (/^\/(orders|order\/|cart|checkout)/.test(h)) return 'orders';
  if (/^\/(profile|loyalty|bonus|promos|favs|settings|auth)/.test(h)) return 'profile';
  return 'home';
}
function toast(msg) { flash = msg; const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2000); }

function render() {
  const h = here();
  let view = null;
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { view = fn(...m.slice(1)); break; } }
  if (!view) view = notFound();
  $('#view').innerHTML = view;
  const showBar = cartCount() > 0 && !/^\/(cart|checkout|auth|order\/)/.test(h);
  const c = q();
  $('#cartbar').innerHTML = showBar ? `<a class="cartbar" href="#/cart"><span>Корзина · ${cartCount()}</span><b>${rub(c.total + c.bonusUsed * CONFIG.bonusRub + c.discount)}</b></a>` : '';
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab()));
  $('#branchTop').textContent = branchById(S.branch).city;
  window.scrollTo({ top: 0 });
}
const notFound = () => `<div class="empty"><p class="note">такой страницы нет</p><a class="btn" href="#/home">На главную</a></div>`;
const back = (to) => `<a class="back" href="${to || 'javascript:history.back()'}" aria-label="Назад">←</a>`;
const head = (title, to) => `<div class="phead">${back(to)}<h1>${title}</h1></div>`;
const checks = '<div class="checks"></div>';

// ---------- Общие компоненты ----------
function badges(it) { return (it.hit ? '<span class="badge">хит!</span>' : '') + (it.isNew ? '<span class="badge">новинка!</span>' : ''); }
function itemRow(it) {
  const off = !available(it.id, S.branch);
  const simple = it.p.length === 1 && it.mods.length === 0 && !off;
  const fav = S.favs.includes(it.id);
  return `<div class="item ${off ? 'off' : ''}">
    <a class="item-main" href="#/item/${it.id}">${ph(it)}<div class="nm">${esc(it.n)}${badges(it)}<small>${esc(it.v.length ? it.v.join(' / ') : '')}${off ? ' · нет на этой точке' : ''}</small></div></a>
    <span class="price">${it.p.length > 1 ? 'от ' : ''}${rub(fromPrice(it))}</span>
    ${simple ? `<button class="add" data-quick="${it.id}" aria-label="Добавить ${esc(it.n)}">+</button>` : `<button class="fav ${fav ? 'on' : ''}" data-fav="${it.id}" aria-label="В избранное">${fav ? '♥' : '♡'}</button>`}
  </div>`;
}
function stepper(key, qty) { return `<div class="qty"><button data-dec="${esc(key)}" aria-label="Меньше">−</button><b>${qty}</b><button data-inc="${esc(key)}" aria-label="Больше">+</button></div>`; }
const stateEmpty = (note, text, btn) => `<div class="empty"><svg viewBox="0 0 200 170" class="empty-art" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ART.coffee}</g></svg><p class="note">${note}</p><p>${text}</p>${btn || ''}</div>`;

function slots(branch) {
  const off = 7 * 3600e3; // Красноярск UTC+7
  const t = new Date(Date.now() + off + 20 * 60e3);
  t.setUTCMinutes(Math.ceil(t.getUTCMinutes() / 15) * 15, 0, 0);
  const out = [];
  for (let i = 0; i < 12 && out.length < 8; i++, t.setUTCMinutes(t.getUTCMinutes() + 15)) {
    const hh = t.getUTCHours(); if (hh < branch.open[0] || hh >= branch.open[1]) continue;
    out.push(String(hh).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0'));
  }
  return out;
}
const fmtDate = ts => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Krasnoyarsk' });
const myOrdersList = () => { syncBonus(); const all = srv.orders(); return S.myOrders.map(id => Object.values(all).find(o => o.id === id)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt); };

// ---------- 1. Главная ----------
route(/^\/home$/, () => {
  const b = branchById(S.branch), open = branchOpen(b);
  const last = myOrdersList().find(o => orderStatus(o) === 'Завершён');
  const bn = srv.bonus();
  return `
  <section class="hero"><p class="note">${S.user ? 'привет, ' + esc(S.user.name) : 'привет'} ♡</p><h1>good coffee,<br>better days</h1></section>
  <a class="branchpill" href="#/branches"><span class="dot ${open ? 'on' : ''}"></span><span><b>${esc(b.city)}, ${esc(b.name)}</b><small>${open ? 'открыто до ' + b.open[1] + ':00' : 'сейчас закрыто, открываемся в ' + b.open[0] + ':00'}</small></span><i>сменить</i></a>
  ${last ? `<div class="block"><h3>Как обычно</h3><p>${esc(last.lines.map(l => l.name).join(', '))}</p><button class="btn" data-repeat="${last.id}">Повторить заказ</button></div>` : ''}
  <a class="strip" href="${S.user ? '#/loyalty' : '#/auth'}"><span>Бонусы <small>демо</small></span><b>${S.user ? bn.balance : '—'}</b><i>${S.user ? 'карта →' : 'войти →'}</i></a>
  <a class="strip" href="#/promos"><span>Акции и промокоды</span><b>${PROMOS.length}</b><i>смотреть →</i></a>
  ${NEWS.map(n => `<div class="block"><h3>${esc(n.title)}</h3><p class="fine">${esc(n.text)}</p><div class="hrow">${n.items.map(id => `<a class="hcard" href="#/item/${id}">${ph(ITEMS[id])}<span>${esc(ITEMS[id].n)}</span><b>${rub(fromPrice(ITEMS[id]))}</b></a>`).join('')}</div></div>`).join('')}
  <p class="demonote">Демо-версия. Меню по Instagram-историям от 8 сентября, цены и акции не являются актуальными.</p>${checks}`;
});

// ---------- 2. Каталог ----------
route(/^\/menu$/, () => `
  ${head('Меню', '#/home')}
  <input id="search" class="search" type="search" placeholder="Найти в меню" aria-label="Поиск по меню" autocomplete="off">
  <div id="found"></div>
  <div id="cats">${Object.keys(GROUPS).map(g => `<h2 class="gtitle">${GROUPS[g]}</h2>` + MENU.filter(c => c.group === g).map(c => `<a class="catrow" href="#/cat/${c.id}"><span>${esc(c.title)}</span><i>${c.items.length}</i></a>`).join('')).join('')}</div>${checks}`);

// ---------- 3. Категория ----------
route(/^\/cat\/([\w-]+)$/, id => {
  const c = MENU.find(x => x.id === id); if (!c) return notFound();
  return `${head(esc(c.title), '#/menu')}${c.items.map(itemRow).join('')}${checks}`;
});

// ---------- 4. Карточка позиции ----------
route(/^\/item\/([\w-]+)$/, id => {
  const it = ITEMS[id]; if (!it) return notFound();
  const off = !available(id, S.branch), fav = S.favs.includes(id), simple = it.p.length === 1 && it.mods.length === 0;
  return `${head('', '#/cat/' + it.cat)}
  ${ph(it, true)}
  <div class="idetail"><h2>${esc(it.n)}${badges(it)}</h2>
  <p class="fine">${esc(it.v.join(' / '))}</p>
  ${it.note ? `<p>На выбор: ${esc(it.note)}.</p>` : ''}
  <p class="demonote">Состав и КБЖУ появятся, когда их передаст кофейня.</p>
  <div class="irow"><span class="price big">${it.p.length > 1 ? 'от ' : ''}${rub(fromPrice(it))}</span><button class="fav ${fav ? 'on' : ''}" data-fav="${id}" aria-label="В избранное">${fav ? '♥' : '♡'}</button></div>
  ${off ? '<p class="warn">Этой позиции нет на выбранной точке.</p><a class="btn ghost" href="#/branches">Сменить точку</a>'
    : simple ? `<button class="btn" data-quick="${id}">В корзину · ${rub(it.p[0])}</button>` : `<button class="btn" data-config="${id}">Выбрать и добавить</button>`}
  </div>`;
});

// ---------- 5. Настройка напитка (шторка) ----------
let cfg = null;
function openConfig(id) {
  const it = ITEMS[id]; cfg = { id, size: 0, mods: Object.fromEntries(it.mods.map(m => [m, MODS[m].options[0].id])), qty: 1 };
  renderConfig();
}
function renderConfig() {
  const it = ITEMS[cfg.id], sh = $('#sheet');
  const line = priceLine({ itemId: cfg.id, size: cfg.size, mods: cfg.mods, qty: cfg.qty }, S.branch);
  sh.hidden = false;
  sh.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet-body" role="dialog" aria-label="Настройка">
    <h3>${esc(it.n)}</h3>
    ${it.p.length > 1 ? `<fieldset><legend>Размер</legend>${it.p.map((p, i) => `<label class="opt"><input type="radio" name="size" value="${i}" ${cfg.size === i ? 'checked' : ''}><span>${esc(it.v[i] || 'Стандарт')}</span><b>${rub(p)}</b></label>`).join('')}</fieldset>` : ''}
    ${it.mods.map(m => `<fieldset><legend>${MODS[m].title}</legend>${MODS[m].options.map(o => `<label class="opt"><input type="radio" name="m-${m}" value="${o.id}" ${cfg.mods[m] === o.id ? 'checked' : ''}><span>${esc(o.n)}</span><b>${o.d ? '+' + rub(o.d) : ''}</b></label>`).join('')}</fieldset>`).join('')}
    <div class="sheet-foot">${stepper('cfg', cfg.qty)}<button class="btn" data-addcfg>В корзину · ${rub(line.unit * cfg.qty)}</button></div>
  </div>`;
}
const closeSheet = () => { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; cfg = null; };

function addToCart(l) {
  const key = lineKey(l), ex = S.cart.find(x => lineKey(x) === key);
  if (ex) ex.qty += l.qty; else S.cart.push({ ...l });
  save('cart'); toast('добавили ♡'); render();
}

// ---------- 6. Корзина ----------
route(/^\/cart$/, () => {
  const c = q();
  if (!S.cart.length) return `${head('Корзина', '#/menu')}${stateEmpty('пока пусто', 'Добавьте что-нибудь из меню и заберёте без очереди.', '<a class="btn" href="#/menu">В меню</a>')}`;
  const b = branchById(S.branch);
  return `${head('Корзина', '#/menu')}
  <a class="branchpill" href="#/branches"><span class="dot ${branchOpen(b) ? 'on' : ''}"></span><span><b>${esc(b.city)}, ${esc(b.name)}</b><small>заберёте здесь</small></span><i>сменить</i></a>
  ${c.lines.map(l => `<div class="line ${l.status !== 'ok' ? 'off' : ''}"><div class="nm">${esc(l.name)}${l.labels.length ? `<small>${esc(l.labels.join(', '))}</small>` : ''}${l.status === 'stop' ? '<small class="warn">Нет на этой точке. Уберите или смените точку.</small>' : ''}${l.status === 'removed' ? '<small class="warn">Позиции больше нет в меню.</small>' : ''}</div>
    ${l.status === 'ok' ? stepper(lineKey(l), l.qty) : `<button class="link" data-del="${esc(lineKey(l))}">убрать</button>`}<span class="price">${l.status === 'ok' ? rub(l.total) : '—'}</span></div>`).join('')}
  <div class="promo"><input id="promoIn" placeholder="Промокод" value="${esc(S.promo)}" aria-label="Промокод" autocapitalize="characters"><button class="btn ghost sm" data-promo>Применить</button></div>
  ${c.promoError ? `<p class="warn">${esc(c.promoError)}</p>` : c.promoApplied ? `<p class="ok">Промокод ${esc(c.promoApplied.code)}: −${rub(c.discount)}</p>` : ''}
  ${S.user ? `<div class="bonusrow"><span>Списать бонусы <small>демо, доступно до ${c.bonusMax}</small></span><div class="qty"><button data-bdec aria-label="Меньше">−</button><b>${c.bonusUsed}</b><button data-binc aria-label="Больше">+</button></div></div>` : '<p class="fine">Войдите, чтобы списывать и копить бонусы.</p>'}
  <div class="sum"><div><span>Позиции</span><span>${rub(c.subtotal)}</span></div>${c.discount ? `<div><span>Промокод</span><span>−${rub(c.discount)}</span></div>` : ''}${c.bonusUsed ? `<div><span>Бонусы</span><span>−${rub(c.bonusUsed * CONFIG.bonusRub)}</span></div>` : ''}
  <div class="total"><span>Итого</span><span>${rub(c.total)}</span></div>${c.accrual && S.user ? `<p class="fine">После выдачи заказа начислим ${c.accrual} бонусов (демо-параметр).</p>` : ''}</div>
  <p class="fine">Сумму подтверждает сервер при оформлении. Если цена или наличие изменятся, мы покажем это.</p>
  <button class="btn" data-tocheckout ${c.blocked.length || !c.hasItems ? 'disabled' : ''}>К оформлению</button>${checks}`;
});

// ---------- 7. Оформление ----------
route(/^\/checkout$/, () => {
  if (!S.cart.length) { return `${head('Оформление', '#/cart')}${stateEmpty('корзина пуста', 'Сначала выберите что-нибудь в меню.', '<a class="btn" href="#/menu">В меню</a>')}`; }
  const c = q(), b = branchById(S.branch), open = branchOpen(b), sl = slots(b);
  const sending = checkout.state === 'sending';
  return `${head('Оформление', '#/cart')}
  <div class="block"><h3>Где и когда</h3>
    <p><b>${esc(b.city)}, ${esc(b.name)}</b> <a class="link" href="#/branches">сменить</a></p>
    <label class="field">Время получения<select id="pickup">${open ? '<option value="asap">как можно скорее (около 10 минут)</option>' : ''}${sl.map(t => `<option value="${t}">${t}</option>`).join('')}</select></label>
    ${!open && !sl.length ? '<p class="warn">Сегодня точка уже закрыта.</p>' : ''}
  </div>
  <div class="block"><h3>Контакты</h3>${S.user ? `<p>${esc(S.user.name)}, ${esc(S.user.phone)}</p>` : `<p>Чтобы оформить заказ, нужен вход по телефону.</p><a class="btn ghost" href="#/auth">Войти</a>`}</div>
  <div class="block"><h3>Оплата</h3><p>На точке при получении. Онлайн-оплата пока не подключена.</p></div>
  <div class="sum"><div><span>Позиции</span><span>${rub(c.subtotal)}</span></div>${c.discount ? `<div><span>Промокод</span><span>−${rub(c.discount)}</span></div>` : ''}${c.bonusUsed ? `<div><span>Бонусы</span><span>−${rub(c.bonusUsed)}</span></div>` : ''}<div class="total"><span>Итого</span><span>${rub(c.total)}</span></div></div>
  ${checkout.state === 'error' ? `<div class="alert"><b>${esc(checkout.error)}</b><p>Заказ мог дойти до кофейни. Нажмите «Проверить и отправить»: повторный запрос не создаст дубль.</p></div>` : ''}
  <button class="btn" data-place ${sending || !S.user || c.blocked.length || (!open && !sl.length) ? 'disabled' : ''}>${sending ? 'Отправляем…' : checkout.state === 'error' ? 'Проверить и отправить' : 'Подтвердить заказ'}</button>
  <p class="fine">Заказ считается оформленным, когда его подтвердит сервер. Только после этого вы увидите номер.</p>`;
});

async function place() {
  if (checkout.state === 'sending') return;
  const c = q(); if (!checkout.idemKey) checkout.idemKey = uid();
  const pickup = $('#pickup') ? $('#pickup').value : 'asap';
  checkout.state = 'sending'; render();
  try {
    const o = await placeOrder({ idemKey: checkout.idemKey, cart: S.cart, branchId: S.branch, pickup, promo: S.promo, bonus: S.bonus, expectedTotal: c.total, simulateLostResponse: S.demoLost });
    S.demoLost = false; save('demoLost');
    if (!S.myOrders.includes(o.id)) S.myOrders.push(o.id); save('myOrders');
    S.cart = []; S.promo = ''; S.bonus = 0; ['cart', 'promo', 'bonus'].forEach(save);
    checkout = { state: 'idle', idemKey: null, error: '' };
    go('/order/' + o.id);
  } catch (e) {
    if (e.code === 'network') { S.demoLost = false; save('demoLost'); checkout.state = 'error'; checkout.error = e.message; }
    else { checkout = { state: 'idle', idemKey: null, error: '' }; toast(e.message || 'Не удалось оформить заказ'); }
    render();
  }
}

// ---------- 8. Филиалы ----------
route(/^\/branches$/, () => `${head('Где нас найти', '#/home')}<p class="note">у каждого свой molot ♡</p>
  ${BRANCHES.map(b => {
    const open = branchOpen(b);
    return `<div class="place ${b.soon ? 'soon' : ''} ${S.branch === b.id ? 'sel' : ''}"><p class="tag">${esc(b.tag)}</p><h4>${esc(b.name)}</h4>
    <p>${esc(b.city)} · ${b.soon ? 'скоро открытие' : open ? 'открыто до ' + b.open[1] + ':00' : 'закрыто, откроемся в ' + b.open[0] + ':00'}</p>
    ${b.soon ? '' : `<div class="prow"><button class="btn sm ${S.branch === b.id ? '' : 'ghost'}" data-branch="${b.id}">${S.branch === b.id ? 'Выбрана' : 'Выбрать'}</button><a class="link" target="_blank" rel="noopener" href="https://yandex.ru/maps/?text=${encodeURIComponent(b.city + ', ' + b.name + ' molot')}">маршрут →</a></div>`}</div>`;
  }).join('')}`);

// ---------- 9. Статус заказа ----------
route(/^\/order\/([\w]+)$/, id => {
  const o = myOrdersList().find(x => x.id === id); if (!o) return `${head('Заказ', '#/orders')}${stateEmpty('не нашли заказ', 'Возможно, он ещё не подтверждён сервером.', '<a class="btn" href="#/orders">К заказам</a>')}`;
  const st = orderStatus(o), b = branchById(o.branchId), idx = STATUSES.indexOf(st), cancelled = st === 'Отменён';
  return `${head('Заказ ' + esc(o.number), '#/orders')}
  <div class="statusbox" id="statusbox" data-order="${o.id}">
    <p class="note">${esc(st).toLowerCase()}</p>
    ${cancelled ? '<p class="warn">Заказ отменён.</p>' : `<ol class="steps">${STATUSES.slice(0, 5).map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'cur' : ''}">${s}</li>`).join('')}</ol>`}
  </div>
  <p class="demonote">Демо: статусы сменяются сами. В боевой версии их выставляет сотрудник.</p>
  <div class="block"><h3>Получение</h3><p>${esc(b.city)}, ${esc(b.name)}<br>${o.pickup === 'asap' ? 'как можно скорее' : 'к ' + esc(o.pickup)}</p></div>
  <div class="block"><h3>Состав</h3>${o.lines.map(l => `<div class="sline"><span>${l.qty} × ${esc(l.name)}${l.labels.length ? ` <small>${esc(l.labels.join(', '))}</small>` : ''}</span><span>${rub(l.total)}</span></div>`).join('')}
  ${o.discount ? `<div class="sline"><span>Промокод ${esc(o.promo)}</span><span>−${rub(o.discount)}</span></div>` : ''}${o.bonusUsed ? `<div class="sline"><span>Бонусы</span><span>−${o.bonusUsed}</span></div>` : ''}
  <div class="total"><span>Итого</span><span>${rub(o.total)}</span></div><p class="fine">Оплата на точке при получении.</p></div>
  ${st === 'Новый' ? `<button class="btn ghost" data-cancel="${o.id}">Отменить заказ</button>` : ''}
  <button class="btn ghost" data-repeat="${o.id}">Повторить заказ</button>`;
});

// ---------- 10. Вход ----------
let auth = { step: 'phone', phone: '', error: '' };
route(/^\/auth$/, () => `${head('Вход', '#/profile')}
  <p class="note">по номеру телефона</p>
  ${auth.step === 'phone' ? `<label class="field">Телефон<input id="phone" type="tel" inputmode="tel" placeholder="+7 900 000-00-00" value="${esc(auth.phone)}" autocomplete="tel"></label>
  <label class="check"><input type="checkbox" id="c-pd"><span>Согласен(на) на обработку персональных данных <a class="link" href="#/settings">подробнее</a></span></label>
  <label class="check"><input type="checkbox" id="c-ads"><span>Хочу получать акции и новости (необязательно)</span></label>
  ${auth.error ? `<p class="warn">${esc(auth.error)}</p>` : ''}
  <button class="btn" data-sendcode>Получить код</button>`
  : `<p>Код отправлен на ${esc(auth.phone)}.</p><p class="demonote">Демо: введите 1234. SMS не отправляется.</p>
  <label class="field">Код<input id="code" inputmode="numeric" maxlength="4" autocomplete="one-time-code"></label>
  <label class="field">Как к вам обращаться<input id="uname" placeholder="Имя" autocomplete="given-name"></label>
  ${auth.error ? `<p class="warn">${esc(auth.error)}</p>` : ''}
  <button class="btn" data-login>Войти</button>`}`);

function seedDemoOrders() {
  if (S.myOrders.length) return;
  const all = srv.orders(), mk = (days, itemIds) => {
    const lines = itemIds.map(([id, size]) => { const l = priceLine({ itemId: id, size, mods: {}, qty: 1 }, 'lomako'); return { name: l.name, labels: l.labels, qty: 1, total: l.total, itemId: id, size, mods: {} }; });
    const total = lines.reduce((s, l) => s + l.total, 0), o = { id: uid(), number: srv.nextNumber(), createdAt: Date.now() - days * 86400e3, branchId: 'lomako', pickup: 'asap', lines, subtotal: total, discount: 0, bonusUsed: 0, total, promo: null, accrual: 0, accrued: true, refunded: true, cancelled: false, idemKey: 'demo-' + uid(), demo: true };
    all[o.idemKey] = o; return o.id;
  };
  S.myOrders = [mk(6, [['author-3', 0], ['breakfast-6', 0]]), mk(2, [['classic-2', 1]])];
  srv.save(all); save('myOrders');
}

// ---------- 11. Профиль ----------
route(/^\/profile$/, () => !S.user
  ? `${head('Профиль', '#/home')}${stateEmpty('давайте знакомиться', 'Войдите по телефону, чтобы копить бонусы и видеть историю заказов.', '<a class="btn" href="#/auth">Войти</a>')}<a class="catrow" href="#/promos"><span>Акции и промокоды</span><i>→</i></a><a class="catrow" href="#/settings"><span>Настройки</span><i>→</i></a>`
  : `${head('Профиль', '#/home')}
  <div class="block"><h3>${esc(S.user.name)}</h3><p>${esc(S.user.phone)}</p></div>
  <a class="catrow" href="#/loyalty"><span>Карта и бонусы</span><i>${srv.bonus().balance}</i></a>
  <a class="catrow" href="#/orders"><span>История заказов</span><i>${S.myOrders.length}</i></a>
  <a class="catrow" href="#/favs"><span>Избранное</span><i>${S.favs.length}</i></a>
  <a class="catrow" href="#/promos"><span>Акции и промокоды</span><i>→</i></a>
  <a class="catrow" href="#/settings"><span>Настройки и согласия</span><i>→</i></a>
  <button class="btn ghost" data-logout>Выйти</button>`);

// ---------- 12. История заказов (вкладка «Заказы») ----------
route(/^\/orders$/, () => {
  if (!S.user) return `${head('Заказы', '#/home')}${stateEmpty('пока ничего', 'Войдите, и здесь появятся ваши заказы.', '<a class="btn" href="#/auth">Войти</a>')}`;
  const list = myOrdersList(), active = list.filter(o => !['Завершён', 'Отменён'].includes(orderStatus(o))), past = list.filter(o => !active.includes(o));
  const row = o => `<a class="orow" href="#/order/${o.id}"><span><b>${esc(o.number)}</b> · ${esc(fmtDate(o.createdAt))}<small>${esc(o.lines.map(l => l.name).join(', '))}</small></span><span><b>${rub(o.total)}</b><small class="st st-${STATUSES.indexOf(orderStatus(o))}">${orderStatus(o)}</small></span></a>`;
  if (!list.length) return `${head('Заказы', '#/home')}${stateEmpty('пока ничего', 'Закажите что-нибудь вкусное.', '<a class="btn" href="#/menu">В меню</a>')}`;
  return `${head('Заказы', '#/home')}${active.length ? `<h2 class="gtitle">Сейчас</h2>${active.map(row).join('')}` : ''}${past.length ? `<h2 class="gtitle">История</h2>${past.map(row).join('')}` : ''}${checks}`;
});

// ---------- 13. Карта лояльности ----------
route(/^\/loyalty$/, () => {
  if (!S.user) return `${head('Карта', '#/profile')}${stateEmpty('нужен вход', 'Карта привязывается к номеру телефона.', '<a class="btn" href="#/auth">Войти</a>')}`;
  syncBonus(); const bn = srv.bonus();
  return `${head('Карта molot.', '#/profile')}
  <div class="card"><p class="note">твой molot</p><div class="bal">${bn.balance}</div><p>бонусов <small>демо</small></p><p class="cardid">${esc(S.user.phone)}</p><div class="checks sm"></div></div>
  <p class="fine">Штрих-код или QR для кассы появится после подключения системы лояльности кофейни.</p>
  <div class="block"><h3>Демо-параметры</h3><p class="fine">Начисление ${CONFIG.accrualPct}% после выдачи заказа, списание до ${CONFIG.maxSpendPct}% суммы, 1 бонус = ${CONFIG.bonusRub} ₽. Это условные значения для макета, реальные правила задаст кофейня.</p></div>
  <a class="btn ghost" href="#/bonus">История бонусов</a>${checks}`;
});

// ---------- 14. История бонусов ----------
route(/^\/bonus$/, () => {
  syncBonus(); const bn = srv.bonus();
  return `${head('История бонусов', '#/loyalty')}${bn.log.length ? bn.log.map(e => `<div class="sline"><span>${esc(e.text)}<small>${esc(fmtDate(e.ts))}</small></span><b class="${e.amount > 0 ? 'ok' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</b></div>`).join('') : stateEmpty('пока пусто', 'Здесь появятся начисления и списания.')}<p class="demonote">Начисление создаётся один раз, когда сервер подтвердил выдачу заказа.</p>`;
});

// ---------- 15. Акции и промокоды ----------
route(/^\/promos$/, () => {
  const used = store.get('usedPromos', []);
  return `${head('Акции', '#/home')}<p class="demonote">Условия придуманы для макета.</p>
  ${PROMOS.map(p => { const u = p.once && used.includes(p.code); return `<div class="block ${u ? 'off' : ''}"><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p><p class="code">${esc(p.code)}</p>${u ? '<p class="fine">Уже использован</p>' : `<button class="btn ghost sm" data-usepromo="${p.code}">Применить в корзине</button>`}</div>`; }).join('')}${checks}`;
});

// ---------- 16. Избранное ----------
route(/^\/favs$/, () => `${head('Избранное', '#/profile')}${S.favs.length ? S.favs.map(id => ITEMS[id]).filter(Boolean).map(itemRow).join('') : stateEmpty('пока пусто', 'Нажмите ♡ у любимой позиции.', '<a class="btn" href="#/menu">В меню</a>')}`);

// ---------- 17. Настройки и согласия ----------
route(/^\/settings$/, () => `${head('Настройки', '#/profile')}
  <div class="block"><h3>Уведомления</h3>
    <label class="check"><input type="checkbox" data-pref="status" ${S.prefs.status ? 'checked' : ''}><span>О статусе заказа</span></label>
    <label class="check"><input type="checkbox" data-pref="promo" ${S.prefs.promo ? 'checked' : ''}><span>Об акциях и новинках</span></label>
    <p class="fine">Push-уведомления в этом макете не отправляются. На iPhone они работают только у приложения, добавленного на экран «Домой».</p></div>
  <div class="block"><h3>Персональные данные</h3><p class="fine">Мы храним минимум: имя и телефон. Правила обработки и согласия определит кофейня вместе с юристом. Текст политики пока не подготовлен.</p>
    ${S.user ? '<button class="btn ghost" data-deletedata>Удалить мои данные</button>' : ''}</div>
  <div class="block"><h3>Настроение сезона</h3><div class="themes">${THEMES.map(t => `<button class="theme ${S.theme === t.id ? 'on' : ''}" data-theme="${t.id}"><span class="swatch" style="background:${t.bg};color:${t.ink};border-color:${t.ink}">m.</span><span><b>${t.name}</b><small>${t.note}</small></span></button>`).join('')}</div></div>
  <div class="block"><h3>Для демонстрации</h3>
    <label class="check"><input type="checkbox" data-pref="demoLost" ${S.demoLost ? 'checked' : ''}><span>Следующий заказ: «потерять» ответ сервера</span></label>
    <p class="fine">Покажет безопасную повторную отправку без дубля заказа.</p>
    <button class="btn ghost" data-reset>Сбросить все демо-данные</button></div>`);

// ---------- События ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, a, .sheet-bg'); if (!t) return;
  const d = t.dataset;
  if (d.quick) { const it = ITEMS[d.quick]; addToCart({ itemId: it.id, size: 0, mods: {}, qty: 1 }); }
  else if (d.config) openConfig(d.config);
  else if (d.addcfg !== undefined) { addToCart({ itemId: cfg.id, size: cfg.size, mods: { ...cfg.mods }, qty: cfg.qty }); closeSheet(); }
  else if (d.close !== undefined) closeSheet();
  else if (d.inc || d.dec) {
    if (d.inc === 'cfg' || d.dec === 'cfg') { cfg.qty = Math.max(1, Math.min(20, cfg.qty + (d.inc ? 1 : -1))); renderConfig(); return; }
    const k = d.inc || d.dec, l = S.cart.find(x => lineKey(x) === k); if (!l) return;
    l.qty += d.inc ? 1 : -1; if (l.qty <= 0) S.cart = S.cart.filter(x => x !== l); save('cart'); render();
  }
  else if (d.del) { S.cart = S.cart.filter(x => lineKey(x) !== d.del); save('cart'); render(); }
  else if (d.fav) { const i = S.favs.indexOf(d.fav); i < 0 ? S.favs.push(d.fav) : S.favs.splice(i, 1); save('favs'); render(); }
  else if (d.promo !== undefined) { S.promo = ($('#promoIn').value || '').trim().toUpperCase(); save('promo'); render(); }
  else if (d.usepromo) { S.promo = d.usepromo; save('promo'); toast('промокод в корзине'); go('/cart'); }
  else if (d.binc !== undefined || d.bdec !== undefined) { const c = q(); S.bonus = Math.max(0, Math.min(c.bonusMax, c.bonusUsed + (d.binc !== undefined ? 10 : -10))); save('bonus'); render(); }
  else if (d.tocheckout !== undefined) { checkout = { state: 'idle', idemKey: null, error: '' }; go('/checkout'); }
  else if (d.place !== undefined) place();
  else if (d.branch) { S.branch = d.branch; save('branch'); toast('точка выбрана'); render(); }
  else if (d.cancel) { const r = cancelOrder(d.cancel); toast(r.ok ? 'заказ отменён' : r.message); render(); }
  else if (d.repeat) { const o = myOrdersList().find(x => x.id === d.repeat); if (o) { o.lines.forEach(l => addToCart({ itemId: l.itemId, size: l.size, mods: l.mods || {}, qty: l.qty })); go('/cart'); } }
  else if (d.sendcode !== undefined) {
    const phone = ($('#phone').value || '').trim(), digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { auth.error = 'Введите номер телефона полностью'; auth.phone = phone; return render(); }
    if (!$('#c-pd').checked) { auth.error = 'Нужно согласие на обработку персональных данных'; auth.phone = phone; return render(); }
    auth = { step: 'code', phone, error: '' }; render();
  }
  else if (d.login !== undefined) {
    if ($('#code').value !== '1234') { auth.error = 'Неверный код. В демо подойдёт 1234.'; return render(); }
    S.user = { name: ($('#uname').value || '').trim() || 'гость', phone: auth.phone }; save('user'); seedDemoOrders(); auth = { step: 'phone', phone: '', error: '' };
    toast('вы вошли'); go(S.cart.length ? '/checkout' : '/profile');
  }
  else if (d.logout !== undefined) { S.user = null; save('user'); S.bonus = 0; save('bonus'); toast('вы вышли'); go('/home'); }
  else if (d.deletedata !== undefined) { ['user', 'myOrders', 'favs'].forEach(k => store.del(k)); store.del('bonus'); store.del('srv.orders'); store.del('usedPromos'); S.user = null; S.myOrders = []; S.favs = []; S.bonus = 0; toast('данные удалены'); go('/home'); }
  else if (d.reset !== undefined) { try { Object.keys(localStorage).filter(k => k.startsWith('molot.')).forEach(k => localStorage.removeItem(k)); } catch {} location.hash = '#/home'; location.reload(); }
  else if (d.theme) { setTheme(d.theme); render(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'size' && cfg) { cfg.size = Number(t.value); renderConfig(); }
  else if (t.name && t.name.startsWith('m-') && cfg) { cfg.mods[t.name.slice(2)] = t.value; renderConfig(); }
  else if (t.dataset.pref) { const k = t.dataset.pref; if (k === 'demoLost') { S.demoLost = t.checked; save('demoLost'); } else { S.prefs[k] = t.checked; save('prefs'); } }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'search') return;
  const v = e.target.value.trim().toLowerCase(), box = $('#found');
  if (!v) { box.innerHTML = ''; $('#cats').hidden = false; return; }
  $('#cats').hidden = true;
  const res = Object.values(ITEMS).filter(it => it.n.toLowerCase().includes(v));
  box.innerHTML = res.length ? res.map(itemRow).join('') : stateEmpty('не нашли', 'Попробуйте другое слово.');
});

// ---------- Тема ----------
function setTheme(id) {
  const th = THEMES.find(t => t.id === id) || THEMES[0];
  S.theme = th.id; save('theme'); document.documentElement.dataset.theme = th.id; $('meta[name=theme-color]').content = th.bg;
}

// ---------- Живое обновление статуса заказа ----------
setInterval(() => {
  const box = $('#statusbox'); if (!box) return;
  const o = myOrdersList().find(x => x.id === box.dataset.order); if (!o) return;
  const cur = box.querySelector('.note').textContent;
  if (cur !== orderStatus(o).toLowerCase()) { const y = window.scrollY; render(); window.scrollTo({ top: y }); }
}, 1000);

// ---------- Старт ----------
setTheme(S.theme);
if (!location.hash) location.hash = '#/home';
window.addEventListener('hashchange', render);
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
