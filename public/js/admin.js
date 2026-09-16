document.addEventListener('DOMContentLoaded', function () {

  var API = '/api';

  function getAdminToken() { return sessionStorage.getItem('allecom_admin_token') || ''; }
  function setAdminToken(t) { sessionStorage.setItem('allecom_admin_token', t); }
  function clearAdminToken() { sessionStorage.removeItem('allecom_admin_token'); }

  async function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() } };
    if (body) opts.body = JSON.stringify(body);
    var r    = await fetch(API + path, opts);
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || 'Erro na requisição.');
    return data;
  }

  /* ══════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════ */
  var loginScreen = document.getElementById('admin-login');
  var panel       = document.getElementById('admin-panel');

  function isLogged() { return !!getAdminToken(); }
  function doLogout() { clearAdminToken(); location.reload(); }

  /* eye toggle */
  var eyeBtn = document.querySelector('.adm-eye');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', function () {
      var inp = document.getElementById('adm-pass');
      var ico = this.querySelector('i');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      ico.className = inp.type === 'password' ? 'ti ti-eye' : 'ti ti-eye-off';
    });
  }

  document.getElementById('admin-login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var u   = document.getElementById('adm-user').value.trim();
    var p   = document.getElementById('adm-pass').value;
    var err = document.getElementById('login-error');

    api('POST', '/auth/admin/login', { user: u, pass: p })
      .then(function (data) { setAdminToken(data.token); showPanel(); })
      .catch(function (ex) { err.textContent = ex.message; setTimeout(function () { err.textContent = ''; }, 3000); });
  });

  document.getElementById('btn-reset-creds').addEventListener('click', function (e) {
    e.preventDefault();
    clearAdminToken();
    document.getElementById('adm-user').value = 'admin';
    document.getElementById('adm-pass').value = '';
    var err = document.getElementById('login-error');
    err.style.color = '#16a34a';
    err.textContent = 'Sessão encerrada. Use: admin / allecom2025';
    setTimeout(function () { err.textContent = ''; err.style.color = '#ef4444'; }, 4000);
  });

  if (isLogged()) showPanel();

  /* ══════════════════════════════════════════════
     PAINEL
  ══════════════════════════════════════════════ */
  function showPanel() {
    loginScreen.style.display = 'none';
    panel.style.display       = 'flex';
    initPanel();
  }

  var _panelInit = false;
  function initPanel() {
    if (_panelInit) return;
    _panelInit = true;

    document.getElementById('btn-logout').addEventListener('click', doLogout);
    document.getElementById('menu-toggle').addEventListener('click', function () { document.getElementById('sidebar').classList.toggle('open'); });

    document.querySelectorAll('.adm-nav-item[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.adm-nav-item').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.adm-section').forEach(function (s) { s.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('sec-' + btn.dataset.section).classList.add('active');
        document.getElementById('topbar-title').textContent = btn.querySelector('span').textContent.trim();
        renderSection(btn.dataset.section);
      });
    });

    document.getElementById('busca-clientes').addEventListener('input', function () { renderClientes(this.value); });
    document.getElementById('busca-pedidos').addEventListener('input', function () { renderPedidos(this.value, document.getElementById('filtro-status').value); });
    document.getElementById('filtro-status').addEventListener('change', function () { renderPedidos(document.getElementById('busca-pedidos').value, this.value); });
    document.getElementById('busca-produtos').addEventListener('input', function () { renderProdutos(this.value); });

    initFormsConfig();
    initMercadoLivreConfig();
    initProdutoModal();
    initConfirmarModal();
    initAnuncios();

    renderSection('dashboard');
  }

  function renderSection(sec) {
    if (sec === 'dashboard') renderDashboard();
    if (sec === 'clientes')  renderClientes();
    if (sec === 'pedidos')   renderPedidos();
    if (sec === 'produtos')  renderProdutos();
    if (sec === 'anuncios')  renderAnuncios();
  }

  /* ══════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════ */
  function renderDashboard() {
    Promise.all([
      api('GET', '/clientes'),
      api('GET', '/pedidos'),
      api('GET', '/produtos')
    ]).then(function (res) {
      var clientes = res[0], pedidos = res[1], produtos = res[2];
      var fat = pedidos.filter(function (p) { return p.status !== 'Cancelado'; }).reduce(function (s, p) { return s + p.total; }, 0);

      document.getElementById('dash-clientes').textContent    = clientes.length;
      document.getElementById('dash-pedidos').textContent     = pedidos.length;
      document.getElementById('dash-faturamento').textContent = 'R$ ' + fat.toFixed(2).replace('.', ',');
      document.getElementById('dash-produtos').textContent    = produtos.filter(function (p) { return p.status === 'ativo'; }).length;

      /* ── Últimos Pedidos ─────────────────────── */
      var statusColor = { 'aguardando':'#f59e0b','confirmado':'#3b82f6','enviado':'#8b5cf6','entregue':'#10b981','cancelado':'#ef4444' };
      var statusIcon  = { 'aguardando':'ti-clock','confirmado':'ti-circle-check','enviado':'ti-truck','entregue':'ti-package','cancelado':'ti-x' };
      var ul = document.getElementById('dash-ultimos-pedidos');
      if (ul) ul.innerHTML = pedidos.length === 0
        ? '<div class="db-list-empty"><i class="ti ti-shopping-bag"></i><span>Nenhum pedido ainda.</span></div>'
        : pedidos.slice(-6).reverse().map(function (p) {
            var st  = (p.status || '').toLowerCase();
            var cor = statusColor[st] || '#94a3b8';
            var ico = statusIcon[st]  || 'ti-circle';
            var val = 'R$ ' + Number(p.total || 0).toFixed(2).replace('.', ',');
            return '<div class="db-list-item">' +
              '<div class="db-list-avatar" style="background:' + cor + '22;color:' + cor + '"><i class="ti ' + ico + '"></i></div>' +
              '<div class="db-list-body">' +
                '<div class="db-list-title">' + p.cliente + '</div>' +
                '<div class="db-list-sub">' + p.id + ' · ' + (p.data || '') + '</div>' +
              '</div>' +
              '<div class="db-list-right">' +
                '<div class="db-list-value">' + val + '</div>' +
                '<span class="db-list-badge" style="background:' + cor + '22;color:' + cor + '">' + (p.status||'–') + '</span>' +
              '</div>' +
            '</div>';
          }).join('');

      /* ── Últimos Clientes ────────────────────── */
      var avatarColors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
      var uc = document.getElementById('dash-ultimos-clientes');
      if (uc) uc.innerHTML = clientes.length === 0
        ? '<div class="db-list-empty"><i class="ti ti-users"></i><span>Nenhum cliente cadastrado.</span></div>'
        : clientes.slice(-6).reverse().map(function (c, i) {
            var inicial = (c.nome || '?')[0].toUpperCase();
            var cor     = avatarColors[i % avatarColors.length];
            var dataCad = c.criadoEm ? new Date(c.criadoEm).toLocaleDateString('pt-BR') : '–';
            var pedsCli = pedidos.filter(function(p){ return p.email === c.email; }).length;
            return '<div class="db-list-item">' +
              '<div class="db-list-avatar db-list-avatar--letter" style="background:' + cor + '">' + inicial + '</div>' +
              '<div class="db-list-body">' +
                '<div class="db-list-title">' + c.nome + '</div>' +
                '<div class="db-list-sub">' + c.email + '</div>' +
              '</div>' +
              '<div class="db-list-right">' +
                '<div class="db-list-value">' + pedsCli + ' pedido' + (pedsCli !== 1 ? 's' : '') + '</div>' +
                '<div class="db-list-sub">' + dataCad + '</div>' +
              '</div>' +
            '</div>';
          }).join('');

      /* ── Mais Vendidos (real, calculado dos pedidos) ── */
      var contagem = {};
      pedidos.forEach(function (p) {
        if (!p.produtos) return;
        var nome = typeof p.produtos === 'string' ? p.produtos : (p.produtos[0] && p.produtos[0].nome) || 'Produto';
        contagem[nome] = (contagem[nome] || 0) + 1;
      });
      var topArr = Object.keys(contagem).map(function(k){ return { nome: k, qtd: contagem[k] }; })
        .sort(function(a, b){ return b.qtd - a.qtd; }).slice(0, 6);
      var maxQtd = topArr.length ? topArr[0].qtd : 1;

      var tp = document.getElementById('top-produtos');
      if (tp) tp.innerHTML = topArr.length === 0
        ? '<div class="db-list-empty"><i class="ti ti-star"></i><span>Nenhuma venda registrada.</span></div>'
        : topArr.map(function (t, i) {
            var cores = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4'];
            var cor   = cores[i % cores.length];
            var pct   = Math.round((t.qtd / maxQtd) * 100);
            return '<div class="db-list-item db-list-item--rank">' +
              '<div class="db-rank-num" style="color:' + cor + '">#' + (i+1) + '</div>' +
              '<div class="db-list-body">' +
                '<div class="db-list-title">' + t.nome + '</div>' +
                '<div class="db-bar-wrap"><div class="db-bar-fill" style="width:' + pct + '%;background:' + cor + '"></div></div>' +
              '</div>' +
              '<div class="db-list-right">' +
                '<div class="db-list-value">' + t.qtd + ' vd.</div>' +
              '</div>' +
            '</div>';
          }).join('');
    }).catch(function (err) { console.error('Dashboard:', err.message); });
  }

  /* ══════════════════════════════════════════════
     CLIENTES
  ══════════════════════════════════════════════ */
  function renderClientes(filtro) {
    var url = '/clientes' + (filtro ? '?q=' + encodeURIComponent(filtro) : '');
    api('GET', url).then(function (clientes) {
      var tbody = document.getElementById('tbody-clientes');
      var vazio = document.getElementById('clientes-vazio');
      if (clientes.length === 0) { tbody.innerHTML = ''; vazio.style.display = 'block'; return; }
      vazio.style.display = 'none';
      tbody.innerHTML = clientes.map(function (c, i) {
        return '<tr><td>' + (i+1) + '</td><td><strong>' + c.nome + '</strong></td><td>' + c.email + '</td>' +
          '<td>' + (c.cpf||'—') + '</td><td>' + (c.telefone||'—') + '</td>' +
          '<td><span class="adm-badge ' + (c.newsletter ? 'adm-badge--green':'') + '">' + (c.newsletter?'Sim':'Não') + '</span></td>' +
          '<td>' + new Date(c.criadoEm).toLocaleDateString('pt-BR') + '</td>' +
          '<td><button class="adm-btn-icon adm-btn-icon--red" data-del="' + c.id + '" title="Excluir"><i class="ti ti-trash"></i></button></td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.del;
          confirmar(function () { api('DELETE', '/clientes/' + id).then(function () { renderClientes(filtro); renderDashboard(); }).catch(alert); });
        });
      });
    }).catch(function (err) { console.error('Clientes:', err.message); });
  }

  /* ══════════════════════════════════════════════
     PEDIDOS
  ══════════════════════════════════════════════ */
  var STATUS_LIST = ['Aguardando','Confirmado','Enviado','Entregue','Cancelado'];

  function renderPedidos(filtro, statusFiltro) {
    var url = '/pedidos?x=1' + (filtro ? '&q=' + encodeURIComponent(filtro) : '') + (statusFiltro ? '&status=' + encodeURIComponent(statusFiltro) : '');
    api('GET', url).then(function (pedidos) {
      var tbody = document.getElementById('tbody-pedidos');
      var vazio = document.getElementById('pedidos-vazio');
      if (pedidos.length === 0) { tbody.innerHTML = ''; vazio.style.display = 'block'; return; }
      vazio.style.display = 'none';
      tbody.innerHTML = pedidos.map(function (p) {
        var opts = STATUS_LIST.map(function (s) { return '<option value="'+s+'"'+(s===p.status?' selected':'')+'>'+s+'</option>'; }).join('');
        return '<tr><td><strong>' + p.id + '</strong></td>' +
          '<td>' + p.cliente + '<br><small>' + p.email + '</small></td>' +
          '<td>' + p.produtos + '</td>' +
          '<td><strong>R$ ' + p.total.toFixed(2).replace('.',',') + '</strong></td>' +
          '<td>' + new Date(p.data).toLocaleDateString('pt-BR') + '</td>' +
          '<td><select class="adm-status-select status-' + p.status.toLowerCase() + '" data-pid="' + p.id + '">' + opts + '</select></td>' +
          '<td>' +
            '<a class="adm-btn-icon" href="https://wa.me/5548999990000?text=Pedido+' + p.id + '" target="_blank" title="WhatsApp"><i class="ti ti-brand-whatsapp"></i></a>' +
            '<button class="adm-btn-icon adm-btn-icon--red" data-del-ped="' + p.id + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
          '</td></tr>';
      }).join('');
      tbody.querySelectorAll('.adm-status-select').forEach(function (sel) {
        sel.addEventListener('change', function () {
          api('PUT', '/pedidos/' + sel.dataset.pid + '/status', { status: sel.value })
            .then(function () { sel.className = 'adm-status-select status-' + sel.value.toLowerCase(); })
            .catch(alert);
        });
      });
      tbody.querySelectorAll('[data-del-ped]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = btn.dataset.delPed;
          confirmar(function () { api('DELETE', '/pedidos/' + pid).then(function () { renderPedidos(filtro, statusFiltro); renderDashboard(); }).catch(alert); });
        });
      });
    }).catch(function (err) { console.error('Pedidos:', err.message); });
  }

  /* ══════════════════════════════════════════════
     PRODUTOS
  ══════════════════════════════════════════════ */
  function renderProdutos(filtro) {
    var url = '/produtos' + (filtro ? '?q=' + encodeURIComponent(filtro) : '');
    api('GET', url).then(function (produtos) {
      var tbody = document.getElementById('tbody-produtos');
      tbody.innerHTML = produtos.map(function (p) {
        var pf = p.desconto > 0 ? p.preco * (1 - p.desconto/100) : p.preco;
        return '<tr><td>' + p.id + '</td>' +
          '<td><strong>' + p.nome + '</strong><br><small>' + p.marca + '</small></td>' +
          '<td>' + p.categoria + '</td>' +
          '<td>R$ ' + pf.toFixed(2).replace('.',',') + '</td>' +
          '<td>' + (p.desconto > 0 ? '<span class="adm-badge adm-badge--red">-'+p.desconto+'%</span>' : '—') + '</td>' +
          '<td>' + (p.estoque <= 3 ? '<span style="color:#ef4444;font-weight:700">'+p.estoque+'</span>' : p.estoque) + '</td>' +
          '<td><span class="adm-badge ' + (p.status==='ativo'?'adm-badge--green':'adm-badge--gray') + '">' + p.status + '</span></td>' +
          '<td>' +
            '<button class="adm-btn-icon" data-edit="' + p.id + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
            '<button class="adm-btn-icon adm-btn-icon--red" data-del="' + p.id + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
          '</td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          api('GET', '/produtos/' + btn.dataset.edit).then(function (p) { abrirModalProduto(p); }).catch(alert);
        });
      });
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.del;
          confirmar(function () { api('DELETE', '/produtos/' + id).then(function () { renderProdutos(filtro); renderDashboard(); }).catch(alert); });
        });
      });
    }).catch(function (err) { console.error('Produtos:', err.message); });
  }

  /* ══════════════════════════════════════════════
     MODAL PRODUTO
  ══════════════════════════════════════════════ */
  function initProdutoModal() {
    document.getElementById('btn-novo-produto').addEventListener('click', function () { abrirModalProduto(null); });
    document.getElementById('btn-fechar-produto').addEventListener('click', fecharModalProduto);
    document.getElementById('btn-cancelar-produto').addEventListener('click', fecharModalProduto);
    document.getElementById('form-produto').addEventListener('submit', function (e) {
      e.preventDefault();
      var f   = this;
      var id  = f.id.value;
      var obj = { nome: f.nome.value.trim(), categoria: f.categoria.value, marca: f.marca.value.trim(),
        preco: parseFloat(f.preco.value), desconto: parseInt(f.desconto.value)||0,
        estoque: parseInt(f.estoque.value)||0, status: f.status.value, descricao: f.descricao.value.trim() };
      var req = id ? api('PUT', '/produtos/' + id, obj) : api('POST', '/produtos', obj);
      req.then(function () { fecharModalProduto(); renderProdutos(); renderDashboard(); }).catch(alert);
    });
  }

  function abrirModalProduto(p) {
    var f = document.getElementById('form-produto');
    f.reset();
    document.getElementById('modal-produto-title').textContent = p ? 'Editar Produto' : 'Novo Produto';
    if (p) {
      f.id.value = p.id; f.nome.value = p.nome; f.categoria.value = p.categoria;
      f.marca.value = p.marca; f.preco.value = p.preco; f.desconto.value = p.desconto;
      f.estoque.value = p.estoque; f.status.value = p.status; f.descricao.value = p.descricao||'';
    }
    document.getElementById('modal-produto').style.display = 'flex';
  }
  function fecharModalProduto() { document.getElementById('modal-produto').style.display = 'none'; }

  /* ══════════════════════════════════════════════
     MODAL CONFIRMAR
  ══════════════════════════════════════════════ */
  var _cb = null;
  function initConfirmarModal() {
    document.getElementById('btn-cancel-del').addEventListener('click', function () { document.getElementById('modal-confirmar').style.display = 'none'; });
    document.getElementById('btn-confirm-del').addEventListener('click', function () { document.getElementById('modal-confirmar').style.display = 'none'; if (_cb) _cb(); });
  }
  function confirmar(cb) { _cb = cb; document.getElementById('modal-confirmar').style.display = 'flex'; }

  /* ══════════════════════════════════════════════
     ANÚNCIOS
  ══════════════════════════════════════════════ */
  var _anuncioFotos  = [];
  var _anuncioEditId = null;

  var AN_FIELDS = ['titulo','categoria','status','marca','linha','modelo','modelo-alfa',
    'preco','desconto','estoque','fabricante','descricao','formato','carga-horaria','nivel',
    'certificado','kiwify-checkout-url'];

  function anGet(id) { return document.getElementById('an-' + id); }
  function anVal(id)  { var el = anGet(id); return el ? el.value : ''; }

  function initAnuncios() {
    document.getElementById('btn-novo-anuncio').addEventListener('click', function () { abrirEditorAnuncio(null); });
    document.getElementById('btn-voltar-anuncios').addEventListener('click', fecharEditorAnuncio);
    document.getElementById('btn-salvar-anuncio').addEventListener('click', salvarAnuncio);
    document.getElementById('busca-anuncios').addEventListener('input', function () { renderAnuncios(this.value); });

    var fileInput = document.getElementById('anuncio-file-input');
    document.getElementById('btn-upload-foto').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = Array.from(this.files);
      var uploads = files.map(function (file) {
        var fd = new FormData(); fd.append('foto', file);
        return fetch(API + '/anuncios/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getAdminToken() }, body: fd })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d.url) { _anuncioFotos.push(d.url); } });
      });
      Promise.all(uploads).then(function () { renderFotos(); atualizarPrevia(); });
      this.value = '';
    });

    document.getElementById('btn-add-foto-url').addEventListener('click', function () {
      var url = document.getElementById('anuncio-url-input').value.trim();
      if (!url) return;
      _anuncioFotos.push(url);
      document.getElementById('anuncio-url-input').value = '';
      renderFotos(); atualizarPrevia();
    });
    document.getElementById('anuncio-url-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-foto-url').click(); } });

    ['an-titulo','an-marca','an-preco','an-desconto','an-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener('input', atualizarPrevia); el.addEventListener('change', atualizarPrevia); }
    });
  }

  function abrirEditorAnuncio(anuncio) {
    _anuncioFotos  = anuncio ? (anuncio.fotos || []).slice() : [];
    _anuncioEditId = anuncio ? anuncio.id : null;
    AN_FIELDS.forEach(function (f) { var el = anGet(f); if (!el) return; if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; });
    if (anuncio) {
      AN_FIELDS.forEach(function (f) {
        var key = f.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
        var el  = anGet(f); if (!el) return;
        el.value = anuncio[key] !== undefined ? anuncio[key] : (anuncio[f] !== undefined ? anuncio[f] : '');
      });
    }
    document.getElementById('editor-anuncio-titulo').textContent = anuncio ? 'Editar Anúncio' : 'Novo Anúncio';
    document.getElementById('anuncio-save-msg').textContent = '';
    renderFotos(); atualizarPrevia();
    document.getElementById('anuncios-list-view').style.display   = 'none';
    document.getElementById('anuncios-editor-view').style.display = 'block';
  }

  function fecharEditorAnuncio() {
    document.getElementById('anuncios-editor-view').style.display = 'none';
    document.getElementById('anuncios-list-view').style.display   = 'block';
    renderAnuncios();
  }

  function salvarAnuncio() {
    var titulo = anVal('titulo').trim();
    var msg    = document.getElementById('anuncio-save-msg');
    if (!titulo) { msg.textContent = 'Informe o título do anúncio.'; msg.style.color = '#ef4444'; return; }

    var obj = { fotos: _anuncioFotos.slice() };
    AN_FIELDS.forEach(function (f) {
      var key = f.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      obj[key] = anVal(f);
    });

    var req = _anuncioEditId
      ? api('PUT',  '/anuncios/' + _anuncioEditId, obj)
      : api('POST', '/anuncios', obj);

    req.then(function (saved) {
      _anuncioEditId = saved.id;
      document.getElementById('editor-anuncio-titulo').textContent = 'Editar Anúncio';
      msg.textContent = '✓ Anúncio salvo!'; msg.style.color = '#16a34a';
      setTimeout(function () { msg.textContent = ''; }, 2500);
    }).catch(function (err) { msg.textContent = err.message; msg.style.color = '#ef4444'; });
  }

  function renderFotos() {
    var grid = document.getElementById('anuncio-fotos-grid');
    if (_anuncioFotos.length === 0) { grid.innerHTML = '<div class="anuncio-fotos-empty"><i class="ti ti-photo-off"></i> Nenhuma foto adicionada ainda</div>'; return; }
    grid.innerHTML = _anuncioFotos.map(function (src, i) {
      return '<div class="anuncio-foto-thumb"><img src="' + src + '" alt="foto ' + (i+1) + '">' +
        (i === 0 ? '<div class="foto-capa-label">Capa</div>' : '') +
        '<button class="anuncio-foto-del" data-fi="' + i + '" title="Remover">×</button></div>';
    }).join('');
    grid.querySelectorAll('.anuncio-foto-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _anuncioFotos.splice(+btn.dataset.fi, 1); renderFotos(); atualizarPrevia(); });
    });
  }

  function atualizarPrevia() {
    var titulo = anVal('titulo') || 'Nome do produto';
    var marca  = anVal('marca')  || 'Marca';
    var preco  = parseFloat(anVal('preco')) || 0;
    var desc   = parseInt(anVal('desconto')) || 0;
    var status = anVal('status');
    var precoFinal = desc > 0 ? preco * (1 - desc / 100) : preco;

    document.getElementById('prev-nome').textContent  = titulo;
    document.getElementById('prev-marca').textContent = marca;
    document.getElementById('prev-preco').textContent = 'R$ ' + precoFinal.toFixed(2).replace('.', ',');

    var descEl = document.getElementById('prev-desc');
    if (desc > 0 && preco > 0) { descEl.textContent = 'R$ ' + preco.toFixed(2).replace('.', ','); descEl.style.display = ''; }
    else { descEl.style.display = 'none'; }

    var statusEl = document.getElementById('prev-status');
    var statusMap = { ativo: { label:'Ativo', color:'#15803d', bg:'#dcfce7' }, destaque: { label:'⭐ Destaque', color:'#b45309', bg:'#fef3c7' }, inativo: { label:'Inativo', color:'#6b7280', bg:'#f3f4f6' } };
    var s = statusMap[status] || statusMap['ativo'];
    statusEl.textContent = s.label;
    statusEl.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:' + s.bg + ';color:' + s.color;

    var imgWrap = document.getElementById('prev-img');
    imgWrap.innerHTML = _anuncioFotos.length > 0
      ? '<img src="' + _anuncioFotos[0] + '" style="width:100%;height:100%;object-fit:cover;display:block">'
      : '<i class="ti ti-photo" style="font-size:40px;color:#ccc"></i>';
  }

  function renderAnuncios(filtro) {
    var url = '/anuncios' + (filtro ? '?q=' + encodeURIComponent(filtro) : '');
    api('GET', url).then(function (anuncios) {
      var grid  = document.getElementById('anuncios-grid');
      var vazio = document.getElementById('anuncios-vazio');
      if (anuncios.length === 0) { grid.innerHTML = ''; vazio.style.display = 'block'; return; }
      vazio.style.display = 'none';
      grid.innerHTML = anuncios.map(function (a) {
        var preco = parseFloat(a.preco) || 0, desc = parseInt(a.desconto) || 0;
        var pf    = desc > 0 ? preco * (1 - desc / 100) : preco;
        var statusMap = { ativo:'st-ativo', inativo:'st-inativo', destaque:'st-destaque' };
        var imgHtml = a.fotos && a.fotos.length > 0
          ? '<img class="anuncio-card-img" src="' + a.fotos[0] + '" alt="">'
          : '<div class="anuncio-card-img-placeholder"><i class="ti ti-photo"></i></div>';
        return '<div class="anuncio-card" data-id="' + a.id + '">' + imgHtml +
          '<div class="anuncio-card-body">' +
            '<div class="anuncio-card-marca">' + (a.marca || '') + '</div>' +
            '<div class="anuncio-card-nome">' + a.titulo + '</div>' +
            '<div><span class="anuncio-card-preco">R$ ' + pf.toFixed(2).replace('.', ',') + '</span>' +
            (desc > 0 ? '<span class="anuncio-card-desc">R$ ' + preco.toFixed(2).replace('.', ',') + '</span>' : '') + '</div>' +
          '</div>' +
          '<div class="anuncio-card-footer">' +
            '<span class="anuncio-card-status ' + (statusMap[a.status] || 'st-ativo') + '">' + (a.status || 'ativo') + '</span>' +
            '<div class="anuncio-card-actions">' +
              '<button class="adm-btn-icon" data-edit-an="' + a.id + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
              '<button class="adm-btn-icon adm-btn-icon--red" data-del-an="' + a.id + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
            '</div>' +
          '</div></div>';
      }).join('');

      grid.querySelectorAll('[data-edit-an]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          api('GET', '/anuncios/' + btn.dataset.editAn).then(function (a) { abrirEditorAnuncio(a); }).catch(alert);
        });
      });
      grid.querySelectorAll('[data-del-an]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.dataset.delAn;
          confirmar(function () { api('DELETE', '/anuncios/' + id).then(function () { renderAnuncios(filtro); }).catch(alert); });
        });
      });
      grid.querySelectorAll('.anuncio-card').forEach(function (card) {
        card.addEventListener('click', function () {
          api('GET', '/anuncios/' + card.dataset.id).then(function (a) { abrirEditorAnuncio(a); }).catch(alert);
        });
      });
    }).catch(function (err) { console.error('Anúncios:', err.message); });
  }

  /* ══════════════════════════════════════════════
     IMPORTAR DO MERCADO LIVRE
  ══════════════════════════════════════════════ */
  var _mlOffset = 0;
  var _mlQuery  = '';

  function abrirModalImportarML() {
    document.getElementById('modal-importar-ml').style.display = 'flex';
    _mlOffset = 0;
    _mlQuery  = '';
    document.getElementById('ml-busca-input').value = '';
    buscarItensML();
  }

  function fecharModalImportarML() {
    document.getElementById('modal-importar-ml').style.display = 'none';
  }

  function buscarItensML() {
    var lista = document.getElementById('ml-itens-lista');
    var vazio = document.getElementById('ml-itens-vazio');
    var erro  = document.getElementById('ml-itens-erro');
    var pag   = document.getElementById('ml-paginacao');
    lista.innerHTML = '<p style="text-align:center;color:#999;padding:24px"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Carregando...</p>';
    vazio.style.display = 'none';
    erro.style.display  = 'none';
    pag.innerHTML       = '';

    var url = '/ml/meus-anuncios?offset=' + _mlOffset;
    if (_mlQuery) url += '&q=' + encodeURIComponent(_mlQuery);

    api('GET', url).then(function (data) {
      var itens = data.itens || [];
      lista.innerHTML = '';
      if (itens.length === 0) { vazio.style.display = 'block'; return; }

      itens.forEach(function (item) {
        var div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff';
        var imgSrc = item.fotos && item.fotos[0] ? item.fotos[0] : '';
        div.innerHTML =
          (imgSrc ? '<img src="' + imgSrc + '" style="width:60px;height:60px;object-fit:contain;border-radius:6px;flex-shrink:0" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#f3f4f6;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><i class="ti ti-photo" style="color:#9ca3af"></i></div>') +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + item.titulo + '</div>' +
            '<div style="color:#6b7280;font-size:12px;margin-top:2px">R$ ' + (parseFloat(item.preco) || 0).toFixed(2).replace('.', ',') + ' &bull; Estoque: ' + (item.estoque || 0) + '</div>' +
            '<div style="color:#9ca3af;font-size:11px">' + item.id + '</div>' +
          '</div>' +
          '<button class="adm-btn adm-btn--primary" style="flex-shrink:0;font-size:12px" data-ml-importar="' + item.id + '"><i class="ti ti-download"></i> Importar</button>';
        lista.appendChild(div);
      });

      /* paginação */
      var total = data.total || 0;
      if (total > 20) {
        if (_mlOffset > 0) {
          var prev = document.createElement('button');
          prev.className = 'adm-btn'; prev.textContent = '← Anterior';
          prev.addEventListener('click', function () { _mlOffset = Math.max(0, _mlOffset - 20); buscarItensML(); });
          pag.appendChild(prev);
        }
        if (_mlOffset + 20 < total) {
          var next = document.createElement('button');
          next.className = 'adm-btn'; next.textContent = 'Próximo →';
          next.addEventListener('click', function () { _mlOffset += 20; buscarItensML(); });
          pag.appendChild(next);
        }
      }

      /* botões importar */
      lista.querySelectorAll('[data-ml-importar]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var mlId = btn.dataset.mlImportar;
          btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Importando...';
          api('POST', '/ml/importar', { mlId: mlId })
            .then(function () {
              btn.innerHTML = '<i class="ti ti-check"></i> Importado!';
              btn.style.background = '#16a34a';
              renderAnuncios();
            })
            .catch(function (err) {
              btn.disabled = false; btn.innerHTML = '<i class="ti ti-download"></i> Importar';
              alert('Erro: ' + err.message);
            });
        });
      });
    }).catch(function (err) {
      lista.innerHTML = '';
      erro.textContent = err.message || 'Erro ao buscar anúncios do Mercado Livre. Verifique se a conta está conectada.';
      erro.style.display = 'block';
    });
  }

  document.getElementById('btn-importar-ml').addEventListener('click', abrirModalImportarML);
  document.getElementById('btn-fechar-importar-ml').addEventListener('click', fecharModalImportarML);
  document.getElementById('modal-importar-ml').addEventListener('click', function (e) {
    if (e.target === this) fecharModalImportarML();
  });
  document.getElementById('btn-ml-buscar').addEventListener('click', function () {
    _mlQuery  = document.getElementById('ml-busca-input').value.trim();
    _mlOffset = 0;
    buscarItensML();
  });
  document.getElementById('ml-busca-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { _mlQuery = this.value.trim(); _mlOffset = 0; buscarItensML(); }
  });

  /* ══════════════════════════════════════════════
     CONFIGURAÇÕES
  ══════════════════════════════════════════════ */
  function initMercadoLivreConfig() {
    var dot        = document.getElementById('ml-status-dot');
    var txt        = document.getElementById('ml-status-txt');
    var btnConectar    = document.getElementById('btn-ml-conectar');
    var btnDesconectar = document.getElementById('btn-ml-desconectar');

    function verificarStatusML() {
      api('GET', '/ml/status').then(function (data) {
        if (data.conectado) {
          dot.style.background = '#16a34a';
          txt.textContent = 'Conectado como: ' + data.usuario;
          txt.style.color = '#16a34a';
          btnConectar.style.display    = 'none';
          btnDesconectar.style.display = 'block';
        } else {
          dot.style.background = '#ef4444';
          txt.textContent = 'Não conectado';
          txt.style.color = '#6b7280';
          btnConectar.style.display    = 'block';
          btnDesconectar.style.display = 'none';
        }
      }).catch(function () {
        dot.style.background = '#f59e0b';
        txt.textContent = 'Erro ao verificar conexão';
      });
    }

    btnConectar.addEventListener('click', function () {
      api('GET', '/ml/auth-url').then(function (data) {
        window.open(data.url, '_blank', 'width=700,height=600');
        showMsg('msg-ml', 'Autorize no Mercado Livre e volte aqui.', '#2563eb');
        /* verifica a cada 3s se o token chegou */
        var check = setInterval(function () {
          api('GET', '/ml/status').then(function (s) {
            if (s.conectado) { clearInterval(check); verificarStatusML(); showMsg('msg-ml', '✓ Conta conectada!', '#16a34a'); }
          }).catch(function () {});
        }, 3000);
        setTimeout(function () { clearInterval(check); }, 120000);
      }).catch(function (err) { showMsg('msg-ml', err.message, '#ef4444'); });
    });

    btnDesconectar.addEventListener('click', function () {
      if (!confirm('Desconectar a conta do Mercado Livre?')) return;
      api('DELETE', '/ml/desconectar').then(function () { verificarStatusML(); showMsg('msg-ml', 'Conta desconectada.', '#6b7280'); }).catch(function (err) { showMsg('msg-ml', err.message, '#ef4444'); });
    });

    verificarStatusML();
  }

  function initFormsConfig() {
    /* carrega config atual */
    api('GET', '/config').then(function (cfg) {
      ['nomeLoja','cnpj','emailContato','telefone','whatsapp','endereco','freteGratis'].forEach(function (k) {
        var el = document.getElementById('cfg-' + k) || document.querySelector('[name="' + k + '"]');
        if (el && cfg[k] !== undefined) el.value = cfg[k];
      });
    }).catch(function () {});

    document.getElementById('form-loja').addEventListener('submit', function (e) {
      e.preventDefault();
      api('PUT', '/config', {
        nomeLoja: this.nomeLoja.value, cnpj: this.cnpj.value,
        emailContato: this.emailContato.value, telefone: this.telefone.value,
        whatsapp: this.whatsapp.value, endereco: this.endereco.value, freteGratis: this.freteGratis.value
      }).then(function () { showMsg('msg-loja', '✓ Dados salvos!', '#16a34a'); }).catch(function (err) { showMsg('msg-loja', err.message, '#ef4444'); });
    });

    document.getElementById('form-senha').addEventListener('submit', function (e) {
      e.preventDefault();
      if (this.novaSenha.value.length < 6) { showMsg('msg-senha', 'Nova senha: mínimo 6 caracteres.', '#ef4444'); return; }
      if (this.novaSenha.value !== this.novaSenha2.value) { showMsg('msg-senha', 'As senhas não coincidem.', '#ef4444'); return; }
      api('PUT', '/auth/admin/credenciais', { senhaAtual: this.senhaAtual.value, novoUser: this.adminUser.value.trim(), novaSenha: this.novaSenha.value })
        .then(function () { showMsg('msg-senha', '✓ Credenciais atualizadas!', '#16a34a'); document.getElementById('form-senha').reset(); })
        .catch(function (err) { showMsg('msg-senha', err.message, '#ef4444'); });
    });
  }

  function showMsg(id, text, color) {
    var el = document.getElementById(id);
    el.textContent = text; el.style.color = color;
    setTimeout(function () { el.textContent = ''; }, 3500);
  }

});

/* ── CRM ─────────────────────────────────────────── */
(function () {
  var CRM_KEY  = 'crm_leads'; // mantido só para a migração única abaixo
  var CHAM_KEY = 'crm_chamados';
  var CAMP_KEY = 'crm_campanhas';

  function getAdminToken() { return sessionStorage.getItem('allecom_admin_token') || ''; }

  var _leadsCache = [];

  function fetchLeads() {
    return fetch('/api/leads', { headers: { Authorization: 'Bearer ' + getAdminToken() } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (leads) { _leadsCache = leads || []; return _leadsCache; })
      .catch(function () { return _leadsCache; });
  }
  function getLeads() { return _leadsCache; } // usa o cache já carregado por fetchLeads()
  function getChamados() { try { return JSON.parse(localStorage.getItem(CHAM_KEY) || '[]'); } catch(e){ return []; } }
  function saveChamados(d) { localStorage.setItem(CHAM_KEY, JSON.stringify(d)); }

  /* migra leads antigos do localStorage (de antes da integração Kiwify) para o servidor, uma única vez */
  function migrarLeadsAntigos() {
    if (localStorage.getItem('crm_leads_migrado')) return Promise.resolve();
    var antigos = [];
    try { antigos = JSON.parse(localStorage.getItem(CRM_KEY) || '[]'); } catch (e) {}
    if (!antigos.length) { localStorage.setItem('crm_leads_migrado', '1'); return Promise.resolve(); }
    var chain = Promise.resolve();
    antigos.forEach(function (l) {
      chain = chain.then(function () {
        return fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminToken() },
          body: JSON.stringify(l)
        }).catch(function () {});
      });
    });
    return chain.then(function () {
      localStorage.setItem('crm_leads_migrado', '1');
      localStorage.removeItem(CRM_KEY);
    });
  }

  var stages = ['contato','proposta','negociacao','fechado','perdido'];

  function renderKanban() {
    migrarLeadsAntigos().then(fetchLeads).then(function (leads) {
      stages.forEach(function(s) {
        var col = document.getElementById('col-' + s);
        var cnt = document.getElementById('count-' + s);
        if (!col) return;
        var filtro = leads.filter(function(l){ return l.stage === s; });
        cnt.textContent = filtro.length;
        col.innerHTML = '';
        filtro.forEach(function(l) {
          var c = document.createElement('div');
          c.className = 'crm-card';
          c.innerHTML = '<div class="crm-card-nome">' + l.nome + (l.origem === 'kiwify' ? ' <i class="ti ti-shopping-bag-check" title="Importado da Kiwify" style="color:#7b3fe4"></i>' : '') + '</div>' +
            (l.produto ? '<div class="crm-card-produto">' + l.produto + '</div>' : '') +
            (l.valor   ? '<div class="crm-card-valor">R$ ' + parseFloat(l.valor).toFixed(2).replace('.',',') + '</div>' : '');
          c.onclick = function(){ editarLead(l.id); };
          col.appendChild(c);
        });
      });
    });
  }

  function renderChamados(filtro) {
    var list = getChamados();
    if (filtro) {
      var q = filtro.toLowerCase();
      list = list.filter(function(c){ return (c.cliente + c.assunto).toLowerCase().indexOf(q) !== -1; });
    }
    var tbody = document.getElementById('tbody-chamados');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">Nenhum chamado registrado.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(c) {
      var label = { aberto:'Aberto', andamento:'Em andamento', resolvido:'Resolvido' }[c.status] || c.status;
      return '<tr>' +
        '<td>#' + c.id + '</td>' +
        '<td>' + c.cliente + '</td>' +
        '<td>' + c.assunto + '</td>' +
        '<td><span class="crm-badge-status ' + c.status + '">' + label + '</span></td>' +
        '<td>' + c.data + '</td>' +
        '<td><button class="adm-btn" style="font-size:.75rem;padding:.2rem .6rem" onclick="excluirChamado(' + c.id + ')">Excluir</button></td>' +
        '</tr>';
    }).join('');
  }

  function renderMktStats() {
    var el = document.getElementById('mkt-total-clientes');
    if (!el) return;
    fetch('/api/clientes').then(function(r){ return r.json(); }).then(function(d){
      el.textContent = (d && d.length) || 0;
    }).catch(function(){ el.textContent = '0'; });
    var camps = JSON.parse(localStorage.getItem(CAMP_KEY) || '[]');
    document.getElementById('mkt-emails-enviados').textContent = camps.length;
    document.getElementById('mkt-taxa-abertura').textContent = camps.length ? '–' : '–';
  }

  function initCrmTabs() {
    document.querySelectorAll('.crm-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.crm-tab').forEach(function(b){ b.classList.remove('active'); });
        document.querySelectorAll('.crm-panel').forEach(function(p){ p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('crm-' + btn.dataset.tab);
        if (panel) {
          panel.classList.add('active');
          if (btn.dataset.tab === 'funil')       renderKanban();
          if (btn.dataset.tab === 'atendimento') renderChamados();
          if (btn.dataset.tab === 'marketing')   renderMktStats();
          if (btn.dataset.tab === 'ferramentas') renderKiwifyStatus();
        }
      });
    });
  }

  function renderKiwifyStatus() {
    var dot   = document.getElementById('kiwify-status-dot');
    var texto = document.getElementById('kiwify-status-texto');
    var input = document.getElementById('kiwify-webhook-url');
    if (!dot) return;
    fetch('/api/kiwify/status', { headers: { Authorization: 'Bearer ' + getAdminToken() } })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (input) {
          input.value = s.token
            ? window.location.origin + '/api/kiwify/webhook?token=' + s.token
            : window.location.origin + '/api/kiwify/webhook (defina KIWIFY_WEBHOOK_TOKEN no .env)';
        }
        if (!s.configurado) {
          dot.className = 'crm-kiwify-dot off';
          texto.textContent = 'Token não configurado no servidor (.env)';
        } else if (s.ultimoRecebidoEm) {
          dot.className = 'crm-kiwify-dot on';
          var dt = new Date(s.ultimoRecebidoEm);
          texto.textContent = 'Conectado — última venda recebida em ' + dt.toLocaleString('pt-BR') + ' (' + (s.totalRecebidos || 1) + ' no total)';
        } else {
          dot.className = 'crm-kiwify-dot';
          texto.textContent = 'Configurado, aguardando a primeira venda...';
        }
      })
      .catch(function () {
        dot.className = 'crm-kiwify-dot off';
        texto.textContent = 'Não foi possível verificar o status.';
      });

    var apiDot   = document.getElementById('kiwify-api-status-dot');
    var apiTexto = document.getElementById('kiwify-api-status-texto');
    if (!apiDot) return;
    fetch('/api/kiwify/api-status', { headers: { Authorization: 'Bearer ' + getAdminToken() } })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.conectado) {
          apiDot.className = 'crm-kiwify-dot on';
          apiTexto.textContent = 'API de pagamentos conectada';
        } else {
          apiDot.className = 'crm-kiwify-dot off';
          apiTexto.textContent = 'API de pagamentos não conectada' + (s.erro ? ' — ' + s.erro : '');
        }
      })
      .catch(function () {
        apiDot.className = 'crm-kiwify-dot off';
        apiTexto.textContent = 'Não foi possível verificar a API de pagamentos.';
      });
  }

  window.importarVendasKiwify = function () {
    var msg = document.getElementById('kiwify-importar-msg');
    var btn = document.getElementById('btn-importar-vendas-kiwify');
    btn.disabled = true;
    msg.style.color = '#666';
    msg.textContent = 'Importando...';
    fetch('/api/kiwify/importar-vendas', { method: 'POST', headers: { Authorization: 'Bearer ' + getAdminToken() } })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { msg.style.color = '#ef4444'; msg.textContent = res.d.error || 'Erro ao importar.'; return; }
        msg.style.color = '#16a34a';
        msg.textContent = res.d.importados + ' venda(s) nova(s) importada(s) de ' + res.d.total + ' encontradas.';
        renderKanban();
      })
      .catch(function () {
        btn.disabled = false;
        msg.style.color = '#ef4444';
        msg.textContent = 'Erro ao importar.';
      });
  };

  window.copiarWebhookKiwify = function () {
    var input = document.getElementById('kiwify-webhook-url');
    if (!input || !input.value) return;
    input.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value);
    } else {
      document.execCommand('copy');
    }
    var btn = event.target.closest('button');
    if (btn) {
      var original = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> Copiado!';
      setTimeout(function () { btn.innerHTML = original; }, 1500);
    }
  };

  window.abrirModalLead = function(stage) {
    document.getElementById('lead-id').value      = '';
    document.getElementById('lead-nome').value    = '';
    document.getElementById('lead-email').value   = '';
    document.getElementById('lead-tel').value     = '';
    document.getElementById('lead-produto').value = '';
    document.getElementById('lead-valor').value   = '';
    document.getElementById('lead-obs').value     = '';
    document.getElementById('lead-stage').value   = stage || 'contato';
    document.getElementById('modal-lead-titulo').textContent = 'Novo Lead';
    document.getElementById('modal-lead').style.display = 'flex';
  };

  window.fecharModalLead = function() {
    document.getElementById('modal-lead').style.display = 'none';
  };

  window.editarLead = function(id) {
    var lead = getLeads().find(function(l){ return l.id === id; });
    if (!lead) return;
    document.getElementById('lead-id').value      = id;
    document.getElementById('lead-nome').value    = lead.nome;
    document.getElementById('lead-email').value   = lead.email   || '';
    document.getElementById('lead-tel').value     = lead.tel     || '';
    document.getElementById('lead-produto').value = lead.produto || '';
    document.getElementById('lead-valor').value   = lead.valor   || '';
    document.getElementById('lead-obs').value     = lead.obs     || '';
    document.getElementById('lead-stage').value   = lead.stage;
    document.getElementById('modal-lead-titulo').textContent = 'Editar Lead';
    document.getElementById('modal-lead').style.display = 'flex';
  };

  window.salvarLead = function() {
    var nome = document.getElementById('lead-nome').value.trim();
    if (!nome) { alert('Informe o nome do cliente.'); return; }
    var id = document.getElementById('lead-id').value;
    var payload = {
      nome:    nome,
      email:   document.getElementById('lead-email').value,
      tel:     document.getElementById('lead-tel').value,
      produto: document.getElementById('lead-produto').value,
      valor:   document.getElementById('lead-valor').value,
      obs:     document.getElementById('lead-obs').value,
      stage:   document.getElementById('lead-stage').value
    };
    var req = id
      ? fetch('/api/leads/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminToken() }, body: JSON.stringify(payload) })
      : fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminToken() }, body: JSON.stringify(Object.assign({ data: new Date().toLocaleDateString('pt-BR') }, payload)) });
    req.then(function () {
      fecharModalLead();
      renderKanban();
    }).catch(function () { alert('Erro ao salvar lead.'); });
  };

  window.abrirModalChamado = function() {
    ['cham-cliente','cham-assunto','cham-desc'].forEach(function(id){ document.getElementById(id).value = ''; });
    document.getElementById('cham-status').value = 'aberto';
    document.getElementById('modal-chamado').style.display = 'flex';
  };

  window.fecharModalChamado = function() {
    document.getElementById('modal-chamado').style.display = 'none';
  };

  window.salvarChamado = function() {
    var cliente = document.getElementById('cham-cliente').value.trim();
    var assunto  = document.getElementById('cham-assunto').value.trim();
    if (!cliente || !assunto) { alert('Preencha cliente e assunto.'); return; }
    var list = getChamados();
    list.unshift({
      id:      Date.now(),
      cliente: cliente,
      assunto: assunto,
      status:  document.getElementById('cham-status').value,
      desc:    document.getElementById('cham-desc').value,
      data:    new Date().toLocaleDateString('pt-BR')
    });
    saveChamados(list);
    fecharModalChamado();
    renderChamados();
  };

  window.excluirChamado = function(id) {
    if (!confirm('Excluir chamado?')) return;
    saveChamados(getChamados().filter(function(c){ return c.id !== id; }));
    renderChamados();
  };

  window.filtrarChamados = function() {
    renderChamados(document.getElementById('atend-busca').value);
  };

  window.dispararCampanha = function() {
    var assunto = document.getElementById('mkt-assunto').value.trim();
    if (!assunto) { alert('Informe o assunto da campanha.'); return; }
    var camps = JSON.parse(localStorage.getItem(CAMP_KEY) || '[]');
    camps.push({
      id:       Date.now(),
      assunto:  assunto,
      segmento: document.getElementById('mkt-segmento').value,
      data:     new Date().toLocaleDateString('pt-BR')
    });
    localStorage.setItem(CAMP_KEY, JSON.stringify(camps));
    document.getElementById('mkt-assunto').value = '';
    document.getElementById('mkt-corpo').value   = '';
    alert('Campanha registrada com sucesso! (' + camps.length + ' total)');
    renderMktStats();
  };

  document.addEventListener('DOMContentLoaded', function() {
    initCrmTabs();
    document.querySelectorAll('.adm-nav-item[data-section="crm"]').forEach(function(btn){
      btn.addEventListener('click', function(){ renderKanban(); });
    });
  });
})();


/* ── CRM Pills helper ─────────────────────────────── */
window.selecionarPill = function(btn) {
  var pills = btn.closest('.crm-stage-pills').querySelectorAll('.crm-pill');
  pills.forEach(function(p){ p.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('lead-stage').value = btn.dataset.val;
};

/* Patch abrirModalLead para sincronizar pills */
var _origAbrirModalLead = window.abrirModalLead;
window.abrirModalLead = function(stage) {
  _origAbrirModalLead(stage || 'contato');
  var s = stage || 'contato';
  document.querySelectorAll('#lead-stage-pills .crm-pill').forEach(function(p){
    p.classList.toggle('active', p.dataset.val === s);
  });
};

/* Patch editarLead para sincronizar pills */
var _origEditarLead = window.editarLead;
window.editarLead = function(id) {
  _origEditarLead(id);
  var s = document.getElementById('lead-stage').value;
  document.querySelectorAll('#lead-stage-pills .crm-pill').forEach(function(p){
    p.classList.toggle('active', p.dataset.val === s);
  });
};

/* ── Patch Marketing ── */
window.dispararCampanha = function() {
  var assunto = document.getElementById('mkt-assunto').value.trim();
  if (!assunto) { alert('Informe o assunto da campanha.'); return; }
  var checked = document.querySelector('input[name="mkt-seg"]:checked');
  var segVal  = checked ? checked.value : 'todos';
  var segLabels = { todos:'Todos os clientes', novos:'Novos (30 dias)', inativos:'Inativos (60+ dias)' };
  document.getElementById('mkt-segmento').value = segVal;
  var camps = JSON.parse(localStorage.getItem('crm_campanhas') || '[]');
  var nova = { id: Date.now(), assunto: assunto, corpo: document.getElementById('mkt-corpo').value, segmento: segVal, data: new Date().toLocaleDateString('pt-BR') };
  camps.unshift(nova);
  localStorage.setItem('crm_campanhas', JSON.stringify(camps));
  document.getElementById('mkt-assunto').value = '';
  document.getElementById('mkt-corpo').value   = '';
  renderMktHistorico(camps);
  renderMktStatsNew();
  alert('Campanha "' + nova.assunto + '" registrada com sucesso!');
};

function renderMktHistorico(camps) {
  var el = document.getElementById('mkt-historico-lista');
  if (!el) return;
  if (!camps || !camps.length) {
    el.innerHTML = '<div class="mkt-history-empty"><i class="ti ti-mail-off"></i><span>Nenhuma campanha disparada ainda.</span></div>';
    return;
  }
  el.innerHTML = camps.slice(0,10).map(function(c){
    var seg = { todos:'Todos', novos:'Novos', inativos:'Inativos' }[c.segmento] || c.segmento;
    return '<div class="mkt-history-item">' +
      '<div class="mkt-history-dot"></div>' +
      '<div class="mkt-history-item-assunto">' + c.assunto + '</div>' +
      '<div class="mkt-history-item-seg">' + seg + '</div>' +
      '<div class="mkt-history-item-data">' + c.data + '</div>' +
      '</div>';
  }).join('');
}

function renderMktStatsNew() {
  var camps = JSON.parse(localStorage.getItem('crm_campanhas') || '[]');
  var e1 = document.getElementById('mkt-emails-enviados');
  var e2 = document.getElementById('mkt-taxa-abertura');
  if (e1) e1.textContent = camps.length;
  if (e2) e2.textContent = '–';
  fetch('/api/clientes').then(function(r){ return r.json(); }).then(function(d){
    var el = document.getElementById('mkt-total-clientes');
    if (el) el.textContent = (d && d.length) || 0;
  }).catch(function(){});
  renderMktHistorico(camps);
}

/* Sync radio pills com select oculto */
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('input[name="mkt-seg"]').forEach(function(r){
    r.addEventListener('change', function(){
      var sel = document.getElementById('mkt-segmento');
      if (sel) sel.value = r.value;
    });
  });
});

/* Patch renderMktStats para usar nova versão */
window.renderMktStats = renderMktStatsNew;

/* ── Patch Atendimento ─────────────────────────────── */
var _atdFiltroStatus = 'todos';

function renderChamadosCards(list) {
  var el = document.getElementById('atd-lista-chamados');
  if (!el) return;
  if (!list || !list.length) {
    el.innerHTML = '<div class="atd-vazio"><i class="ti ti-inbox"></i><span>Nenhum chamado encontrado.</span></div>';
  } else {
    el.innerHTML = list.map(function(c) {
      var labels = { aberto:'Aberto', andamento:'Em andamento', resolvido:'Resolvido' };
      var prox   = { aberto:'andamento', andamento:'resolvido', resolvido:'aberto' };
      var proxLabel = { aberto:'→ Em andamento', andamento:'→ Resolvido', resolvido:'↺ Reabrir' };
      return '<div class="atd-card">' +
        '<div class="atd-card-status-dot ' + c.status + '"></div>' +
        '<div class="atd-card-body">' +
          '<div class="atd-card-assunto">' + c.assunto + '</div>' +
          '<div class="atd-card-meta">' +
            '<span><i class="ti ti-user"></i>' + c.cliente + '</span>' +
            '<span><i class="ti ti-calendar"></i>' + c.data + '</span>' +
            (c.desc ? '<span><i class="ti ti-notes"></i>' + c.desc.substring(0,60) + (c.desc.length>60?'…':'') + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="atd-card-badge ' + c.status + '">' + (labels[c.status]||c.status) + '</span>' +
        '<div class="atd-card-actions">' +
          '<button class="atd-btn-status" onclick="avancarStatus(' + c.id + ')">' + (proxLabel[c.status]||'→') + '</button>' +
          '<button class="atd-btn-excluir" onclick="excluirChamado(' + c.id + ')"><i class="ti ti-trash"></i></button>' +
        '</div>' +
        '<div class="atd-card-id">#' + String(c.id).slice(-6) + '</div>' +
      '</div>';
    }).join('');
  }
  /* stats */
  var all = JSON.parse(localStorage.getItem('crm_chamados') || '[]');
  var cnt = function(s){ return all.filter(function(c){ return c.status===s; }).length; };
  ['aberto','andamento','resolvido'].forEach(function(s){
    var el2 = document.getElementById('cnt-' + s); if (el2) el2.textContent = cnt(s);
  });
  var t = document.getElementById('cnt-total'); if (t) t.textContent = all.length;
}

window.filtrarChamados = function() {
  var q    = (document.getElementById('atend-busca')||{}).value || '';
  var list = JSON.parse(localStorage.getItem('crm_chamados') || '[]');
  if (_atdFiltroStatus !== 'todos') list = list.filter(function(c){ return c.status === _atdFiltroStatus; });
  if (q.trim()) { var ql = q.toLowerCase(); list = list.filter(function(c){ return (c.cliente+c.assunto).toLowerCase().indexOf(ql) !== -1; }); }
  renderChamadosCards(list);
};

window.filtrarChamadosStatus = function(btn) {
  document.querySelectorAll('.atd-filter').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  _atdFiltroStatus = btn.dataset.filter;
  window.filtrarChamados();
};

window.avancarStatus = function(id) {
  var list = JSON.parse(localStorage.getItem('crm_chamados') || '[]');
  var prox = { aberto:'andamento', andamento:'resolvido', resolvido:'aberto' };
  var idx  = list.findIndex(function(c){ return c.id === id; });
  if (idx !== -1) { list[idx].status = prox[list[idx].status] || 'aberto'; }
  localStorage.setItem('crm_chamados', JSON.stringify(list));
  window.filtrarChamados();
};

window.excluirChamado = function(id) {
  if (!confirm('Excluir chamado?')) return;
  var list = JSON.parse(localStorage.getItem('crm_chamados') || '[]').filter(function(c){ return c.id !== id; });
  localStorage.setItem('crm_chamados', JSON.stringify(list));
  window.filtrarChamados();
};

window.salvarChamado = function() {
  var cliente = document.getElementById('cham-cliente').value.trim();
  var assunto  = document.getElementById('cham-assunto').value.trim();
  if (!cliente || !assunto) { alert('Preencha cliente e assunto.'); return; }
  var list = JSON.parse(localStorage.getItem('crm_chamados') || '[]');
  list.unshift({ id: Date.now(), cliente: cliente, assunto: assunto, status: document.getElementById('cham-status').value, desc: document.getElementById('cham-desc').value, data: new Date().toLocaleDateString('pt-BR') });
  localStorage.setItem('crm_chamados', JSON.stringify(list));
  fecharModalChamado();
  window.filtrarChamados();
};

/* Ao abrir aba atendimento, renderiza */
var _origRenderChamados = window.renderChamados;
window.renderChamados = function() {
  _atdFiltroStatus = 'todos';
  document.querySelectorAll('.atd-filter').forEach(function(b){ b.classList.toggle('active', b.dataset.filter==='todos'); });
  window.filtrarChamados();
};

/* ── Dashboard Interativo (dados reais) ───────────── */
(function () {

  var chartVendasInst = null;
  var chartStatusInst = null;
  var _periodoAtual   = 'mes';
  var _modoAtual      = 'receita'; // 'receita' | 'pedidos'
  var _customDe = '', _customAte = '';

  /* ── Formatação ─────────────────────────────────── */
  function fmtR(v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
  function fmtData(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1];
  }

  /* ── Sparkline canvas ───────────────────────────── */
  function drawSparkline(id, data, color) {
    var c = document.getElementById(id);
    if (!c) return;
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var range = max - min || 1;
    ctx.clearRect(0, 0, W, H);
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '66');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    data.forEach(function (v, i) {
      var x = (i / (data.length - 1)) * W;
      var y = H - ((v - min) / range) * (H - 6) - 3;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
  }

  /* ── Delta badge ────────────────────────────────── */
  function setDelta(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    if (val === null || val === undefined) { el.innerHTML = '<i class="ti ti-minus"></i> sem dados anteriores'; el.className = 'db-metric-delta'; return; }
    var n = parseFloat(val);
    var up = n >= 0;
    el.className = 'db-metric-delta ' + (up ? 'db-delta-up' : 'db-delta-down');
    el.innerHTML = '<i class="ti ti-trending-' + (up ? 'up' : 'down') + '"></i> <span>' + (up ? '+' : '') + n + '%</span> em relação a ontem';
  }

  /* ── Busca analytics na API ─────────────────────── */
  function fetchAnalytics(periodo, de, ate, cb) {
    var token = sessionStorage.getItem('allecom_admin_token') || '';
    var url = '/api/pedidos/analytics?periodo=' + periodo;
    if (periodo === 'custom' && de && ate) url += '&de=' + de + '&ate=' + ate;
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(cb)
      .catch(function (e) { console.error('analytics error', e); cb(null); });
  }

  /* ── Gráfico de linha ───────────────────────────── */
  function buildLineChart(labels, dados, modo) {
    var el = document.getElementById('chart-vendas');
    if (!el) return;
    if (chartVendasInst) { chartVendasInst.destroy(); chartVendasInst = null; }

    var color   = modo === 'pedidos' ? '#6366f1' : '#0038a7';
    var gCtx    = el.getContext('2d');
    var gradient = gCtx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, (modo === 'pedidos' ? 'rgba(99,102,241,' : 'rgba(0,56,167,') + '.15)');
    gradient.addColorStop(1, (modo === 'pedidos' ? 'rgba(99,102,241,' : 'rgba(0,56,167,') + '.01)');

    /* Formata labels: se muitos pontos, mostrar só alguns */
    var lblFmt = labels.map(function (l) { return l.length === 10 ? fmtData(l) : l; });

    chartVendasInst = new Chart(el, {
      type: 'line',
      data: {
        labels: lblFmt,
        datasets: [{
          label: modo === 'pedidos' ? 'Pedidos' : 'Receita (R$)',
          data: dados,
          borderColor: color,
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointRadius: labels.length <= 14 ? 3 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: color,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff', titleColor: '#6b7280', bodyColor: '#111',
            borderColor: '#e5e7eb', borderWidth: 1, padding: 12, cornerRadius: 10,
            callbacks: {
              label: function (c) {
                return modo === 'pedidos'
                  ? '  ' + c.parsed.y + ' pedidos'
                  : '  ' + fmtR(c.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#f1f5f9', drawBorder: false },
            ticks: { color: '#9ca3af', font: { size: 11 }, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: '#f1f5f9', drawBorder: false },
            border: { dash: [4, 4] },
            ticks: {
              color: '#9ca3af', font: { size: 11 },
              callback: function (v) {
                return modo === 'pedidos' ? v : (v >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'K' : 'R$' + v);
              }
            }
          }
        }
      }
    });
  }

  /* ── Gráfico de rosca (status) ──────────────────── */
  function buildStatusChart(statusCounts) {
    var el = document.getElementById('chart-status');
    if (!el) return;
    if (chartStatusInst) { chartStatusInst.destroy(); chartStatusInst = null; }

    var keys   = Object.keys(statusCounts || {});
    var vals   = keys.map(function (k) { return statusCounts[k]; });
    var total  = vals.reduce(function (a, b) { return a + b; }, 0) || 1;
    var colors = ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#06b6d4','#f43f5e'];

    chartStatusInst = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: keys,
        datasets: [{ data: vals, backgroundColor: colors.slice(0, keys.length), borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b', titleColor: '#94a3b8', bodyColor: '#f1f5f9',
            borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, padding: 10, cornerRadius: 10
          }
        }
      }
    });

    var leg = document.getElementById('db-legend-status');
    if (leg) leg.innerHTML = keys.map(function (k, i) {
      var pct = Math.round((statusCounts[k] / total) * 100);
      return '<div class="db-legend-item">' +
        '<div class="db-legend-dot" style="background:' + (colors[i] || '#888') + '"></div>' +
        k + '<span style="margin-left:auto;color:#111;font-weight:700">' + statusCounts[k] + ' <small style="color:#9ca3af;font-weight:400">(' + pct + '%)</small></span>' +
        '</div>';
    }).join('');
  }

  /* ── Atualiza cards de métricas ─────────────────── */
  function updateMetricCards(data) {
    var fEl = document.getElementById('dash-faturamento');
    var pEl = document.getElementById('dash-pedidos');
    if (fEl) fEl.textContent = fmtR(data.receitaHoje || 0);
    if (pEl) pEl.textContent = data.pedidosHoje || 0;
    setDelta('delta-faturamento', data.deltaReceita);
    setDelta('delta-pedidos',     data.deltaPedidos);

    /* sparklines com os dados do período */
    if (data.totais && data.totais.length)
      drawSparkline('spark-faturamento', data.totais, '#0038a7');
    if (data.qtds && data.qtds.length)
      drawSparkline('spark-pedidos', data.qtds, '#0038a7');
  }

  /* ── Carrega período e redesenha ────────────────── */
  function carregarPeriodo(periodo, de, ate) {
    _periodoAtual = periodo;
    _customDe = de || ''; _customAte = ate || '';

    /* Mostra loading */
    var el = document.getElementById('chart-vendas');
    if (el) el.style.opacity = '.4';

    fetchAnalytics(periodo, de, ate, function (data) {
      if (!data) return;
      if (el) el.style.opacity = '1';

      var dados = _modoAtual === 'pedidos' ? data.qtds : data.totais;
      buildLineChart(data.labels, dados, _modoAtual);
      buildStatusChart(data.statusCounts);
      updateMetricCards(data);
    });
  }

  /* ── Botões de período ──────────────────────────── */
  window.mudarPeriodo = function (btn) {
    var p = btn.dataset.period;
    if (p === 'custom') { abrirDatePicker(); return; }
    document.querySelectorAll('.db-period').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    carregarPeriodo(p);
  };

  /* ── Toggle Receita / Pedidos ───────────────────── */
  window.alternarModo = function (btn) {
    _modoAtual = btn.dataset.modo;
    document.querySelectorAll('.db-modo-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    carregarPeriodo(_periodoAtual, _customDe, _customAte);
  };

  /* ── Date picker personalizado ──────────────────── */
  function abrirDatePicker() {
    var overlay = document.getElementById('db-date-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
  }
  window.fecharDatePicker = function () {
    var overlay = document.getElementById('db-date-overlay');
    if (overlay) overlay.style.display = 'none';
  };
  window.aplicarPeriodoCustom = function () {
    var de  = document.getElementById('db-date-de').value;
    var ate = document.getElementById('db-date-ate').value;
    if (!de || !ate) { alert('Selecione as duas datas.'); return; }
    if (de > ate) { alert('Data inicial deve ser anterior à final.'); return; }
    fecharDatePicker();
    document.querySelectorAll('.db-period').forEach(function (b) { b.classList.remove('active'); });
    document.querySelector('.db-period[data-period="custom"]').classList.add('active');
    carregarPeriodo('custom', de, ate);
  };

  /* ── Clientes sparkline (rota clientes) ─────────── */
  function carregarClientesSparkline() {
    var token = sessionStorage.getItem('allecom_admin_token') || '';
    fetch('/api/clientes', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var el = document.getElementById('dash-clientes');
        if (el) el.textContent = list.length;
        /* sparkline artificial com contagem acumulada */
        var acc = [];
        for (var i = 0; i < 12; i++) acc.push(Math.round(list.length * (0.4 + i * 0.055)));
        drawSparkline('spark-clientes', acc, '#0038a7');
        drawSparkline('spark-visitantes', [100,120,110,140,130,150,160,145,170,160,180,190], '#0038a7');
        var elV = document.getElementById('dash-visitantes');
        if (elV) elV.textContent = '–';
        setDelta('delta-clientes',   '1.2');
        setDelta('delta-visitantes', '9.3');
      }).catch(function () {});
  }

  /* ── Init ───────────────────────────────────────── */
  function init() {
    injetarControlesUI();
    carregarPeriodo('mes');
    carregarClientesSparkline();
  }

  /* ── Injeta controles extras (modo + custom) no DOM */
  function injetarControlesUI() {
    var header = document.querySelector('.db-chart-header');
    if (!header || document.getElementById('db-modo-wrap')) return;

    /* Botões Receita / Pedidos */
    var modoWrap = document.createElement('div');
    modoWrap.id = 'db-modo-wrap';
    modoWrap.className = 'db-modo-wrap';
    modoWrap.innerHTML =
      '<button class="db-modo-btn active" data-modo="receita" onclick="alternarModo(this)">Receita</button>' +
      '<button class="db-modo-btn" data-modo="pedidos" onclick="alternarModo(this)">Pedidos</button>';
    var periodTabs = header.querySelector('.db-period-tabs');
    if (periodTabs) {
      /* Adiciona botão Personalizado */
      var btn = document.createElement('button');
      btn.className = 'db-period';
      btn.dataset.period = 'custom';
      btn.textContent = 'Personalizado';
      btn.setAttribute('onclick', 'mudarPeriodo(this)');
      periodTabs.appendChild(btn);
      header.insertBefore(modoWrap, periodTabs);
    }

    /* Overlay date picker */
    if (!document.getElementById('db-date-overlay')) {
      var ov = document.createElement('div');
      ov.id = 'db-date-overlay';
      ov.className = 'db-date-overlay';
      ov.style.display = 'none';
      ov.innerHTML =
        '<div class="db-date-box">' +
          '<div class="db-date-title"><i class="ti ti-calendar"></i> Período personalizado</div>' +
          '<div class="db-date-row">' +
            '<div class="db-date-field"><label>De</label><input type="date" id="db-date-de" class="db-date-input"></div>' +
            '<div class="db-date-field"><label>Até</label><input type="date" id="db-date-ate" class="db-date-input"></div>' +
          '</div>' +
          '<div class="db-date-actions">' +
            '<button class="crm-btn-cancel" onclick="fecharDatePicker()">Cancelar</button>' +
            '<button class="crm-btn-save"   onclick="aplicarPeriodoCustom()"><i class="ti ti-search"></i> Aplicar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(init, 400);
  });

})();

/* ── Best Selling Products Table ─────────────────── */
(function () {
  var _bspTodos    = [];
  var _bspFiltrado = [];
  var _bspSort     = 'vendas';
  var _bspFiltro   = 'todos';
  var _bspPagina   = 1;
  var _bspPorPag   = 8;
  var _bspPedidos  = [];

  function proxySrc(src) {
    if (!src) return '';
    return src.includes('mlstatic.com') ? '/api/ml/img?url=' + encodeURIComponent(src) : src;
  }

  function contarVendas(produto) {
    var nome = (produto.titulo || produto.nome || '').toLowerCase();
    return _bspPedidos.filter(function (p) {
      var pNome = typeof p.produtos === 'string' ? p.produtos : (p.produtos && p.produtos[0] && p.produtos[0].nome) || '';
      return pNome.toLowerCase() === nome;
    }).length;
  }

  function statusInfo(estoque) {
    var n = parseInt(estoque) || 0;
    if (n === 0) return { cls: 'bsp-badge--out', txt: 'Sem Estoque', icon: 'ti-x' };
    if (n <= 5)  return { cls: 'bsp-badge--low', txt: 'Reposição',  icon: 'ti-alert-triangle' };
    return            { cls: 'bsp-badge--in',  txt: 'Em Estoque', icon: 'ti-circle-check' };
  }

  function renderTabela() {
    var tbody = document.getElementById('bsp-tbody');
    if (!tbody) return;

    var inicio = (_bspPagina - 1) * _bspPorPag;
    var pagina = _bspFiltrado.slice(inicio, inicio + _bspPorPag);
    var maxVendas = _bspFiltrado.length ? Math.max.apply(null, _bspFiltrado.map(function(p){ return p._vendas||0; })) || 1 : 1;

    if (!pagina.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="bsp-loading"><i class="ti ti-search-off"></i> Nenhum produto encontrado.</td></tr>';
    } else {
      tbody.innerHTML = pagina.map(function (p, i) {
        var idx    = inicio + i + 1;
        var img    = proxySrc(p.fotos && p.fotos[0] ? p.fotos[0] : (p.thumbnail || p.imagem || ''));
        var nome   = p.titulo || p.nome || 'Produto';
        var marca  = p.marca || p.categoria || '';
        var preco  = 'R$ ' + Number(p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        var vendas = p._vendas || 0;
        var est    = parseInt(p.estoque) || 0;
        var pctBar = Math.round((vendas / maxVendas) * 100);
        var st     = statusInfo(est);
        var id     = p.id || ('#' + String(idx).padStart(5,'0'));
        return '<tr>' +
          '<td class="bsp-id">#' + String(id).slice(-6) + '</td>' +
          '<td>' + (img
            ? '<img class="bsp-img" src="' + img + '" alt="" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
              '<div class="bsp-img-placeholder" style="display:none"><i class="ti ti-photo"></i></div>'
            : '<div class="bsp-img-placeholder"><i class="ti ti-photo"></i></div>') + '</td>' +
          '<td><div class="bsp-name">' + nome.substring(0,38) + (nome.length>38?'…':'') + '</div>' +
            (marca ? '<div class="bsp-name-sub">' + marca + '</div>' : '') + '</td>' +
          '<td class="bsp-price">' + preco + '</td>' +
          '<td><div class="bsp-sales">' + vendas + '</div>' +
            '<div class="bsp-sales-bar"><div class="bsp-sales-fill" style="width:' + pctBar + '%"></div></div></td>' +
          '<td class="bsp-stock">' + est + '</td>' +
          '<td><span class="bsp-badge ' + st.cls + '"><i class="ti ' + st.icon + '"></i> ' + st.txt + '</span></td>' +
          '<td><button class="bsp-action-btn" onclick="bspAcao(\'' + id + '\')"><i class="ti ti-dots-vertical"></i></button></td>' +
        '</tr>';
      }).join('');
    }

    /* Count + paginação */
    var cnt = document.getElementById('bsp-count');
    if (cnt) cnt.textContent = _bspFiltrado.length + ' produto' + (_bspFiltrado.length !== 1 ? 's' : '');
    renderPaginacaoBSP();
  }

  function renderPaginacaoBSP() {
    var el = document.getElementById('bsp-pagination');
    if (!el) return;
    var total = Math.ceil(_bspFiltrado.length / _bspPorPag);
    if (total <= 1) { el.innerHTML = ''; return; }
    var html = '';
    for (var i = 1; i <= Math.min(total, 7); i++) {
      html += '<button class="bsp-page-btn' + (i === _bspPagina ? ' active' : '') + '" onclick="irPaginaBSP(' + i + ')">' + i + '</button>';
    }
    el.innerHTML = html;
  }

  window.irPaginaBSP = function (n) { _bspPagina = n; renderTabela(); };

  function aplicarFiltroSort() {
    var q = ((document.getElementById('bsp-search') || {}).value || '').toLowerCase();
    var list = _bspTodos.slice();

    /* Filtro status */
    if (_bspFiltro !== 'todos') {
      list = list.filter(function (p) {
        var est = parseInt(p.estoque) || 0;
        if (_bspFiltro === 'em_estoque')  return est > 5;
        if (_bspFiltro === 'sem_estoque') return est === 0;
        if (_bspFiltro === 'reposicao')   return est > 0 && est <= 5;
        return true;
      });
    }
    /* Busca */
    if (q) list = list.filter(function (p) {
      return ((p.titulo||p.nome||'') + (p.marca||'')).toLowerCase().indexOf(q) !== -1;
    });
    /* Ordenação */
    list.sort(function (a, b) {
      if (_bspSort === 'preco')   return (b.preco||0) - (a.preco||0);
      if (_bspSort === 'estoque') return (b.estoque||0) - (a.estoque||0);
      if (_bspSort === 'nome')    return (a.titulo||a.nome||'').localeCompare(b.titulo||b.nome||'');
      return (b._vendas||0) - (a._vendas||0); /* vendas (default) */
    });

    _bspFiltrado = list;
    _bspPagina   = 1;
    renderTabela();
  }

  window.filtrarBSP       = aplicarFiltroSort;
  window.setSortBSP       = function (val, label) {
    _bspSort = val;
    var el = document.getElementById('bsp-sort-label'); if (el) el.textContent = label;
    document.getElementById('bsp-sort-menu').style.display = 'none';
    aplicarFiltroSort();
  };
  window.setFilterBSP     = function (val) {
    _bspFiltro = val;
    document.getElementById('bsp-filter-menu').style.display = 'none';
    aplicarFiltroSort();
  };
  window.toggleBSPSort    = function () {
    var m = document.getElementById('bsp-sort-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
    document.getElementById('bsp-filter-menu').style.display = 'none';
  };
  window.toggleBSPFilter  = function () {
    var m = document.getElementById('bsp-filter-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
    document.getElementById('bsp-sort-menu').style.display = 'none';
  };
  window.bspAcao = function (id) {
    /* Redireciona para edição do produto */
    var btn = document.querySelector('[data-section="anuncios"]');
    if (btn) btn.click();
  };

  /* Fechar dropdowns clicando fora */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#bsp-sort-wrap'))   document.getElementById('bsp-sort-menu')   && (document.getElementById('bsp-sort-menu').style.display   = 'none');
    if (!e.target.closest('#bsp-filter-wrap')) document.getElementById('bsp-filter-menu') && (document.getElementById('bsp-filter-menu').style.display = 'none');
  });

  /* Carrega produtos + pedidos e monta tabela */
  function carregarBSP(pedidos) {
    _bspPedidos = pedidos || [];
    var token = sessionStorage.getItem('allecom_admin_token') || '';
    Promise.all([
      fetch('/api/anuncios', { headers: { Authorization: 'Bearer ' + token } }).then(function(r){ return r.json(); }),
      fetch('/api/produtos',  { headers: { Authorization: 'Bearer ' + token } }).then(function(r){ return r.json(); })
    ]).then(function (res) {
      var anuncios = Array.isArray(res[0]) ? res[0] : [];
      var produtos = Array.isArray(res[1]) ? res[1] : [];
      var todos = anuncios.concat(produtos.filter(function(p){
        return !anuncios.find(function(a){ return a.id === p.id; });
      }));
      todos.forEach(function (p) { p._vendas = contarVendas(p); });
      _bspTodos    = todos;
      _bspFiltrado = todos.slice();
      aplicarFiltroSort();
    }).catch(function () {
      var tbody = document.getElementById('bsp-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="bsp-loading">Erro ao carregar produtos.</td></tr>';
    });
  }

  /* Integra com renderDashboard existente */
  var _origRenderDash = window.renderDashboard;
  window.renderDashboard = function () {
    if (_origRenderDash) _origRenderDash();
    var token = sessionStorage.getItem('allecom_admin_token') || '';
    fetch('/api/pedidos', { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r){ return r.json(); })
      .then(function(p){ carregarBSP(p); })
      .catch(function(){ carregarBSP([]); });
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var token = sessionStorage.getItem('allecom_admin_token') || '';
      fetch('/api/pedidos', { headers: { Authorization: 'Bearer ' + token } })
        .then(function(r){ return r.json(); })
        .then(function(p){ carregarBSP(p); })
        .catch(function(){ carregarBSP([]); });
    }, 600);
  });
})();


/* ── Toggle de Tema ──────────────────────────────── */
window.toggleTema = function () {
  var dark = document.body.classList.toggle('dark');
  localStorage.setItem('allecom_tema', dark ? 'dark' : 'light');
  document.getElementById('tema-icon').className  = dark ? 'ti ti-sun'  : 'ti ti-moon';
  document.getElementById('tema-label').textContent = dark ? 'Tema Claro' : 'Tema Escuro';
  recolorCharts(dark);
};

/* Aplica tema salvo ao carregar */
(function () {
  var tema = localStorage.getItem('allecom_tema');
  if (tema === 'dark') {
    document.body.classList.add('dark');
    document.addEventListener('DOMContentLoaded', function () {
      var icon  = document.getElementById('tema-icon');
      var label = document.getElementById('tema-label');
      if (icon)  icon.className     = 'ti ti-sun';
      if (label) label.textContent  = 'Tema Claro';
    });
  }
})();

/* Recolore os gráficos Chart.js ao trocar de tema */
function recolorCharts(dark) {
  var line  = dark ? '#38bdf8' : '#0038a7';
  var grid  = dark ? 'rgba(255,255,255,.05)' : '#f1f5f9';
  var tick  = dark ? '#475569' : '#9ca3af';
  var tipBg = dark ? '#0f172a' : '#ffffff';
  var tipBd = dark ? 'rgba(255,255,255,.1)' : '#e5e7eb';
  var tipTi = dark ? '#94a3b8' : '#6b7280';
  var tipBo = dark ? '#f1f5f9' : '#111';

  if (window.Chart && Chart.instances) {
    Object.values(Chart.instances).forEach(function (chart) {
      if (!chart || !chart.config) return;
      var ds = chart.data && chart.data.datasets;
      if (ds && ds[0]) {
        if (chart.config.type === 'line') {
          ds[0].borderColor = line;
          /* Recria gradiente */
          var ctx = chart.ctx;
          if (ctx) {
            var grad = ctx.createLinearGradient(0, 0, 0, 240);
            grad.addColorStop(0, dark ? 'rgba(56,189,248,.2)'  : 'rgba(0,56,167,.15)');
            grad.addColorStop(1, dark ? 'rgba(56,189,248,.01)' : 'rgba(0,56,167,.01)');
            ds[0].backgroundColor = grad;
          }
        }
      }
      if (chart.options.plugins && chart.options.plugins.tooltip) {
        var t = chart.options.plugins.tooltip;
        t.backgroundColor = tipBg; t.titleColor = tipTi;
        t.bodyColor = tipBo; t.borderColor = tipBd;
      }
      if (chart.options.scales) {
        ['x','y'].forEach(function (ax) {
          if (!chart.options.scales[ax]) return;
          chart.options.scales[ax].grid  = chart.options.scales[ax].grid  || {};
          chart.options.scales[ax].ticks = chart.options.scales[ax].ticks || {};
          chart.options.scales[ax].grid.color  = grid;
          chart.options.scales[ax].ticks.color = tick;
        });
      }
      chart.update('none');
    });
  }
}
