(function () {
  'use strict';

  var API = '/api';

  /* ══════════════════════════════════════════════
     UTILITÁRIOS
  ══════════════════════════════════════════════ */
  function getAdminToken()  { return sessionStorage.getItem('allecom_admin_token') || ''; }
  function setAdminToken(t) { sessionStorage.setItem('allecom_admin_token', t); }
  function clearAdminToken(){ sessionStorage.removeItem('allecom_admin_token'); }

  function $(id) { return document.getElementById(id); }

  /* escapa texto vindo de clientes/webhooks antes de ir pro innerHTML */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmtR(v) { return 'R$ ' + num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* YYYY-MM-DD → DD/MM/YYYY (sem passar por Date, que desloca o fuso) */
  function fmtISO(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '–';
    var p = iso.slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function fmtDataHora(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return isNaN(d) ? '–' : d.toLocaleDateString('pt-BR');
  }
  function isoHoje(offsetDias) {
    var d = new Date();
    if (offsetDias) d.setDate(d.getDate() + offsetDias);
    return d.toLocaleDateString('en-CA');
  }

  function sessaoExpirada() {
    clearAdminToken();
    sessionStorage.setItem('adm_expirou', '1');
    location.reload();
  }

  async function api(method, path, body) {
    var opts = { method: method, headers: { 'Authorization': 'Bearer ' + getAdminToken() } };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var r    = await fetch(API + path, opts);
    var data = await r.json().catch(function () { return {}; });
    if (r.status === 401 && path.indexOf('/auth/admin/login') !== 0) { sessaoExpirada(); throw new Error('Sessão expirada.'); }
    if (!r.ok) { var e = new Error(data.error || 'Erro na requisição (' + r.status + ').'); e.data = data; throw e; }
    return data;
  }

  function alertErro(err) { alert(err && err.message ? err.message : 'Erro inesperado.'); }

  function showMsg(id, text, color) {
    var el = $(id);
    if (!el) return;
    el.textContent = text; el.style.color = color;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ''; }, 4000);
  }

  /* "Curso A x2, Curso B" → [{nome:'Curso A', qtd:2}, {nome:'Curso B', qtd:1}] */
  function itensDoPedido(p) {
    if (Array.isArray(p.produtos)) {
      return p.produtos.map(function (i) { return { nome: i.nome || i.name || 'Produto', qtd: num(i.qty || i.qtd) || 1 }; });
    }
    return String(p.produtos || '').split(', ').filter(Boolean).map(function (s) {
      var m = s.match(/^(.*) x(\d+)$/);
      return m ? { nome: m[1], qtd: +m[2] } : { nome: s, qtd: 1 };
    });
  }

  function vendasPorProduto(pedidos) {
    var cont = {};
    pedidos.forEach(function (p) {
      if (p.status === 'Cancelado') return;
      itensDoPedido(p).forEach(function (i) {
        var k = i.nome.trim().toLowerCase();
        if (!cont[k]) cont[k] = { nome: i.nome.trim(), qtd: 0 };
        cont[k].qtd += i.qtd;
      });
    });
    return cont;
  }

  /* ══════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════ */
  var loginScreen = $('admin-login');
  var panel       = $('admin-panel');

  function doLogout() { clearAdminToken(); location.reload(); }

  var eyeBtn = document.querySelector('.adm-eye');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', function () {
      var inp = $('adm-pass');
      var ico = this.querySelector('i');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      ico.className = inp.type === 'password' ? 'ti ti-eye' : 'ti ti-eye-off';
    });
  }

  function loginMsg(txt, cor) {
    var err = $('login-error');
    err.style.color = cor || '#ef4444';
    err.textContent = txt;
    clearTimeout(err._t);
    err._t = setTimeout(function () { err.textContent = ''; err.style.color = '#ef4444'; }, 6000);
  }

  $('admin-login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    api('POST', '/auth/admin/login', { user: $('adm-user').value.trim(), pass: $('adm-pass').value })
      .then(function (data) { setAdminToken(data.token); showPanel(data.user); })
      .catch(function (ex) { loginMsg(ex.message); })
      .then(function () { btn.disabled = false; });
  });

  $('btn-reset-creds').addEventListener('click', function (e) {
    e.preventDefault();
    loginMsg('Para redefinir a senha, rode no servidor: npm run reset-admin -- NOVA_SENHA', '#2563eb');
  });

  if (sessionStorage.getItem('adm_expirou')) {
    sessionStorage.removeItem('adm_expirou');
    loginMsg('Sua sessão expirou. Entre novamente.', '#f59e0b');
  }

  /* fluxo de retorno do OAuth do Mercado Livre (aberto em popup) */
  var qs = new URLSearchParams(location.search);
  if (qs.get('ml') && window.opener) {
    try { window.opener.postMessage({ ml: qs.get('ml') }, location.origin); } catch (e) {}
    window.close();
  }

  if (getAdminToken()) {
    api('GET', '/auth/admin/me').then(function (d) { showPanel(d.user); }).catch(function () {});
  }

  /* ══════════════════════════════════════════════
     PAINEL / NAVEGAÇÃO
  ══════════════════════════════════════════════ */
  function showPanel(usuario) {
    loginScreen.style.display = 'none';
    panel.style.display       = 'flex';
    if (usuario && $('cfg-admin-user')) $('cfg-admin-user').value = usuario;
    initPanel();
  }

  var _panelInit = false;
  function initPanel() {
    if (_panelInit) return;
    _panelInit = true;

    $('btn-logout').addEventListener('click', doLogout);
    $('menu-toggle').addEventListener('click', function () { $('sidebar').classList.toggle('open'); });

    document.querySelectorAll('.adm-nav-item[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () { irPara(btn.dataset.section); });
    });

    var tBusca;
    $('busca-clientes').addEventListener('input', function () { var v = this.value; clearTimeout(tBusca); tBusca = setTimeout(function () { renderClientes(v); }, 250); });
    $('busca-pedidos').addEventListener('input', function () { var v = this.value; clearTimeout(tBusca); tBusca = setTimeout(function () { renderPedidos(v, $('filtro-status').value); }, 250); });
    $('filtro-status').addEventListener('change', function () { renderPedidos($('busca-pedidos').value, this.value); });
    $('busca-produtos').addEventListener('input', function () { var v = this.value; clearTimeout(tBusca); tBusca = setTimeout(function () { renderProdutos(v); }, 250); });

    initFormsConfig();
    initMercadoLivreConfig();
    initProdutoModal();
    initConfirmarModal();
    initAnuncios();
    initImportarML();
    initCrm();

    /* fecha modais clicando fora ou com ESC */
    document.querySelectorAll('.adm-modal-overlay').forEach(function (ov) {
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.style.display = 'none'; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.adm-modal-overlay, .db-date-overlay').forEach(function (ov) { ov.style.display = 'none'; });
    });

    renderSection('dashboard');
  }

  function irPara(sec) {
    var btn = document.querySelector('.adm-nav-item[data-section="' + sec + '"]');
    if (!btn) return;
    document.querySelectorAll('.adm-nav-item').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.adm-section').forEach(function (s) { s.classList.remove('active'); });
    btn.classList.add('active');
    $('sec-' + sec).classList.add('active');
    $('topbar-title').textContent = btn.querySelector('span').textContent.trim();
    $('sidebar').classList.remove('open');
    renderSection(sec);
  }

  function renderSection(sec) {
    if (sec === 'dashboard') renderDashboard();
    if (sec === 'clientes')  renderClientes($('busca-clientes').value);
    if (sec === 'pedidos')   renderPedidos($('busca-pedidos').value, $('filtro-status').value);
    if (sec === 'produtos')  renderProdutos($('busca-produtos').value);
    if (sec === 'anuncios')  { fecharEditorAnuncio(); }
    if (sec === 'crm')       renderCrmAbaAtual();
  }

  /* ══════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════ */
  var STATUS_CORES = { 'Aguardando':'#f59e0b', 'Confirmado':'#3b82f6', 'Enviado':'#8b5cf6', 'Entregue':'#10b981', 'Cancelado':'#ef4444' };
  var STATUS_ICONES = { 'Aguardando':'ti-clock', 'Confirmado':'ti-circle-check', 'Enviado':'ti-truck', 'Entregue':'ti-package', 'Cancelado':'ti-x' };

  function renderDashboard() {
    carregarPeriodo(_periodoAtual, _customDe, _customAte);

    Promise.all([
      api('GET', '/clientes'),
      api('GET', '/pedidos'),
      api('GET', '/produtos'),
      api('GET', '/anuncios'),
      api('GET', '/visitas').catch(function () { return null; })
    ]).then(function (res) {
      var clientes = res[0], pedidos = res[1], produtos = res[2], anuncios = res[3], visitas = res[4];

      /* ── Card clientes ── */
      $('dash-clientes').textContent = clientes.length;
      var serieCli = [];
      for (var i = 11; i >= 0; i--) {
        var lim = isoHoje(-i);
        serieCli.push(clientes.filter(function (c) { return c.criadoEm && new Date(c.criadoEm).toLocaleDateString('en-CA') <= lim; }).length);
      }
      drawSparkline('spark-clientes', serieCli, corLinha());
      var novosHoje  = clientes.filter(function (c) { return c.criadoEm && new Date(c.criadoEm).toLocaleDateString('en-CA') === isoHoje(); }).length;
      var novosOntem = clientes.filter(function (c) { return c.criadoEm && new Date(c.criadoEm).toLocaleDateString('en-CA') === isoHoje(-1); }).length;
      setDeltaTexto('delta-clientes', novosHoje > 0, novosHoje > 0 ? '+' + novosHoje + ' hoje' : 'nenhum novo hoje', '(ontem: ' + novosOntem + ')');

      /* ── Card visitantes ── */
      if (visitas) {
        $('dash-visitantes').textContent = visitas.hoje;
        drawSparkline('spark-visitantes', visitas.serie, corLinha());
        setDelta('delta-visitantes', visitas.delta);
      }

      /* ── Últimos Pedidos ── */
      var ul = $('dash-ultimos-pedidos');
      ul.innerHTML = pedidos.length === 0
        ? '<div class="db-list-empty"><i class="ti ti-shopping-bag"></i><span>Nenhum pedido ainda.</span></div>'
        : pedidos.slice(-6).reverse().map(function (p) {
            var cor = STATUS_CORES[p.status] || '#94a3b8';
            var ico = STATUS_ICONES[p.status] || 'ti-circle';
            return '<div class="db-list-item">' +
              '<div class="db-list-avatar" style="background:' + cor + '22;color:' + cor + '"><i class="ti ' + ico + '"></i></div>' +
              '<div class="db-list-body">' +
                '<div class="db-list-title">' + esc(p.cliente) + '</div>' +
                '<div class="db-list-sub">' + esc(p.id) + ' · ' + fmtISO(p.data) + '</div>' +
              '</div>' +
              '<div class="db-list-right">' +
                '<div class="db-list-value">' + fmtR(p.total) + '</div>' +
                '<span class="db-list-badge" style="background:' + cor + '22;color:' + cor + '">' + esc(p.status || '–') + '</span>' +
              '</div>' +
            '</div>';
          }).join('');

      /* ── Últimos Clientes ── */
      var avatarColors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
      var uc = $('dash-ultimos-clientes');
      uc.innerHTML = clientes.length === 0
        ? '<div class="db-list-empty"><i class="ti ti-users"></i><span>Nenhum cliente cadastrado.</span></div>'
        : clientes.slice(-6).reverse().map(function (c, i) {
            var pedsCli = pedidos.filter(function (p) { return p.email === c.email; }).length;
            return '<div class="db-list-item">' +
              '<div class="db-list-avatar db-list-avatar--letter" style="background:' + avatarColors[i % avatarColors.length] + '">' + esc((c.nome || '?')[0].toUpperCase()) + '</div>' +
              '<div class="db-list-body">' +
                '<div class="db-list-title">' + esc(c.nome) + '</div>' +
                '<div class="db-list-sub">' + esc(c.email) + '</div>' +
              '</div>' +
              '<div class="db-list-right">' +
                '<div class="db-list-value">' + pedsCli + ' pedido' + (pedsCli !== 1 ? 's' : '') + '</div>' +
                '<div class="db-list-sub">' + fmtDataHora(c.criadoEm) + '</div>' +
              '</div>' +
            '</div>';
          }).join('');

      /* ── Mais Vendidos ── */
      var vendas = vendasPorProduto(pedidos);
      var topArr = Object.keys(vendas).map(function (k) { return vendas[k]; })
        .sort(function (a, b) { return b.qtd - a.qtd; }).slice(0, 6);
      var maxQtd = topArr.length ? topArr[0].qtd : 1;
      var cores  = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4'];
      $('top-produtos').innerHTML = topArr.length === 0
        ? '<div class="db-list-empty"><i class="ti ti-star"></i><span>Nenhuma venda registrada.</span></div>'
        : topArr.map(function (t, i) {
            var cor = cores[i % cores.length];
            return '<div class="db-list-item db-list-item--rank">' +
              '<div class="db-rank-num" style="color:' + cor + '">#' + (i + 1) + '</div>' +
              '<div class="db-list-body">' +
                '<div class="db-list-title">' + esc(t.nome) + '</div>' +
                '<div class="db-bar-wrap"><div class="db-bar-fill" style="width:' + Math.round((t.qtd / maxQtd) * 100) + '%;background:' + cor + '"></div></div>' +
              '</div>' +
              '<div class="db-list-right"><div class="db-list-value">' + t.qtd + ' vd.</div></div>' +
            '</div>';
          }).join('');

      /* ── Tabela de produtos ── */
      carregarBSP(anuncios, produtos, vendas);
    }).catch(function (err) { console.error('Dashboard:', err.message); });
  }

  /* ── Sparkline ── */
  function drawSparkline(id, data, color) {
    var c = $(id);
    if (!c || !data || !data.length) return;
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (data.length < 2) data = [data[0], data[0]];
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var range = max - min || 1;
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '66');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    data.forEach(function (v, i) {
      var x = (i / (data.length - 1)) * W;
      var y = max === min ? H / 2 : H - ((v - min) / range) * (H - 6) - 3;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
  }

  function setDeltaTexto(id, up, destaque, resto) {
    var el = $(id);
    if (!el) return;
    el.className = 'db-metric-delta ' + (up ? 'db-delta-up' : '');
    el.innerHTML = '<i class="ti ti-' + (up ? 'trending-up' : 'minus') + '"></i> <span>' + esc(destaque) + '</span> ' + esc(resto || '');
  }

  function setDelta(id, val) {
    var el = $(id);
    if (!el) return;
    if (val === null || val === undefined) { el.innerHTML = '<i class="ti ti-minus"></i> sem dados de ontem'; el.className = 'db-metric-delta'; return; }
    var n = parseFloat(val), up = n >= 0;
    el.className = 'db-metric-delta ' + (up ? 'db-delta-up' : 'db-delta-down');
    el.innerHTML = '<i class="ti ti-trending-' + (up ? 'up' : 'down') + '"></i> <span>' + (up ? '+' : '') + n.toLocaleString('pt-BR') + '%</span> em relação a ontem';
  }

  /* ── Analytics / gráficos ── */
  var chartVendasInst = null, chartStatusInst = null, _ultimoAnalytics = null;
  var _periodoAtual = 'mes', _modoAtual = 'receita', _customDe = '', _customAte = '';

  function escuro() { return document.body.classList.contains('dark'); }
  function corLinha() { return escuro() ? '#38bdf8' : '#0038a7'; }

  function carregarPeriodo(periodo, de, ate) {
    _periodoAtual = periodo; _customDe = de || ''; _customAte = ate || '';
    var el = $('chart-vendas');
    if (el) el.style.opacity = '.4';
    var url = '/pedidos/analytics?periodo=' + periodo + (periodo === 'custom' ? '&de=' + de + '&ate=' + ate : '');
    api('GET', url).then(function (data) {
      _ultimoAnalytics = data;
      desenharAnalytics();
    }).catch(function (e) { console.error('analytics:', e.message); })
      .then(function () { if (el) el.style.opacity = '1'; });
  }

  function desenharAnalytics() {
    var data = _ultimoAnalytics;
    if (!data || !window.Chart) return;
    buildLineChart(data.labels, _modoAtual === 'pedidos' ? data.qtds : data.totais);
    buildStatusChart(data.statusCounts);

    $('dash-faturamento').textContent = fmtR(data.receitaHoje);
    $('dash-pedidos').textContent     = data.pedidosHoje;
    setDelta('delta-faturamento', data.deltaReceita);
    setDelta('delta-pedidos',     data.deltaPedidos);
    drawSparkline('spark-faturamento', data.totais, corLinha());
    drawSparkline('spark-pedidos',     data.qtds,   corLinha());

    var sub = $('db-chart-sub-vendas');
    if (sub) {
      sub.textContent = (_modoAtual === 'pedidos' ? data.totalPedidos + ' pedido(s)' : fmtR(data.totalReceita)) +
        ' · ' + fmtISO(data.inicio) + (data.inicio !== data.fim ? ' a ' + fmtISO(data.fim) : '');
    }
  }

  function buildLineChart(labels, dados) {
    var el = $('chart-vendas');
    if (!el) return;
    if (chartVendasInst) { chartVendasInst.destroy(); chartVendasInst = null; }
    var dark  = escuro();
    var color = _modoAtual === 'pedidos' ? '#6366f1' : corLinha();
    var rgb   = _modoAtual === 'pedidos' ? '99,102,241' : (dark ? '56,189,248' : '0,56,167');
    var gradient = el.getContext('2d').createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(' + rgb + ',.18)');
    gradient.addColorStop(1, 'rgba(' + rgb + ',.01)');
    var grid = dark ? 'rgba(255,255,255,.05)' : '#f1f5f9';
    var tick = dark ? '#64748b' : '#9ca3af';
    var modo = _modoAtual;

    chartVendasInst = new Chart(el, {
      type: 'line',
      data: {
        labels: labels.map(function (l) { var p = l.split('-'); return p[2] + '/' + p[1]; }),
        datasets: [{
          label: modo === 'pedidos' ? 'Pedidos' : 'Receita (R$)',
          data: dados, borderColor: color, backgroundColor: gradient, borderWidth: 2.5,
          pointRadius: labels.length <= 14 ? 3 : 0, pointHoverRadius: 6, pointBackgroundColor: color,
          tension: 0.35, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: dark ? '#0f172a' : '#fff', titleColor: dark ? '#94a3b8' : '#6b7280', bodyColor: dark ? '#f1f5f9' : '#111',
            borderColor: dark ? 'rgba(255,255,255,.1)' : '#e5e7eb', borderWidth: 1, padding: 12, cornerRadius: 10,
            callbacks: { label: function (c) { return modo === 'pedidos' ? '  ' + c.parsed.y + ' pedido(s)' : '  ' + fmtR(c.parsed.y); } }
          }
        },
        scales: {
          x: { grid: { color: grid }, ticks: { color: tick, font: { size: 11 }, maxTicksLimit: 12 } },
          y: {
            beginAtZero: true, grid: { color: grid },
            ticks: {
              color: tick, font: { size: 11 }, precision: modo === 'pedidos' ? 0 : undefined,
              callback: function (v) { return modo === 'pedidos' ? v : (v >= 1000 ? 'R$' + (v / 1000).toFixed(1).replace('.0', '') + 'K' : 'R$' + v); }
            }
          }
        }
      }
    });
  }

  function buildStatusChart(statusCounts) {
    var el = $('chart-status');
    if (!el) return;
    if (chartStatusInst) { chartStatusInst.destroy(); chartStatusInst = null; }
    var keys  = Object.keys(statusCounts || {});
    var vals  = keys.map(function (k) { return statusCounts[k]; });
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var cores = keys.map(function (k) { return STATUS_CORES[k] || '#94a3b8'; });
    var leg   = $('db-legend-status');

    if (!total) {
      if (leg) leg.innerHTML = '<div class="db-legend-item" style="color:#9ca3af">Nenhum pedido ainda.</div>';
      return;
    }

    chartStatusInst = new Chart(el, {
      type: 'doughnut',
      data: { labels: keys, datasets: [{ data: vals, backgroundColor: cores, borderWidth: 0, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#1e293b', titleColor: '#94a3b8', bodyColor: '#f1f5f9', padding: 10, cornerRadius: 10 }
        }
      }
    });

    if (leg) leg.innerHTML = keys.map(function (k, i) {
      return '<div class="db-legend-item">' +
        '<div class="db-legend-dot" style="background:' + cores[i] + '"></div>' + esc(k) +
        '<span style="margin-left:auto;font-weight:700">' + statusCounts[k] +
        ' <small style="color:#9ca3af;font-weight:400">(' + Math.round((statusCounts[k] / total) * 100) + '%)</small></span>' +
        '</div>';
    }).join('');
  }

  window.mudarPeriodo = function (btn) {
    var p = btn.dataset.period;
    if (p === 'custom') {
      if (!$('db-date-de').value) $('db-date-de').value = isoHoje(-30);
      if (!$('db-date-ate').value) $('db-date-ate').value = isoHoje();
      $('db-date-overlay').style.display = 'flex';
      return;
    }
    document.querySelectorAll('.db-period').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    carregarPeriodo(p);
  };

  window.alternarModo = function (btn) {
    _modoAtual = btn.dataset.modo;
    document.querySelectorAll('.db-modo-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    desenharAnalytics();
  };

  window.fecharDatePicker = function () { $('db-date-overlay').style.display = 'none'; };

  window.aplicarPeriodoCustom = function () {
    var de = $('db-date-de').value, ate = $('db-date-ate').value;
    if (!de || !ate) { alert('Selecione as duas datas.'); return; }
    if (de > ate)    { alert('A data inicial deve ser anterior à final.'); return; }
    window.fecharDatePicker();
    document.querySelectorAll('.db-period').forEach(function (b) { b.classList.remove('active'); });
    document.querySelector('.db-period[data-period="custom"]').classList.add('active');
    carregarPeriodo('custom', de, ate);
  };

  /* ── Tabela "Produtos Mais Vendidos" ── */
  var _bspTodos = [], _bspFiltrado = [], _bspSort = 'vendas', _bspFiltro = 'todos', _bspPagina = 1, _bspPorPag = 8;

  function proxySrc(src) {
    if (!src) return '';
    return src.indexOf('mlstatic.com') !== -1 ? '/api/ml/img?url=' + encodeURIComponent(src) : src;
  }

  function precoFinal(p) {
    var preco = num(p.preco), desc = num(p.desconto);
    return desc > 0 ? preco * (1 - desc / 100) : preco;
  }

  function carregarBSP(anuncios, produtos, vendas) {
    var todos = anuncios.map(function (a) { return Object.assign({ _tipo: 'anuncio' }, a); })
      .concat(produtos.map(function (p) { return Object.assign({ _tipo: 'produto' }, p); }));
    todos.forEach(function (p) {
      var v = vendas[String(p.titulo || p.nome || '').trim().toLowerCase()];
      p._vendas = v ? v.qtd : 0;
    });
    _bspTodos = todos;
    aplicarFiltroSort();
  }

  function statusInfo(estoque) {
    var n = parseInt(estoque, 10) || 0;
    if (n === 0) return { cls: 'bsp-badge--out', txt: 'Sem Estoque', icon: 'ti-x' };
    if (n <= 5)  return { cls: 'bsp-badge--low', txt: 'Reposição',  icon: 'ti-alert-triangle' };
    return            { cls: 'bsp-badge--in',  txt: 'Em Estoque', icon: 'ti-circle-check' };
  }

  function renderTabelaBSP() {
    var tbody = $('bsp-tbody');
    var inicio = (_bspPagina - 1) * _bspPorPag;
    var pagina = _bspFiltrado.slice(inicio, inicio + _bspPorPag);
    var maxVendas = Math.max.apply(null, [1].concat(_bspFiltrado.map(function (p) { return p._vendas || 0; })));

    if (!pagina.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="bsp-loading"><i class="ti ti-search-off"></i> Nenhum produto encontrado.</td></tr>';
    } else {
      tbody.innerHTML = pagina.map(function (p) {
        var img  = proxySrc(p.fotos && p.fotos[0] ? p.fotos[0] : (p.imagem || ''));
        var nome = p.titulo || p.nome || 'Produto';
        var est  = parseInt(p.estoque, 10) || 0;
        var st   = statusInfo(est);
        return '<tr>' +
          '<td class="bsp-id">#' + esc(String(p.id).slice(-6)) + '</td>' +
          '<td>' + (img
            ? '<img class="bsp-img" src="' + esc(img) + '" alt="" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
              '<div class="bsp-img-placeholder" style="display:none"><i class="ti ti-photo"></i></div>'
            : '<div class="bsp-img-placeholder"><i class="ti ti-photo"></i></div>') + '</td>' +
          '<td><div class="bsp-name" title="' + esc(nome) + '">' + esc(nome.length > 38 ? nome.substring(0, 38) + '…' : nome) + '</div>' +
            ((p.marca || p.categoria) ? '<div class="bsp-name-sub">' + esc(p.marca || p.categoria) + '</div>' : '') + '</td>' +
          '<td class="bsp-price">' + fmtR(precoFinal(p)) + '</td>' +
          '<td><div class="bsp-sales">' + (p._vendas || 0) + '</div>' +
            '<div class="bsp-sales-bar"><div class="bsp-sales-fill" style="width:' + Math.round(((p._vendas || 0) / maxVendas) * 100) + '%"></div></div></td>' +
          '<td class="bsp-stock">' + est + '</td>' +
          '<td><span class="bsp-badge ' + st.cls + '"><i class="ti ' + st.icon + '"></i> ' + st.txt + '</span></td>' +
          '<td><button class="bsp-action-btn" title="Editar" data-bsp-tipo="' + p._tipo + '" data-bsp-id="' + esc(p.id) + '"><i class="ti ti-pencil"></i></button></td>' +
        '</tr>';
      }).join('');
      tbody.querySelectorAll('[data-bsp-id]').forEach(function (b) {
        b.addEventListener('click', function () { bspEditar(b.dataset.bspTipo, b.dataset.bspId); });
      });
    }

    $('bsp-count').textContent = _bspFiltrado.length + ' produto' + (_bspFiltrado.length !== 1 ? 's' : '');
    var total = Math.ceil(_bspFiltrado.length / _bspPorPag);
    var html = '';
    if (total > 1) for (var i = 1; i <= total; i++) {
      html += '<button class="bsp-page-btn' + (i === _bspPagina ? ' active' : '') + '" onclick="irPaginaBSP(' + i + ')">' + i + '</button>';
    }
    $('bsp-pagination').innerHTML = html;
  }

  function bspEditar(tipo, id) {
    if (tipo === 'anuncio') {
      irPara('anuncios');
      api('GET', '/anuncios/' + id).then(abrirEditorAnuncio).catch(alertErro);
    } else {
      api('GET', '/produtos/' + id).then(abrirModalProduto).catch(alertErro);
    }
  }

  function aplicarFiltroSort() {
    var q = ($('bsp-search').value || '').toLowerCase();
    var list = _bspTodos.filter(function (p) {
      var est = parseInt(p.estoque, 10) || 0;
      if (_bspFiltro === 'em_estoque'  && !(est > 5)) return false;
      if (_bspFiltro === 'sem_estoque' && est !== 0) return false;
      if (_bspFiltro === 'reposicao'   && !(est > 0 && est <= 5)) return false;
      return !q || ((p.titulo || p.nome || '') + ' ' + (p.marca || '')).toLowerCase().indexOf(q) !== -1;
    });
    list.sort(function (a, b) {
      if (_bspSort === 'preco')   return precoFinal(b) - precoFinal(a);
      if (_bspSort === 'estoque') return num(b.estoque) - num(a.estoque);
      if (_bspSort === 'nome')    return (a.titulo || a.nome || '').localeCompare(b.titulo || b.nome || '');
      return (b._vendas || 0) - (a._vendas || 0);
    });
    _bspFiltrado = list;
    _bspPagina   = 1;
    renderTabelaBSP();
  }

  window.filtrarBSP  = aplicarFiltroSort;
  window.irPaginaBSP = function (n) { _bspPagina = n; renderTabelaBSP(); };
  window.setSortBSP  = function (val, label) {
    _bspSort = val;
    $('bsp-sort-label').textContent = label;
    $('bsp-sort-menu').style.display = 'none';
    aplicarFiltroSort();
  };
  window.setFilterBSP = function (val, label) {
    _bspFiltro = val;
    $('bsp-filter-label').textContent = label;
    $('bsp-filter-menu').style.display = 'none';
    aplicarFiltroSort();
  };
  window.toggleBSPSort = function () {
    var m = $('bsp-sort-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
    $('bsp-filter-menu').style.display = 'none';
  };
  window.toggleBSPFilter = function () {
    var m = $('bsp-filter-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
    $('bsp-sort-menu').style.display = 'none';
  };
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#bsp-sort-wrap'))   $('bsp-sort-menu').style.display   = 'none';
    if (!e.target.closest('#bsp-filter-wrap')) $('bsp-filter-menu').style.display = 'none';
  });

  /* ══════════════════════════════════════════════
     CLIENTES
  ══════════════════════════════════════════════ */
  function renderClientes(filtro) {
    var url = '/clientes' + (filtro ? '?q=' + encodeURIComponent(filtro) : '');
    api('GET', url).then(function (clientes) {
      var tbody = $('tbody-clientes');
      var vazio = $('clientes-vazio');
      if (clientes.length === 0) {
        tbody.innerHTML = '';
        vazio.textContent = filtro ? 'Nenhum cliente encontrado para "' + filtro + '".' : 'Nenhum cliente cadastrado ainda.';
        vazio.style.display = 'block';
        return;
      }
      vazio.style.display = 'none';
      tbody.innerHTML = clientes.map(function (c, i) {
        var tel = String(c.telefone || '').replace(/\D/g, '');
        return '<tr><td>' + (i + 1) + '</td><td><strong>' + esc(c.nome) + '</strong></td><td>' + esc(c.email) + '</td>' +
          '<td>' + esc(c.cpf || '—') + '</td><td>' + esc(c.telefone || '—') + '</td>' +
          '<td><span class="adm-badge ' + (c.newsletter ? 'adm-badge--green' : '') + '">' + (c.newsletter ? 'Sim' : 'Não') + '</span></td>' +
          '<td>' + fmtDataHora(c.criadoEm) + '</td>' +
          '<td>' +
            (tel ? '<a class="adm-btn-icon" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '" target="_blank" rel="noopener" title="WhatsApp"><i class="ti ti-brand-whatsapp"></i></a>' : '') +
            '<button class="adm-btn-icon" data-lead="' + esc(c.id) + '" title="Adicionar ao funil do CRM"><i class="ti ti-filter-plus"></i></button>' +
            '<button class="adm-btn-icon adm-btn-icon--red" data-del="' + esc(c.id) + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
          '</td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-lead]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var c = clientes.find(function (x) { return String(x.id) === btn.dataset.lead; });
          if (!c) return;
          irPara('crm');
          abrirAbaCrm('funil');
          window.abrirModalLead('contato', { nome: c.nome, email: c.email, tel: c.telefone });
        });
      });
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.del;
          confirmar(function () { api('DELETE', '/clientes/' + id).then(function () { renderClientes(filtro); }).catch(alertErro); });
        });
      });
    }).catch(function (err) { console.error('Clientes:', err.message); });
  }

  /* ══════════════════════════════════════════════
     PEDIDOS
  ══════════════════════════════════════════════ */
  var STATUS_LIST = ['Aguardando', 'Confirmado', 'Enviado', 'Entregue', 'Cancelado'];

  function renderPedidos(filtro, statusFiltro) {
    var url = '/pedidos?x=1' + (filtro ? '&q=' + encodeURIComponent(filtro) : '') + (statusFiltro ? '&status=' + encodeURIComponent(statusFiltro) : '');
    Promise.all([api('GET', url), api('GET', '/clientes')]).then(function (res) {
      var pedidos = res[0].slice().reverse(), clientes = res[1];
      var telPorEmail = {};
      clientes.forEach(function (c) { telPorEmail[(c.email || '').toLowerCase()] = String(c.telefone || '').replace(/\D/g, ''); });

      var tbody = $('tbody-pedidos');
      var vazio = $('pedidos-vazio');
      if (pedidos.length === 0) { tbody.innerHTML = ''; vazio.style.display = 'block'; return; }
      vazio.style.display = 'none';
      tbody.innerHTML = pedidos.map(function (p) {
        var opts = STATUS_LIST.map(function (s) { return '<option value="' + s + '"' + (s === p.status ? ' selected' : '') + '>' + s + '</option>'; }).join('');
        var tel  = telPorEmail[(p.email || '').toLowerCase()];
        var msg  = encodeURIComponent('Olá ' + String(p.cliente || '').split(' ')[0] + ', sobre o seu pedido ' + p.id + '...');
        var contato = tel
          ? '<a class="adm-btn-icon" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '?text=' + msg + '" target="_blank" rel="noopener" title="WhatsApp do cliente"><i class="ti ti-brand-whatsapp"></i></a>'
          : '<a class="adm-btn-icon" href="mailto:' + esc(p.email) + '?subject=' + encodeURIComponent('Pedido ' + p.id) + '" title="E-mail do cliente"><i class="ti ti-mail"></i></a>';
        return '<tr><td><strong>' + esc(p.id) + '</strong></td>' +
          '<td>' + esc(p.cliente) + '<br><small>' + esc(p.email) + '</small></td>' +
          '<td>' + esc(Array.isArray(p.produtos) ? itensDoPedido(p).map(function (i) { return i.nome + (i.qtd > 1 ? ' x' + i.qtd : ''); }).join(', ') : p.produtos) +
            (p.obs ? '<br><small title="Observação do cliente"><i class="ti ti-message"></i> ' + esc(p.obs) + '</small>' : '') + '</td>' +
          '<td><strong>' + fmtR(p.total) + '</strong>' + (p.metodoPagamento ? '<br><small>' + esc(p.metodoPagamento) + '</small>' : '') + '</td>' +
          '<td>' + fmtISO(p.data) + '</td>' +
          '<td><select class="adm-status-select status-' + esc(String(p.status || '').toLowerCase()) + '" data-pid="' + esc(p.id) + '">' + opts + '</select></td>' +
          '<td>' + contato +
            '<button class="adm-btn-icon adm-btn-icon--red" data-del-ped="' + esc(p.id) + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
          '</td></tr>';
      }).join('');
      tbody.querySelectorAll('.adm-status-select').forEach(function (sel) {
        var anterior = sel.value;
        sel.addEventListener('change', function () {
          api('PUT', '/pedidos/' + encodeURIComponent(sel.dataset.pid) + '/status', { status: sel.value })
            .then(function () { anterior = sel.value; sel.className = 'adm-status-select status-' + sel.value.toLowerCase(); })
            .catch(function (err) { sel.value = anterior; alertErro(err); });
        });
      });
      tbody.querySelectorAll('[data-del-ped]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = btn.dataset.delPed;
          confirmar(function () { api('DELETE', '/pedidos/' + encodeURIComponent(pid)).then(function () { renderPedidos(filtro, statusFiltro); }).catch(alertErro); });
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
      var tbody = $('tbody-produtos');
      if (!produtos.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:24px">' +
          (filtro ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado. Os itens da loja ficam em "Anúncios".') + '</td></tr>';
        return;
      }
      tbody.innerHTML = produtos.map(function (p) {
        var desc = num(p.desconto), est = parseInt(p.estoque, 10) || 0;
        return '<tr><td>' + esc(String(p.id).slice(-6)) + '</td>' +
          '<td><strong>' + esc(p.nome) + '</strong>' + (p.marca ? '<br><small>' + esc(p.marca) + '</small>' : '') + '</td>' +
          '<td>' + esc(p.categoria || '—') + '</td>' +
          '<td>' + fmtR(precoFinal(p)) + '</td>' +
          '<td>' + (desc > 0 ? '<span class="adm-badge adm-badge--red">-' + desc + '%</span>' : '—') + '</td>' +
          '<td>' + (est <= 3 ? '<span style="color:#ef4444;font-weight:700">' + est + '</span>' : est) + '</td>' +
          '<td><span class="adm-badge ' + (p.status === 'ativo' ? 'adm-badge--green' : 'adm-badge--gray') + '">' + esc(p.status || '—') + '</span></td>' +
          '<td>' +
            '<button class="adm-btn-icon" data-edit="' + esc(p.id) + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
            '<button class="adm-btn-icon adm-btn-icon--red" data-del="' + esc(p.id) + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
          '</td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () { api('GET', '/produtos/' + btn.dataset.edit).then(abrirModalProduto).catch(alertErro); });
      });
      tbody.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.del;
          confirmar(function () { api('DELETE', '/produtos/' + id).then(function () { renderProdutos(filtro); }).catch(alertErro); });
        });
      });
    }).catch(function (err) { console.error('Produtos:', err.message); });
  }

  function initProdutoModal() {
    $('btn-novo-produto').addEventListener('click', function () { abrirModalProduto(null); });
    $('btn-fechar-produto').addEventListener('click', fecharModalProduto);
    $('btn-cancelar-produto').addEventListener('click', fecharModalProduto);
    $('form-produto').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = this, id = f.id.value;
      var obj = {
        nome: f.nome.value.trim(), categoria: f.categoria.value, marca: f.marca.value.trim(),
        preco: num(f.preco.value), desconto: parseInt(f.desconto.value, 10) || 0,
        estoque: parseInt(f.estoque.value, 10) || 0, status: f.status.value,
        imagem: f.imagem.value.trim(), descricao: f.descricao.value.trim()
      };
      var req = id ? api('PUT', '/produtos/' + id, obj) : api('POST', '/produtos', obj);
      req.then(function () {
        fecharModalProduto();
        if ($('sec-produtos').classList.contains('active')) renderProdutos($('busca-produtos').value);
        if ($('sec-dashboard').classList.contains('active')) renderDashboard();
      }).catch(alertErro);
    });
  }

  function abrirModalProduto(p) {
    var f = $('form-produto');
    f.reset();
    f.id.value = '';
    $('modal-produto-title').textContent = p ? 'Editar Produto' : 'Novo Produto';
    if (p) {
      f.id.value = p.id; f.nome.value = p.nome || ''; f.categoria.value = p.categoria || 'Protocolos';
      f.marca.value = p.marca || ''; f.preco.value = p.preco || ''; f.desconto.value = p.desconto || 0;
      f.estoque.value = p.estoque || 0; f.status.value = p.status || 'ativo';
      f.imagem.value = p.imagem || ''; f.descricao.value = p.descricao || '';
    }
    $('modal-produto').style.display = 'flex';
  }
  function fecharModalProduto() { $('modal-produto').style.display = 'none'; }

  /* ══════════════════════════════════════════════
     MODAL CONFIRMAR
  ══════════════════════════════════════════════ */
  var _cb = null;
  function initConfirmarModal() {
    $('btn-cancel-del').addEventListener('click', function () { $('modal-confirmar').style.display = 'none'; });
    $('btn-confirm-del').addEventListener('click', function () { $('modal-confirmar').style.display = 'none'; if (_cb) _cb(); _cb = null; });
  }
  function confirmar(cb) { _cb = cb; $('modal-confirmar').style.display = 'flex'; }

  /* ══════════════════════════════════════════════
     ANÚNCIOS
  ══════════════════════════════════════════════ */
  var _anuncioFotos  = [];
  var _anuncioEditId = null;

  var AN_FIELDS = ['titulo','categoria','status','marca','linha','modelo','modelo-alfa',
    'preco','desconto','estoque','fabricante','descricao','formato','carga-horaria','nivel',
    'certificado','kiwify-checkout-url'];

  function anGet(id) { return $('an-' + id); }
  function anVal(id) { var el = anGet(id); return el ? el.value : ''; }
  function camel(f)  { return f.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }

  function initAnuncios() {
    $('btn-novo-anuncio').addEventListener('click', function () { abrirEditorAnuncio(null); });
    $('btn-voltar-anuncios').addEventListener('click', fecharEditorAnuncio);
    $('btn-salvar-anuncio').addEventListener('click', salvarAnuncio);
    var tB;
    $('busca-anuncios').addEventListener('input', function () { var v = this.value; clearTimeout(tB); tB = setTimeout(function () { renderAnuncios(v); }, 250); });

    var fileInput = $('anuncio-file-input');
    $('btn-upload-foto').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = Array.from(this.files);
      var msg = $('anuncio-save-msg');
      msg.textContent = 'Enviando ' + files.length + ' foto(s)...'; msg.style.color = '#2563eb';
      var erros = [];
      var uploads = files.map(function (file) {
        var fd = new FormData(); fd.append('foto', file);
        return fetch(API + '/anuncios/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getAdminToken() }, body: fd })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (r.status === 401) sessaoExpirada(); return d; }); })
          .then(function (d) { if (d.url) _anuncioFotos.push(d.url); else erros.push(file.name + ': ' + (d.error || 'falhou')); })
          .catch(function () { erros.push(file.name + ': erro de rede'); });
      });
      Promise.all(uploads).then(function () {
        renderFotos(); atualizarPrevia();
        if (erros.length) { msg.textContent = erros.join(' · '); msg.style.color = '#ef4444'; }
        else { msg.textContent = '✓ Foto(s) adicionada(s) — clique em Salvar'; msg.style.color = '#16a34a'; }
      });
      this.value = '';
    });

    $('btn-add-foto-url').addEventListener('click', function () {
      var url = $('anuncio-url-input').value.trim();
      if (!url) return;
      if (!/^(https?:\/\/|\/)/.test(url)) { alert('Informe uma URL começando com http:// ou https://'); return; }
      _anuncioFotos.push(url);
      $('anuncio-url-input').value = '';
      renderFotos(); atualizarPrevia();
    });
    $('anuncio-url-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('btn-add-foto-url').click(); } });

    ['an-titulo','an-marca','an-preco','an-desconto','an-status'].forEach(function (id) {
      var el = $(id);
      if (el) { el.addEventListener('input', atualizarPrevia); el.addEventListener('change', atualizarPrevia); }
    });
  }

  function abrirEditorAnuncio(anuncio) {
    _anuncioFotos  = anuncio ? (anuncio.fotos || []).slice() : [];
    _anuncioEditId = anuncio ? anuncio.id : null;
    AN_FIELDS.forEach(function (f) {
      var el = anGet(f); if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = (f === 'desconto' || f === 'estoque') ? '0' : '';
      if (anuncio) {
        var v = anuncio[camel(f)] !== undefined ? anuncio[camel(f)] : anuncio[f];
        if (v !== undefined && v !== null) el.value = v;
      }
    });
    $('editor-anuncio-titulo').textContent = anuncio ? 'Editar Anúncio' : 'Novo Anúncio';
    $('anuncio-save-msg').textContent = '';
    renderFotos(); atualizarPrevia();
    $('anuncios-list-view').style.display   = 'none';
    $('anuncios-editor-view').style.display = 'block';
  }

  function fecharEditorAnuncio() {
    $('anuncios-editor-view').style.display = 'none';
    $('anuncios-list-view').style.display   = 'block';
    renderAnuncios($('busca-anuncios').value);
  }

  function salvarAnuncio() {
    var titulo = anVal('titulo').trim();
    var msg    = $('anuncio-save-msg');
    if (!titulo) { msg.textContent = 'Informe o título do anúncio.'; msg.style.color = '#ef4444'; return; }
    var url = anVal('kiwify-checkout-url').trim();
    if (url && !/^https?:\/\//.test(url)) { msg.textContent = 'O link da Kiwify deve começar com https://'; msg.style.color = '#ef4444'; return; }

    var obj = { fotos: _anuncioFotos.slice() };
    AN_FIELDS.forEach(function (f) { obj[camel(f)] = anVal(f).trim ? anVal(f).trim() : anVal(f); });
    obj.titulo = titulo;

    var btn = $('btn-salvar-anuncio');
    btn.disabled = true;
    var req = _anuncioEditId ? api('PUT', '/anuncios/' + _anuncioEditId, obj) : api('POST', '/anuncios', obj);
    req.then(function (saved) {
      _anuncioEditId = saved.id;
      $('editor-anuncio-titulo').textContent = 'Editar Anúncio';
      msg.textContent = '✓ Anúncio salvo!'; msg.style.color = '#16a34a';
      setTimeout(function () { msg.textContent = ''; }, 2500);
    }).catch(function (err) { msg.textContent = err.message; msg.style.color = '#ef4444'; })
      .then(function () { btn.disabled = false; });
  }

  function renderFotos() {
    var grid = $('anuncio-fotos-grid');
    if (_anuncioFotos.length === 0) { grid.innerHTML = '<div class="anuncio-fotos-empty"><i class="ti ti-photo-off"></i> Nenhuma foto adicionada ainda</div>'; return; }
    grid.innerHTML = _anuncioFotos.map(function (src, i) {
      return '<div class="anuncio-foto-thumb"><img src="' + esc(proxySrc(src)) + '" alt="foto ' + (i + 1) + '">' +
        (i === 0 ? '<div class="foto-capa-label">Capa</div>' : '<button class="anuncio-foto-capa" data-capa="' + i + '" title="Usar como capa" style="position:absolute;left:4px;bottom:4px;font-size:10px;border:none;border-radius:4px;padding:2px 5px;cursor:pointer;background:rgba(0,0,0,.6);color:#fff">Capa</button>') +
        '<button class="anuncio-foto-del" data-fi="' + i + '" title="Remover">×</button></div>';
    }).join('');
    grid.querySelectorAll('.anuncio-foto-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); _anuncioFotos.splice(+btn.dataset.fi, 1); renderFotos(); atualizarPrevia(); });
    });
    grid.querySelectorAll('[data-capa]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var f = _anuncioFotos.splice(+btn.dataset.capa, 1)[0];
        _anuncioFotos.unshift(f);
        renderFotos(); atualizarPrevia();
      });
    });
  }

  function atualizarPrevia() {
    var preco = num(anVal('preco')), desc = parseInt(anVal('desconto'), 10) || 0;
    $('prev-nome').textContent  = anVal('titulo') || 'Nome do produto';
    $('prev-marca').textContent = anVal('marca')  || 'Marca';
    $('prev-preco').textContent = fmtR(desc > 0 ? preco * (1 - desc / 100) : preco);

    var descEl = $('prev-desc');
    if (desc > 0 && preco > 0) { descEl.textContent = fmtR(preco); descEl.style.display = ''; }
    else descEl.style.display = 'none';

    var statusMap = { ativo: { label:'Ativo', color:'#15803d', bg:'#dcfce7' }, destaque: { label:'⭐ Destaque', color:'#b45309', bg:'#fef3c7' }, inativo: { label:'Inativo', color:'#6b7280', bg:'#f3f4f6' } };
    var s = statusMap[anVal('status')] || statusMap.ativo;
    var statusEl = $('prev-status');
    statusEl.textContent = s.label;
    statusEl.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:' + s.bg + ';color:' + s.color;

    $('prev-img').innerHTML = _anuncioFotos.length > 0
      ? '<img src="' + esc(proxySrc(_anuncioFotos[0])) + '" style="width:100%;height:100%;object-fit:cover;display:block">'
      : '<i class="ti ti-photo" style="font-size:40px;color:#ccc"></i>';
  }

  function renderAnuncios(filtro) {
    var url = '/anuncios' + (filtro ? '?q=' + encodeURIComponent(filtro) : '');
    api('GET', url).then(function (anuncios) {
      var grid  = $('anuncios-grid');
      var vazio = $('anuncios-vazio');
      if (anuncios.length === 0) { grid.innerHTML = ''; vazio.style.display = 'block'; return; }
      vazio.style.display = 'none';
      var statusMap = { ativo:'st-ativo', inativo:'st-inativo', destaque:'st-destaque' };
      grid.innerHTML = anuncios.map(function (a, i) {
        var preco = num(a.preco), desc = parseInt(a.desconto, 10) || 0;
        var imgHtml = a.fotos && a.fotos.length > 0
          ? '<img class="anuncio-card-img" src="' + esc(proxySrc(a.fotos[0])) + '" alt="">'
          : '<div class="anuncio-card-img-placeholder"><i class="ti ti-photo"></i></div>';
        return '<div class="anuncio-card" data-id="' + esc(a.id) + '"' + (filtro ? '' : ' draggable="true"') + '>' +
          (filtro ? '' : '<div class="anuncio-card-pos"><i class="ti ti-grip-vertical"></i> <span>' + (i + 1) + 'º</span></div>') + imgHtml +
          '<div class="anuncio-card-body">' +
            '<div class="anuncio-card-marca">' + esc(a.marca || '') + '</div>' +
            '<div class="anuncio-card-nome">' + esc(a.titulo) + '</div>' +
            '<div><span class="anuncio-card-preco">' + fmtR(desc > 0 ? preco * (1 - desc / 100) : preco) + '</span>' +
            (desc > 0 ? '<span class="anuncio-card-desc">' + fmtR(preco) + '</span>' : '') + '</div>' +
          '</div>' +
          '<div class="anuncio-card-footer">' +
            '<span class="anuncio-card-status ' + (statusMap[a.status] || 'st-ativo') + '">' + esc(a.status || 'ativo') + '</span>' +
            '<div class="anuncio-card-actions">' +
              '<button class="adm-btn-icon" data-edit-an="' + esc(a.id) + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
              '<button class="adm-btn-icon adm-btn-icon--red" data-del-an="' + esc(a.id) + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
            '</div>' +
          '</div></div>';
      }).join('');

      function editar(id) { api('GET', '/anuncios/' + id).then(abrirEditorAnuncio).catch(alertErro); }
      grid.querySelectorAll('[data-edit-an]').forEach(function (btn) {
        btn.addEventListener('click', function (e) { e.stopPropagation(); editar(btn.dataset.editAn); });
      });
      grid.querySelectorAll('[data-del-an]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.dataset.delAn;
          confirmar(function () { api('DELETE', '/anuncios/' + id).then(function () { renderAnuncios(filtro); }).catch(alertErro); });
        });
      });
      grid.querySelectorAll('.anuncio-card').forEach(function (card) {
        card.addEventListener('click', function () { editar(card.dataset.id); });
      });
      $('anuncios-ordem-dica').textContent = filtro
        ? 'Limpe a busca para reordenar os anúncios.'
        : 'Arraste os cards para definir a ordem em que aparecem na loja.';
      if (!filtro) initOrdenacaoAnuncios(grid);
    }).catch(function (err) { console.error('Anúncios:', err.message); });
  }

  /* Arrastar-e-soltar para ordenar a vitrine (mouse e toque) */
  function initOrdenacaoAnuncios(grid) {
    var arrastando = null, ordemInicial = '';

    function idsAtuais() {
      return Array.prototype.map.call(grid.querySelectorAll('.anuncio-card'), function (c) { return c.dataset.id; });
    }
    function cardSob(x, y) {
      var el = document.elementFromPoint(x, y);
      var card = el && el.closest ? el.closest('.anuncio-card') : null;
      return card && card !== arrastando && grid.contains(card) ? card : null;
    }
    function moverPara(alvo, x, y) {
      if (!alvo) return;
      var r = alvo.getBoundingClientRect();
      var depois = (y > r.top + r.height / 2) || (x > r.left + r.width / 2 && y > r.top);
      grid.insertBefore(arrastando, depois ? alvo.nextSibling : alvo);
    }
    function numerar() {
      grid.querySelectorAll('.anuncio-card-pos span').forEach(function (s, i) { s.textContent = (i + 1) + 'º'; });
    }
    function salvar() {
      numerar();
      var ids = idsAtuais();
      if (ids.join(',') === ordemInicial) return;
      var dica = $('anuncios-ordem-dica');
      dica.textContent = 'Salvando ordem...';
      api('PUT', '/anuncios/ordem', { ids: ids })
        .then(function () { dica.textContent = 'Ordem salva! A loja já mostra os anúncios nessa sequência.'; })
        .catch(function (err) { dica.textContent = 'Erro ao salvar a ordem: ' + err.message; renderAnuncios(''); });
    }

    /* Mouse (desktop) */
    grid.querySelectorAll('.anuncio-card[draggable]').forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        arrastando = card; ordemInicial = idsAtuais().join(',');
        card.classList.add('arrastando');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (_) {}
      });
      card.addEventListener('dragend', function () {
        card.classList.remove('arrastando');
        arrastando = null;
        salvar();
      });
    });
    grid.ondragover = function (e) {
      if (!arrastando) return;
      e.preventDefault();
      moverPara(cardSob(e.clientX, e.clientY), e.clientX, e.clientY);
    };

    /* Toque (celular/tablet): segurar a alça ⋮⋮ e arrastar */
    grid.querySelectorAll('.anuncio-card-pos').forEach(function (alca) {
      alca.addEventListener('click', function (e) { e.stopPropagation(); });
      alca.addEventListener('touchstart', function (e) {
        arrastando = alca.closest('.anuncio-card');
        ordemInicial = idsAtuais().join(',');
        arrastando.classList.add('arrastando');
        e.preventDefault();
      }, { passive: false });
      alca.addEventListener('touchmove', function (e) {
        if (!arrastando) return;
        e.preventDefault();
        var t = e.touches[0];
        moverPara(cardSob(t.clientX, t.clientY), t.clientX, t.clientY);
      }, { passive: false });
      alca.addEventListener('touchend', function () {
        if (!arrastando) return;
        arrastando.classList.remove('arrastando');
        arrastando = null;
        salvar();
      });
    });
  }

  /* ══════════════════════════════════════════════
     IMPORTAR DO MERCADO LIVRE
  ══════════════════════════════════════════════ */
  var _mlOffset = 0, _mlQuery = '';

  function initImportarML() {
    $('btn-importar-ml').addEventListener('click', function () {
      $('modal-importar-ml').style.display = 'flex';
      _mlOffset = 0; _mlQuery = '';
      $('ml-busca-input').value = '';
      buscarItensML();
    });
    $('btn-fechar-importar-ml').addEventListener('click', function () { $('modal-importar-ml').style.display = 'none'; });
    $('btn-ml-buscar').addEventListener('click', function () { _mlQuery = $('ml-busca-input').value.trim(); _mlOffset = 0; buscarItensML(); });
    $('ml-busca-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { _mlQuery = this.value.trim(); _mlOffset = 0; buscarItensML(); }
    });
  }

  function buscarItensML() {
    var lista = $('ml-itens-lista'), vazio = $('ml-itens-vazio'), erro = $('ml-itens-erro'), pag = $('ml-paginacao');
    lista.innerHTML = '<p style="text-align:center;color:#999;padding:24px"><i class="ti ti-loader"></i> Carregando...</p>';
    vazio.style.display = 'none'; erro.style.display = 'none'; pag.innerHTML = '';

    var url = '/ml/meus-anuncios?offset=' + _mlOffset + (_mlQuery ? '&q=' + encodeURIComponent(_mlQuery) : '');
    api('GET', url).then(function (data) {
      var itens = data.itens || [];
      lista.innerHTML = '';
      if (itens.length === 0) { vazio.style.display = 'block'; return; }

      itens.forEach(function (item) {
        var div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff';
        var imgSrc = item.fotos && item.fotos[0] ? proxySrc(item.fotos[0]) : '';
        div.innerHTML =
          (imgSrc ? '<img src="' + esc(imgSrc) + '" style="width:60px;height:60px;object-fit:contain;border-radius:6px;flex-shrink:0" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#f3f4f6;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><i class="ti ti-photo" style="color:#9ca3af"></i></div>') +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(item.titulo) + '</div>' +
            '<div style="color:#6b7280;font-size:12px;margin-top:2px">' + fmtR(item.preco) + ' &bull; Estoque: ' + (item.estoque || 0) + '</div>' +
            '<div style="color:#9ca3af;font-size:11px">' + esc(item.id) + '</div>' +
          '</div>' +
          '<button class="adm-btn adm-btn--primary" style="flex-shrink:0;font-size:12px" data-ml-importar="' + esc(item.id) + '"><i class="ti ti-download"></i> Importar</button>';
        lista.appendChild(div);
      });

      var total = data.total || 0;
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

      lista.querySelectorAll('[data-ml-importar]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Importando...';
          api('POST', '/ml/importar', { mlId: btn.dataset.mlImportar })
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

  /* ══════════════════════════════════════════════
     CONFIGURAÇÕES
  ══════════════════════════════════════════════ */
  function initMercadoLivreConfig() {
    var dot = $('ml-status-dot'), txt = $('ml-status-txt');
    var btnConectar = $('btn-ml-conectar'), btnDesconectar = $('btn-ml-desconectar');
    var checkTimer = null;

    function verificarStatusML() {
      return api('GET', '/ml/status').then(function (data) {
        if (data.conectado) {
          dot.style.background = '#16a34a';
          txt.textContent = 'Conectado como: ' + data.usuario;
          txt.style.color = '#16a34a';
          btnConectar.style.display = 'none';
          btnDesconectar.style.display = 'block';
        } else {
          dot.style.background = '#ef4444';
          txt.textContent = 'Não conectado';
          txt.style.color = '#6b7280';
          btnConectar.style.display = 'block';
          btnDesconectar.style.display = 'none';
        }
        return data.conectado;
      }).catch(function () {
        dot.style.background = '#f59e0b';
        txt.textContent = 'Erro ao verificar conexão';
      });
    }

    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || !e.data.ml) return;
      clearInterval(checkTimer);
      verificarStatusML();
      if (e.data.ml === 'ok') showMsg('msg-ml', '✓ Conta conectada!', '#16a34a');
      else showMsg('msg-ml', 'Não foi possível conectar. Tente novamente.', '#ef4444');
    });

    btnConectar.addEventListener('click', function () {
      api('GET', '/ml/auth-url').then(function (data) {
        window.open(data.url, 'ml_auth', 'width=700,height=650');
        showMsg('msg-ml', 'Autorize no Mercado Livre e volte aqui.', '#2563eb');
        clearInterval(checkTimer);
        checkTimer = setInterval(function () {
          verificarStatusML().then(function (ok) { if (ok) { clearInterval(checkTimer); showMsg('msg-ml', '✓ Conta conectada!', '#16a34a'); } });
        }, 4000);
        setTimeout(function () { clearInterval(checkTimer); }, 120000);
      }).catch(function (err) { showMsg('msg-ml', err.message, '#ef4444'); });
    });

    btnDesconectar.addEventListener('click', function () {
      if (!confirm('Desconectar a conta do Mercado Livre?')) return;
      api('DELETE', '/ml/desconectar').then(function () { verificarStatusML(); showMsg('msg-ml', 'Conta desconectada.', '#6b7280'); }).catch(function (err) { showMsg('msg-ml', err.message, '#ef4444'); });
    });

    verificarStatusML();
  }

  function initFormsConfig() {
    var form = $('form-loja');
    var CAMPOS = ['nomeLoja','cnpj','emailContato','telefone','whatsapp','endereco','freteGratis'];
    api('GET', '/config').then(function (cfg) {
      CAMPOS.forEach(function (k) { if (form[k]) form[k].value = cfg[k] !== undefined ? cfg[k] : ''; });
    }).catch(function () {});

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = {};
      CAMPOS.forEach(function (k) { body[k] = form[k].value.trim(); });
      body.whatsapp = body.whatsapp.replace(/\D/g, '');
      if (body.whatsapp && body.whatsapp.length <= 11) body.whatsapp = '55' + body.whatsapp;
      api('PUT', '/config', body)
        .then(function (cfg) { form.whatsapp.value = cfg.whatsapp || ''; showMsg('msg-loja', '✓ Dados salvos!', '#16a34a'); })
        .catch(function (err) { showMsg('msg-loja', err.message, '#ef4444'); });
    });

    $('form-senha').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = this;
      if (!f.senhaAtual.value) { showMsg('msg-senha', 'Informe a senha atual.', '#ef4444'); return; }
      if (f.novaSenha.value && f.novaSenha.value.length < 6) { showMsg('msg-senha', 'Nova senha: mínimo 6 caracteres.', '#ef4444'); return; }
      if (f.novaSenha.value !== f.novaSenha2.value) { showMsg('msg-senha', 'As senhas não coincidem.', '#ef4444'); return; }
      api('PUT', '/auth/admin/credenciais', { senhaAtual: f.senhaAtual.value, novoUser: f.adminUser.value.trim(), novaSenha: f.novaSenha.value })
        .then(function (d) {
          showMsg('msg-senha', '✓ Credenciais atualizadas!', '#16a34a');
          f.reset();
          f.adminUser.value = d.user || '';
        })
        .catch(function (err) { showMsg('msg-senha', err.message, '#ef4444'); });
    });
  }

  /* ══════════════════════════════════════════════
     CRM
  ══════════════════════════════════════════════ */
  var STAGES = ['contato', 'proposta', 'negociacao', 'fechado', 'perdido'];
  var _leads = [], _chamados = [], _abaCrm = 'funil';

  function initCrm() {
    document.querySelectorAll('.crm-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { abrirAbaCrm(btn.dataset.tab); });
    });

    /* drag & drop entre colunas do funil */
    STAGES.forEach(function (s) {
      var col = $('col-' + s);
      if (!col) return;
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('crm-drop'); });
      col.addEventListener('dragleave', function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove('crm-drop'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('crm-drop');
        var id = e.dataTransfer.getData('text/plain');
        var lead = _leads.find(function (l) { return String(l.id) === id; });
        if (!lead || lead.stage === s) return;
        var anterior = lead.stage;
        lead.stage = s;
        desenharKanban();
        api('PUT', '/leads/' + id, { stage: s }).catch(function (err) { lead.stage = anterior; desenharKanban(); alertErro(err); });
      });
    });

    document.querySelectorAll('input[name="mkt-seg"]').forEach(function (r) {
      r.addEventListener('change', function () { $('mkt-segmento').value = r.value; });
    });
  }

  function abrirAbaCrm(tab) {
    _abaCrm = tab;
    document.querySelectorAll('.crm-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    document.querySelectorAll('.crm-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'crm-' + tab); });
    renderCrmAbaAtual();
  }

  function renderCrmAbaAtual() {
    if (_abaCrm === 'funil')       renderKanban();
    if (_abaCrm === 'atendimento') carregarChamados();
    if (_abaCrm === 'marketing')   renderMarketing();
    if (_abaCrm === 'ferramentas') renderKiwifyStatus();
  }

  /* migra leads antigos do localStorage (de antes da integração com o servidor), uma única vez */
  function migrarLocalStorage() {
    var tarefas = [];
    try {
      var antigos = JSON.parse(localStorage.getItem('crm_leads') || '[]');
      antigos.forEach(function (l) { tarefas.push(function () { return api('POST', '/leads', l); }); });
    } catch (e) {}
    try {
      var chams = JSON.parse(localStorage.getItem('crm_chamados') || '[]');
      chams.slice().reverse().forEach(function (c) { tarefas.push(function () { return api('POST', '/chamados', c); }); });
    } catch (e) {}
    if (!tarefas.length) return Promise.resolve();
    return tarefas.reduce(function (p, t) { return p.then(t).catch(function () {}); }, Promise.resolve())
      .then(function () { localStorage.removeItem('crm_leads'); localStorage.removeItem('crm_chamados'); });
  }

  /* ── FUNIL ── */
  function renderKanban() {
    migrarLocalStorage().then(function () { return api('GET', '/leads'); }).then(function (leads) {
      _leads = leads || [];
      desenharKanban();
    }).catch(function (err) { console.error('Leads:', err.message); });
  }

  function desenharKanban() {
    STAGES.forEach(function (s) {
      var col = $('col-' + s);
      if (!col) return;
      var lista = _leads.filter(function (l) { return l.stage === s; })
        .sort(function (a, b) { return String(b.atualizadoEm || b.id).localeCompare(String(a.atualizadoEm || a.id)); });
      var soma  = lista.reduce(function (t, l) { return t + num(l.valor); }, 0);
      var cnt   = $('count-' + s);
      cnt.textContent = lista.length;
      cnt.title = 'Total: ' + fmtR(soma);
      col.innerHTML = lista.length ? '' : '<div class="crm-col-vazia">Arraste um card para cá</div>';
      lista.forEach(function (l) {
        var c = document.createElement('div');
        c.className = 'crm-card';
        c.draggable = true;
        c.innerHTML =
          '<div class="crm-card-nome">' + esc(l.nome) + (l.origem === 'kiwify' ? ' <i class="ti ti-shopping-bag-check" title="Importado da Kiwify" style="color:#7b3fe4"></i>' : '') + '</div>' +
          (l.produto ? '<div class="crm-card-produto">' + esc(l.produto) + '</div>' : '') +
          (num(l.valor) ? '<div class="crm-card-valor">' + fmtR(l.valor) + '</div>' : '') +
          '<div class="crm-card-meta">' + esc(l.data || '') + (l.tel ? ' · <i class="ti ti-phone"></i>' : '') + (l.email ? ' · <i class="ti ti-mail"></i>' : '') + '</div>';
        c.addEventListener('click', function () { window.editarLead(l.id); });
        c.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(l.id)); e.dataTransfer.effectAllowed = 'move'; c.classList.add('crm-dragging'); });
        c.addEventListener('dragend', function () { c.classList.remove('crm-dragging'); });
        col.appendChild(c);
      });
    });
  }

  function marcarPill(stage) {
    $('lead-stage').value = stage;
    document.querySelectorAll('#lead-stage-pills .crm-pill').forEach(function (p) { p.classList.toggle('active', p.dataset.val === stage); });
  }

  window.selecionarPill = function (btn) { marcarPill(btn.dataset.val); };

  window.abrirModalLead = function (stage, pre) {
    pre = pre || {};
    $('lead-id').value      = '';
    $('lead-nome').value    = pre.nome || '';
    $('lead-email').value   = pre.email || '';
    $('lead-tel').value     = pre.tel || '';
    $('lead-produto').value = '';
    $('lead-valor').value   = '';
    $('lead-obs').value     = '';
    marcarPill(stage || 'contato');
    $('modal-lead-titulo').textContent = 'Novo Lead';
    $('modal-lead-sub').textContent = 'Cadastre um novo contato no funil';
    $('btn-excluir-lead').style.display = 'none';
    $('lead-contatos').innerHTML = '';
    $('modal-lead').style.display = 'flex';
    setTimeout(function () { $('lead-nome').focus(); }, 50);
  };

  window.fecharModalLead = function () { $('modal-lead').style.display = 'none'; };

  window.editarLead = function (id) {
    var lead = _leads.find(function (l) { return String(l.id) === String(id); });
    if (!lead) return;
    $('lead-id').value      = lead.id;
    $('lead-nome').value    = lead.nome || '';
    $('lead-email').value   = lead.email || '';
    $('lead-tel').value     = lead.tel || '';
    $('lead-produto').value = lead.produto || '';
    $('lead-valor').value   = lead.valor || '';
    $('lead-obs').value     = lead.obs || '';
    marcarPill(lead.stage || 'contato');
    $('modal-lead-titulo').textContent = 'Editar Lead';
    $('modal-lead-sub').textContent = 'Criado em ' + (lead.data || '–') + (lead.origem === 'kiwify' ? ' · origem: Kiwify' : '');
    $('btn-excluir-lead').style.display = '';

    var tel = String(lead.tel || '').replace(/\D/g, '');
    $('lead-contatos').innerHTML =
      (tel ? '<a class="adm-btn" href="https://wa.me/' + (tel.length <= 11 ? '55' : '') + tel + '" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>' : '') +
      (lead.email ? '<a class="adm-btn" href="mailto:' + esc(lead.email) + '"><i class="ti ti-mail"></i> E-mail</a>' : '');
    $('modal-lead').style.display = 'flex';
  };

  window.salvarLead = function () {
    var nome = $('lead-nome').value.trim();
    if (!nome) { alert('Informe o nome do cliente.'); return; }
    var id = $('lead-id').value;
    var payload = {
      nome:    nome,
      email:   $('lead-email').value.trim(),
      tel:     $('lead-tel').value.trim(),
      produto: $('lead-produto').value.trim(),
      valor:   $('lead-valor').value,
      obs:     $('lead-obs').value,
      stage:   $('lead-stage').value
    };
    var req = id ? api('PUT', '/leads/' + id, payload) : api('POST', '/leads', payload);
    req.then(function () { window.fecharModalLead(); renderKanban(); }).catch(alertErro);
  };

  window.excluirLead = function () {
    var id = $('lead-id').value;
    if (!id || !confirm('Excluir este lead do funil?')) return;
    api('DELETE', '/leads/' + id).then(function () { window.fecharModalLead(); renderKanban(); }).catch(alertErro);
  };

  /* ── ATENDIMENTO ── */
  var _atdFiltroStatus = 'todos';

  function carregarChamados() {
    migrarLocalStorage().then(function () {
      return Promise.all([api('GET', '/chamados'), api('GET', '/clientes').catch(function () { return []; })]);
    }).then(function (res) {
      _chamados = res[0] || [];
      $('lista-clientes-chamado').innerHTML = res[1].map(function (c) { return '<option value="' + esc(c.nome) + '">' + esc(c.email) + '</option>'; }).join('');
      window.filtrarChamados();
    }).catch(function (err) { console.error('Chamados:', err.message); });
  }

  window.filtrarChamados = function () {
    var q = ($('atend-busca').value || '').trim().toLowerCase();
    var list = _chamados.filter(function (c) {
      if (_atdFiltroStatus !== 'todos' && c.status !== _atdFiltroStatus) return false;
      return !q || ((c.cliente || '') + ' ' + (c.assunto || '') + ' ' + (c.desc || '')).toLowerCase().indexOf(q) !== -1;
    });

    var el = $('atd-lista-chamados');
    var labels    = { aberto:'Aberto', andamento:'Em andamento', resolvido:'Resolvido' };
    var proxLabel = { aberto:'→ Em andamento', andamento:'→ Resolvido', resolvido:'↺ Reabrir' };
    el.innerHTML = !list.length
      ? '<div class="atd-vazio"><i class="ti ti-inbox"></i><span>' + (_chamados.length ? 'Nenhum chamado encontrado.' : 'Nenhum chamado registrado ainda.') + '</span></div>'
      : list.map(function (c) {
          var desc = c.desc || '';
          return '<div class="atd-card" data-cham="' + esc(c.id) + '" style="cursor:pointer" title="Clique para ver/editar">' +
            '<div class="atd-card-status-dot ' + esc(c.status) + '"></div>' +
            '<div class="atd-card-body">' +
              '<div class="atd-card-assunto">' + esc(c.assunto) + '</div>' +
              '<div class="atd-card-meta">' +
                '<span><i class="ti ti-user"></i>' + esc(c.cliente) + '</span>' +
                '<span><i class="ti ti-calendar"></i>' + esc(c.data) + '</span>' +
                (desc ? '<span><i class="ti ti-notes"></i>' + esc(desc.length > 60 ? desc.substring(0, 60) + '…' : desc) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<span class="atd-card-badge ' + esc(c.status) + '">' + (labels[c.status] || esc(c.status)) + '</span>' +
            '<div class="atd-card-actions">' +
              '<button class="atd-btn-status" data-avancar="' + esc(c.id) + '">' + (proxLabel[c.status] || '→') + '</button>' +
              '<button class="atd-btn-excluir" data-excluir="' + esc(c.id) + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
            '</div>' +
            '<div class="atd-card-id">#' + esc(String(c.id).slice(-6)) + '</div>' +
          '</div>';
        }).join('');

    el.querySelectorAll('[data-cham]').forEach(function (card) {
      card.addEventListener('click', function () { window.abrirModalChamado(card.dataset.cham); });
    });
    el.querySelectorAll('[data-avancar]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); window.avancarStatus(b.dataset.avancar); });
    });
    el.querySelectorAll('[data-excluir]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); window.excluirChamado(b.dataset.excluir); });
    });

    ['aberto', 'andamento', 'resolvido'].forEach(function (s) {
      $('cnt-' + s).textContent = _chamados.filter(function (c) { return c.status === s; }).length;
    });
    $('cnt-total').textContent = _chamados.length;
  };

  window.filtrarChamadosStatus = function (btn) {
    document.querySelectorAll('.atd-filter').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    _atdFiltroStatus = btn.dataset.filter;
    window.filtrarChamados();
  };

  window.avancarStatus = function (id) {
    var c = _chamados.find(function (x) { return String(x.id) === String(id); });
    if (!c) return;
    var prox = { aberto:'andamento', andamento:'resolvido', resolvido:'aberto' }[c.status] || 'aberto';
    api('PUT', '/chamados/' + id, { status: prox }).then(function (atual) {
      Object.assign(c, atual);
      window.filtrarChamados();
    }).catch(alertErro);
  };

  window.excluirChamado = function (id) {
    if (!confirm('Excluir chamado?')) return;
    api('DELETE', '/chamados/' + id).then(function () {
      _chamados = _chamados.filter(function (c) { return String(c.id) !== String(id); });
      window.filtrarChamados();
    }).catch(alertErro);
  };

  window.abrirModalChamado = function (id) {
    var c = id ? _chamados.find(function (x) { return String(x.id) === String(id); }) : null;
    $('cham-id').value      = c ? c.id : '';
    $('cham-cliente').value = c ? c.cliente : '';
    $('cham-assunto').value = c ? c.assunto : '';
    $('cham-desc').value    = c ? (c.desc || '') : '';
    $('cham-status').value  = c ? c.status : 'aberto';
    $('modal-chamado-titulo').textContent = c ? 'Chamado #' + String(c.id).slice(-6) : 'Novo Chamado';
    $('modal-chamado').style.display = 'flex';
  };

  window.fecharModalChamado = function () { $('modal-chamado').style.display = 'none'; };

  window.salvarChamado = function () {
    var body = {
      cliente: $('cham-cliente').value.trim(),
      assunto: $('cham-assunto').value.trim(),
      status:  $('cham-status').value,
      desc:    $('cham-desc').value
    };
    if (!body.cliente || !body.assunto) { alert('Preencha cliente e assunto.'); return; }
    var id  = $('cham-id').value;
    var req = id ? api('PUT', '/chamados/' + id, body) : api('POST', '/chamados', body);
    req.then(function () { window.fecharModalChamado(); carregarChamados(); }).catch(alertErro);
  };

  /* ── MARKETING ── */
  var _mktInfo = null;

  function renderMarketing() {
    api('GET', '/campanhas').then(function (d) {
      _mktInfo = d;
      var enviados = d.campanhas.reduce(function (t, c) { return t + (c.enviados || 0); }, 0);
      $('mkt-total-clientes').textContent  = d.totalClientes;
      $('mkt-emails-enviados').textContent = d.campanhas.length;
      $('mkt-inscritos').textContent       = d.segmentos.todos;
      $('mkt-emails-total').textContent    = enviados;
      ['todos', 'novos', 'inativos'].forEach(function (s) { $('mkt-seg-n-' + s).textContent = '(' + d.segmentos[s] + ')'; });

      var aviso = $('mkt-smtp-aviso');
      aviso.style.display = d.smtpConfigurado ? 'none' : 'flex';

      var el = $('mkt-historico-lista');
      if (!d.campanhas.length) {
        el.innerHTML = '<div class="mkt-history-empty"><i class="ti ti-mail-off"></i><span>Nenhuma campanha disparada ainda.</span></div>';
        return;
      }
      var segLabel = { todos:'Todos', novos:'Novos', inativos:'Inativos' };
      el.innerHTML = d.campanhas.slice(0, 20).map(function (c) {
        return '<div class="mkt-history-item" title="' + esc(c.corpo) + '">' +
          '<div class="mkt-history-dot"' + (c.falhas ? ' style="background:#f59e0b"' : '') + '></div>' +
          '<div class="mkt-history-item-assunto">' + esc(c.assunto) + '</div>' +
          '<div class="mkt-history-item-seg">' + (segLabel[c.segmento] || esc(c.segmento)) + ' · ' + (c.enviados || 0) + '/' + (c.destinatarios || 0) + ' enviados</div>' +
          '<div class="mkt-history-item-data">' + esc(c.data) + '</div>' +
          '</div>';
      }).join('');
    }).catch(function (err) { console.error('Marketing:', err.message); });
  }

  window.dispararCampanha = function () {
    var assunto = $('mkt-assunto').value.trim();
    var corpo   = $('mkt-corpo').value.trim();
    var checked = document.querySelector('input[name="mkt-seg"]:checked');
    var seg     = checked ? checked.value : 'todos';
    if (!assunto) { alert('Informe o assunto da campanha.'); return; }
    if (!corpo)   { alert('Escreva o conteúdo da mensagem.'); return; }
    if (_mktInfo && !_mktInfo.smtpConfigurado) { alert('O envio de e-mail ainda não está configurado no servidor (SMTP). Veja o aviso acima do formulário.'); return; }
    var n = _mktInfo ? _mktInfo.segmentos[seg] : '?';
    if (!n) { alert('Nenhum cliente inscrito na newsletter neste segmento.'); return; }
    if (!confirm('Enviar "' + assunto + '" para ' + n + ' cliente(s)?')) return;

    var btn = document.querySelector('.mkt-btn-send');
    btn.disabled = true;
    var htmlOrig = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-loader"></i> Enviando...';
    api('POST', '/campanhas', { assunto: assunto, corpo: corpo, segmento: seg })
      .then(function (r) {
        $('mkt-assunto').value = '';
        $('mkt-corpo').value   = '';
        alert('Campanha enviada: ' + r.enviados + ' de ' + r.destinatarios + ' e-mail(s) entregues ao servidor.' + (r.falhas ? '\n' + r.falhas + ' falharam.' : ''));
      })
      .catch(alertErro)
      .then(function () { btn.disabled = false; btn.innerHTML = htmlOrig; renderMarketing(); });
  };

  /* ── FERRAMENTAS (Kiwify) ── */
  function renderKiwifyStatus() {
    var dot = $('kiwify-status-dot'), texto = $('kiwify-status-texto'), input = $('kiwify-webhook-url');
    api('GET', '/kiwify/status').then(function (s) {
      input.value = s.token
        ? location.origin + '/api/kiwify/webhook?token=' + s.token
        : location.origin + '/api/kiwify/webhook (defina KIWIFY_WEBHOOK_TOKEN no .env)';
      if (!s.configurado) {
        dot.className = 'crm-kiwify-dot off';
        texto.textContent = 'Token não configurado no servidor (.env)';
      } else if (s.ultimoRecebidoEm) {
        dot.className = 'crm-kiwify-dot on';
        texto.textContent = 'Conectado — último evento recebido em ' + new Date(s.ultimoRecebidoEm).toLocaleString('pt-BR') + ' (' + (s.totalRecebidos || 1) + ' no total)';
      } else {
        dot.className = 'crm-kiwify-dot';
        texto.textContent = 'Configurado, aguardando a primeira venda...';
      }
      $('btn-importar-vendas-kiwify').disabled = !s.apiConfigurada;
      $('btn-importar-vendas-kiwify').title = s.apiConfigurada ? '' : 'Preencha KIWIFY_CLIENT_ID, KIWIFY_CLIENT_SECRET e KIWIFY_ACCOUNT_ID no .env';
    }).catch(function () {
      dot.className = 'crm-kiwify-dot off';
      texto.textContent = 'Não foi possível verificar o status.';
    });

    var apiDot = $('kiwify-api-status-dot'), apiTexto = $('kiwify-api-status-texto');
    api('GET', '/kiwify/api-status').then(function (s) {
      apiDot.className = 'crm-kiwify-dot ' + (s.conectado ? 'on' : 'off');
      apiTexto.textContent = s.conectado ? 'API de pagamentos conectada' : 'API de pagamentos não conectada' + (s.erro ? ' — ' + s.erro : '');
    }).catch(function () {
      apiDot.className = 'crm-kiwify-dot off';
      apiTexto.textContent = 'Não foi possível verificar a API de pagamentos.';
    });
  }

  window.importarVendasKiwify = function () {
    var msg = $('kiwify-importar-msg'), btn = $('btn-importar-vendas-kiwify');
    btn.disabled = true;
    msg.style.color = '#666';
    msg.textContent = 'Importando...';
    api('POST', '/kiwify/importar-vendas').then(function (d) {
      msg.style.color = '#16a34a';
      msg.textContent = d.importados + ' venda(s) nova(s) importada(s) de ' + d.total + ' encontrada(s) nos últimos 90 dias.';
      renderKanban();
    }).catch(function (err) {
      msg.style.color = '#ef4444';
      msg.textContent = err.message;
    }).then(function () { btn.disabled = false; });
  };

  window.copiarWebhookKiwify = function (btn) {
    var input = $('kiwify-webhook-url');
    if (!input || !input.value) return;
    function ok() {
      if (!btn) return;
      var original = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> Copiado!';
      setTimeout(function () { btn.innerHTML = original; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(ok, function () { input.select(); document.execCommand('copy'); ok(); });
    } else { input.select(); document.execCommand('copy'); ok(); }
  };

  /* ══════════════════════════════════════════════
     TEMA
  ══════════════════════════════════════════════ */
  function aplicarIconeTema() {
    var dark = escuro();
    $('tema-icon').className    = dark ? 'ti ti-sun' : 'ti ti-moon';
    $('tema-label').textContent = dark ? 'Tema Claro' : 'Tema Escuro';
  }

  window.toggleTema = function () {
    var dark = document.body.classList.toggle('dark');
    try { localStorage.setItem('allecom_tema', dark ? 'dark' : 'light'); } catch (e) {}
    aplicarIconeTema();
    desenharAnalytics();
  };

  try { if (localStorage.getItem('allecom_tema') === 'dark') document.body.classList.add('dark'); } catch (e) {}
  aplicarIconeTema();

})();
