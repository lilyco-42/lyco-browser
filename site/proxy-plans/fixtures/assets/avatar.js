/* 账户头像：上传 / 预览 / 删除
 * 上传的是原图，服务端会裁成 256×256 的 WebP 再存 —— 这里只做前端校验，
 * 真正的把关（格式、尺寸、重新编码）都在服务端。
 */
(function () {
  var MAX = 4 * 1024 * 1024;
  var box = null, input = null, state = { url: '', name: '' };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function initial(name) {
    return String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
  }

  function paint() {
    if (!box) return;
    var view = box.querySelector('.avatar-view');
    // 先把旧 <img> 摘掉再清空：直接 textContent='' 会让浏览器把已删除的头像
    // 再请求一次，控制台留下一条 404。
    var stale = view.querySelector('img');
    if (stale) { stale.onerror = null; stale.removeAttribute('src'); stale.remove(); }
    view.textContent = '';
    if (state.url) {
      var img = el('img');
      img.src = state.url;
      img.alt = '账户头像';
      img.width = 96; img.height = 96;
      // 换头像时 URL 会变；若旧图还在缓存里，onerror 兜底回退到首字母
      img.onerror = function () { state.url = ''; paint(); };
      view.appendChild(img);
      view.classList.add('has-image');
    } else {
      view.textContent = initial(state.name);
      view.classList.remove('has-image');
    }
    var del = box.querySelector('[data-avatar-delete]');
    if (del) del.hidden = !state.url;
  }

  function say(message, bad) {
    var m = box && box.querySelector('.avatar-msg');
    if (!m) return;
    m.textContent = message || '';
    m.className = 'avatar-msg' + (bad ? ' err' : message ? ' ok' : '');
  }

  async function upload(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      say('只支持 PNG / JPEG / WebP 图片', true);
      return;
    }
    if (file.size > MAX) {
      say('图片不能超过 4MB', true);
      return;
    }
    var btn = box.querySelector('[data-avatar-pick]');
    btn.disabled = true;
    say('正在上传…');
    try {
      // 直接发原始字节：不用 multipart，服务端也就不需要额外依赖
      var res = await fetch(API + '/avatar', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok(), 'Content-Type': file.type },
        body: file,
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.detail || '上传失败（HTTP ' + res.status + '）');
      state.url = data.avatar || '';
      paint();
      say('头像已更新');
    } catch (e) {
      say(e.message || '上传失败', true);
    } finally {
      btn.disabled = false;
      if (input) input.value = '';
    }
  }

  async function remove() {
    var btn = box.querySelector('[data-avatar-delete]');
    btn.disabled = true;
    try {
      var res = await fetch(API + '/avatar', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + tok() },
      });
      if (!res.ok) throw new Error('删除失败（HTTP ' + res.status + '）');
      state.url = '';
      paint();
      say('头像已移除');
    } catch (e) {
      say(e.message || '删除失败', true);
    } finally {
      btn.disabled = false;
    }
  }

  /** store.js 在每次 load() 后调用，把当前账号的昵称和头像画上去 */
  window.renderAvatar = function (account) {
    if (!box || !account) return;
    state.name = account.username || '';
    state.url = account.avatar ? account.avatar : '';
    paint();
  };

  document.addEventListener('DOMContentLoaded', function () {
    box = document.getElementById('avatarBox');
    if (!box) return;
    input = box.querySelector('input[type=file]');
    box.querySelector('[data-avatar-pick]').onclick = function () { input.click(); };
    input.onchange = function () { upload(input.files && input.files[0]); };
    box.querySelector('[data-avatar-delete]').onclick = remove;

    // 支持直接把图片拖进头像框
    var view = box.querySelector('.avatar-view');
    ['dragenter', 'dragover'].forEach(function (t) {
      view.addEventListener(t, function (e) { e.preventDefault(); view.classList.add('drop'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      view.addEventListener(t, function (e) { e.preventDefault(); view.classList.remove('drop'); });
    });
    view.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) upload(f);
    });
  });
})();
