(function () {
  'use strict';
  var panels = Array.from(document.querySelectorAll('[data-store-panel]'));
  if (!panels.length) return;
  var banks = new Map();
  var active = 'goods';

  function activate(panel) {
    active = panel.dataset.storePanel;
    panels.forEach(function (item) { item.hidden = item !== panel; });
    document.querySelectorAll('[data-store-tab]').forEach(function (link) {
      if (link.dataset.storeTab === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }
  function reveal(target) {
    var panel = target.closest('[data-store-panel]');
    if (panel) activate(panel);
    for (var parent = target; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  }
  function revealProduct(code) {
    for (var state of banks.values()) {
      var index = state.cards.findIndex(function (card) { return card.id === code; });
      if (index < 0) continue;
      state.page = Math.floor(index / 4);
      state.draw(false);
      reveal(state.cards[index]);
      return state.cards[index];
    }
    return null;
  }
  window.revealStoreProduct = revealProduct;
  window.revealStoreSection = function (target) {
    reveal(target);
    // Provider checkout can open from another category. Keep the address in
    // sync so Back and returning to the same product link select that category.
    if (target.id && location.hash !== '#' + target.id) location.hash = target.id;
  };

  function route(scroll) {
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    var target = revealProduct(id) || document.getElementById(id);
    if (target) reveal(target);
    else activate(panels.find(function (p) { return p.dataset.storePanel === active; }) || panels[0]);
    if (scroll && target) requestAnimationFrame(function () {
      target.scrollIntoView({block: 'start', behavior: 'instant'});
    });
  }

  // Four consistent card regions: identity, description, price, actions. Keep
  // the original elements/listeners; checkout and license targets are unchanged.
  function organize(card) {
    var children = Array.from(card.children);
    var header = document.createElement('header');
    var description = document.createElement('div'); description.className = 'product-description';
    var links = document.createElement('div'); links.className = 'product-references';
    var footer = document.createElement('footer'); footer.className = 'product-actions';
    var price = children.find(function (child) { return child.classList.contains('price'); });
    children.forEach(function (child) {
      if (child === price) return;
      if (child.tagName === 'H3') header.appendChild(child);
      else if (child.tagName === 'BUTTON' || child.classList.contains('button')) footer.appendChild(child);
      else if (child.tagName === 'A') links.appendChild(child);
      else description.appendChild(child);
    });
    if (links.children.length) header.appendChild(links);
    card.replaceChildren(header, description);
    if (price) card.appendChild(price);
    card.appendChild(footer);
  }

  document.addEventListener('store:catalogready', function () {
    ['products', 'desktopProducts', 'mirageProducts', 'storyProducts', 'visionProducts',
      'projectProducts', 'subscriptionProducts', 'musicProducts'].forEach(function (id) {
      var box = document.getElementById(id);
      if (!box) return;
      var previous = banks.get(id);
      if (previous) previous.controls.remove();
      var cards = Array.from(box.querySelectorAll(':scope > article'));
      cards.forEach(organize);
      var controls = document.createElement('nav');
      controls.className = 'catalog-pages'; controls.setAttribute('aria-label', '商品分页 · ' + id);
      var back = document.createElement('button'); back.type = 'button'; back.textContent = '上一页';
      var status = document.createElement('span'); status.setAttribute('aria-live', 'polite');
      var next = document.createElement('button'); next.type = 'button'; next.textContent = '下一页';
      controls.append(back, status, next); box.after(controls);
      var state = {cards: cards, controls: controls, page: previous ? previous.page : 0};
      state.draw = function (focus) {
        var count = Math.max(1, Math.ceil(cards.length / 4));
        state.page = Math.min(Math.max(0, state.page), count - 1);
        box.replaceChildren.apply(box, cards.slice(state.page * 4, state.page * 4 + 4));
        controls.hidden = count <= 1;
        back.disabled = state.page === 0; next.disabled = state.page === count - 1;
        status.textContent = (state.page + 1) + ' / ' + count + ' 页 · 共 ' + cards.length + ' 项';
        if (focus && box.firstElementChild) {
          box.firstElementChild.tabIndex = -1; box.firstElementChild.focus();
        }
      };
      back.onclick = function () { state.page--; state.draw(true); };
      next.onclick = function () { state.page++; state.draw(true); };
      banks.set(id, state); state.draw(false);
    });
    route(true);
  });
  window.addEventListener('hashchange', function () { route(true); });
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link) return;
    var url = new URL(link.href, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname && url.hash === location.hash) route(true);
  });
  route(false);
})();
