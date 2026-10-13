// Имитация серверной части (ДЕМО). В боевой версии всё это живёт на сервере, а клиент только показывает результат.
// Принципы, которые здесь показаны: цену считает «сервер», заказ создаётся один раз по ключу идемпотентности,
// успех экрана зависит от ответа сервера, бонусы меняются только сервером.

const store = {
  get(k, d) { try { const v = localStorage.getItem('molot.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('molot.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('molot.' + k); } catch {} }
};
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Время и филиалы ----------
function branchOpen(b, now = new Date()) {
  if (b.soon) return false;
  const h = Number(new Intl.DateTimeFormat('ru-RU', { hour: 'numeric', hour12: false, timeZone: b.tz }).format(now)) % 24;
  return h >= b.open[0] && h < b.open[1];
}
const branchById = id => BRANCHES.find(b => b.id === id);
const available = (itemId, branchId) => { const b = branchById(branchId); return !(b && b.stop && b.stop.includes(itemId)); };

// ---------- Строки корзины ----------
function lineKey(l) { return [l.itemId, l.size, Object.keys(l.mods || {}).sort().map(k => k + ':' + l.mods[k]).join(',')].join('|'); }

function priceLine(l, branchId) {
  const it = ITEMS[l.itemId];
  if (!it) return { ...l, name: 'Позиция удалена', status: 'removed', unit: 0, total: 0, labels: [] };
  const size = Math.min(l.size || 0, it.p.length - 1);
  let unit = it.p[size];
  const labels = [];
  if (it.v[size] && it.v.length > 1) labels.push(it.v[size]);
  // Серверная проверка опций: берём только те, что есть у товара
  (it.mods || []).forEach(m => {
    const chosen = MODS[m].options.find(o => o.id === (l.mods || {})[m]);
    if (chosen && chosen.d > 0) { unit += chosen.d; labels.push(chosen.n); }
  });
  const status = available(l.itemId, branchId) ? 'ok' : 'stop';
  return { ...l, name: it.n, status, unit, total: status === 'ok' ? unit * l.qty : 0, labels };
}

function checkPromo(code, subtotal, usedPromos) {
  if (!code) return { ok: true, discount: 0 };
  const p = PROMOS.find(x => x.code === code.trim().toUpperCase());
  if (!p) return { ok: false, error: 'Такого промокода нет' };
  if (p.once && usedPromos.includes(p.code)) return { ok: false, error: 'Этот промокод уже использован' };
  if (subtotal < p.min) return { ok: false, error: `Промокод действует при заказе от ${rub(p.min)}` };
  const discount = p.kind === 'pct' ? Math.floor(subtotal * p.value / 100) : Math.min(p.value, subtotal);
  return { ok: true, discount, promo: p };
}

function maxBonusSpend(afterPromo, balance) {
  return Math.max(0, Math.min(balance, Math.floor(afterPromo * CONFIG.maxSpendPct / 100 / CONFIG.bonusRub)));
}

// Полный пересчёт: клиент присылает только состав, а не суммы
function quote({ cart, branchId, promo, bonus, balance, usedPromos }) {
  const lines = cart.map(l => priceLine(l, branchId));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const pr = checkPromo(promo, subtotal, usedPromos || []);
  const discount = pr.ok ? pr.discount : 0;
  const afterPromo = subtotal - discount;
  const bonusMax = maxBonusSpend(afterPromo, balance || 0);
  const bonusUsed = Math.min(Math.max(0, bonus || 0), bonusMax);
  const total = afterPromo - bonusUsed * CONFIG.bonusRub;
  return {
    lines, subtotal, discount, promoError: pr.ok ? null : pr.error, promoApplied: pr.ok && promo ? pr.promo : null,
    bonusMax, bonusUsed, total, accrual: Math.floor(total * CONFIG.accrualPct / 100),
    blocked: lines.filter(l => l.status !== 'ok'), hasItems: lines.some(l => l.status === 'ok')
  };
}

// ---------- Заказы и бонусы (сервер) ----------
const DEMO_TIMELINE = [0, 6, 16, 36, 100]; // секунд до статусов: Новый, Подтверждён, Готовится, Готов, Завершён

function orderStatus(o, now = Date.now()) {
  if (o.cancelled) return 'Отменён';
  const s = (now - o.createdAt) / 1000;
  let i = 0;
  DEMO_TIMELINE.forEach((t, k) => { if (s >= t) i = k; });
  return STATUSES[i];
}

const srv = {
  orders() { return store.get('srv.orders', {}); },
  save(m) { store.set('srv.orders', m); },
  bonus() { return store.get('bonus', { balance: 120, log: [{ id: uid(), ts: Date.now() - 86400000 * 9, type: 'welcome', amount: 120, text: 'Демо-приветственные бонусы' }] }); },
  saveBonus(b) { store.set('bonus', b); },
  nextNumber() { const n = store.get('srv.num', 100) + 1; store.set('srv.num', n); return 'M-' + n; }
};

function placeOrder(req) {
  // Возвращает Promise: имитация сети. req.idemKey защищает от дублей.
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const all = srv.orders();
      if (all[req.idemKey]) return resolve(all[req.idemKey]); // повтор: тот же заказ, дубль не создаётся
      const q = quote({ cart: req.cart, branchId: req.branchId, promo: req.promo, bonus: req.bonus, balance: srv.bonus().balance, usedPromos: store.get('usedPromos', []) });
      if (!q.hasItems) return reject({ code: 'empty', message: 'В корзине нет доступных позиций' });
      if (q.blocked.length) return reject({ code: 'unavailable', message: 'Часть позиций недоступна. Обновите корзину.' });
      if (req.expectedTotal !== q.total) return reject({ code: 'price_changed', message: 'Сумма изменилась. Проверьте корзину.', total: q.total });
      const b = branchById(req.branchId);
      if (!branchOpen(b) && req.pickup === 'asap') return reject({ code: 'closed', message: 'Точка сейчас закрыта. Выберите время или другую точку.' });
      const order = {
        id: uid(), number: srv.nextNumber(), createdAt: Date.now(), branchId: req.branchId, pickup: req.pickup,
        lines: q.lines.filter(l => l.status === 'ok').map(l => ({ name: l.name, labels: l.labels, qty: l.qty, total: l.total, itemId: l.itemId, size: l.size, mods: l.mods })),
        subtotal: q.subtotal, discount: q.discount, bonusUsed: q.bonusUsed, total: q.total, promo: q.promoApplied ? q.promoApplied.code : null,
        accrual: q.accrual, accrued: false, refunded: false, cancelled: false, idemKey: req.idemKey
      };
      all[req.idemKey] = order; srv.save(all);
      if (order.promo) { const u = store.get('usedPromos', []); if (!u.includes(order.promo)) { u.push(order.promo); store.set('usedPromos', u); } }
      if (order.bonusUsed) { const bn = srv.bonus(); bn.balance -= order.bonusUsed; bn.log.unshift({ id: uid(), ts: Date.now(), type: 'spend', amount: -order.bonusUsed, text: 'Списание за заказ ' + order.number, ref: order.id }); srv.saveBonus(bn); }
      // Демо: имитация потери ответа. Заказ на «сервере» создан, клиент ответа не получил.
      if (req.simulateLostResponse) return reject({ code: 'network', message: 'Не получили подтверждение от сервера' });
      resolve(order);
    }, 700);
  });
}

function cancelOrder(id) {
  const all = srv.orders(); const o = Object.values(all).find(x => x.id === id);
  if (!o) return { ok: false, message: 'Заказ не найден' };
  if (orderStatus(o) !== 'Новый') return { ok: false, message: 'Заказ уже в работе, отменить нельзя. Позвоните на точку.' };
  o.cancelled = true; srv.save(all);
  syncBonus();
  return { ok: true };
}

// Начисления только по подтверждённым покупкам, один раз; возврат бонусов при отмене, один раз
function syncBonus() {
  const all = srv.orders(); const bn = srv.bonus(); let changed = false;
  Object.values(all).forEach(o => {
    const st = orderStatus(o);
    if (st === 'Завершён' && !o.accrued && o.accrual > 0) { o.accrued = true; bn.balance += o.accrual; bn.log.unshift({ id: uid(), ts: Date.now(), type: 'accrual', amount: o.accrual, text: 'Начисление за заказ ' + o.number, ref: o.id }); changed = true; }
    if (st === 'Отменён' && !o.refunded && o.bonusUsed) { o.refunded = true; bn.balance += o.bonusUsed; bn.log.unshift({ id: uid(), ts: Date.now(), type: 'refund', amount: o.bonusUsed, text: 'Возврат за отменённый заказ ' + o.number, ref: o.id }); changed = true; }
    if (st === 'Отменён' && !o.refunded && !o.bonusUsed) { o.refunded = true; changed = true; }
  });
  if (changed) { srv.save(all); srv.saveBonus(bn); }
}
