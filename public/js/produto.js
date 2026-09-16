(function () {
  var API = '/api';
  var qty = 1;
  var produto = null;
  var cart = [];

  /* ── UTILS ──────────────────────────────────────────────── */
  function getToken()   { return sessionStorage.getItem('allecom_token') || ''; }
  function setToken(t)  { sessionStorage.setItem('allecom_token', t); }
  function getSessao()  { try { return JSON.parse(sessionStorage.getItem('allecom_sessao') || 'null'); } catch { return null; } }
  function setSessao(u) { sessionStorage.setItem('allecom_sessao', JSON.stringify(u)); }
  function clearSessao(){ sessionStorage.removeItem('allecom_sessao'); sessionStorage.removeItem('allecom_token'); }

  async function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (getToken()) opts.headers['Authorization'] = 'Bearer ' + getToken();
    if (body) opts.body = JSON.stringify(body);
    var r    = await fetch(API + path, opts);
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || 'Erro.');
    return data;
  }

  function fmt(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

  function toast(msg, cor) {
    var el = document.createElement('div');
    el.className = 'prd-toast';
    el.style.background = cor || '#16a34a';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  /* ── CARREGAR PRODUTO ───────────────────────────────────── */
  var params  = new URLSearchParams(location.search);
  var id      = params.get('id');
  var anuncioId = params.get('anuncio');

  if (!id && !anuncioId) {
    document.getElementById('prd-nome').textContent = 'Produto não encontrado.';
  } else if (anuncioId) {
    carregarAnuncio(anuncioId);
  } else {
    carregarProduto(id);
  }

  function carregarProduto(id) {
    api('GET', '/produtos/' + id)
      .then(function (p) {
        produto = p;
        renderProduto(p);
      })
      .catch(function () {
        document.getElementById('prd-nome').textContent = 'Produto não encontrado.';
      });
  }

  function carregarAnuncio(id) {
    api('GET', '/anuncios/' + id)
      .then(function (a) {
        produto = {
          id: 'an-' + a.id,
          nome: a.titulo,
          marca: a.marca || '',
          preco: parseFloat(a.preco) || 0,
          desconto: parseInt(a.desconto) || 0,
          estoque: parseInt(a.estoque) || 99,
          status: a.status,
          descricao: a.descricao || '',
          fotos: a.fotos || [],
          categoria: a.categoria || 'Produtos',
          kiwifyCheckoutUrl: a.kiwifyCheckoutUrl || '',
          _anuncioId: a.id
        };
        renderProduto(produto);
        renderRelacionados(a.id);
      })
      .catch(function () {
        document.getElementById('prd-nome').textContent = 'Produto não encontrado.';
      });
  }

  /* ── PRODUTOS RELACIONADOS ───────────────────────────────── */
  function renderRelacionados(idAtual) {
    var grid = document.getElementById('relacionados-grid');
    if (!grid) return;
    api('GET', '/anuncios?status=ativo').then(function (anuncios) {
      var lista = (anuncios || []).filter(function (a) { return a.id !== idAtual; }).slice(0, 4);
      grid.innerHTML = lista.map(function (a) {
        var preco = parseFloat(a.preco) || 0;
        var desc  = parseInt(a.desconto) || 0;
        var pf    = desc > 0 ? preco * (1 - desc / 100) : preco;
        var badge = desc > 0 ? '<span class="prod-badge-desc">-' + desc + '%</span>' : '';
        var fotoSrc = (a.fotos && a.fotos.length > 0) ? proxySrc(a.fotos[0]) : null;
        var imgHtml = fotoSrc
          ? '<img src="' + fotoSrc + '" alt="' + a.titulo + '" onerror="this.style.display=\'none\'">'
          : '<i class="ti ti-photo" style="font-size:48px;color:#ddd"></i>';

        return '<div class="prod-card">' +
          '<div class="prod-img-wrap">' + badge + imgHtml + '</div>' +
          '<div class="prod-body">' +
            '<div class="prod-nome">' + a.titulo + '</div>' +
            (desc > 0 ? '<div class="prod-de">R$ ' + preco.toFixed(2).replace('.', ',') + '</div>' : '') +
            '<div class="prod-preco"><sup>R$</sup> ' + pf.toFixed(2).replace('.', ',') + '</div>' +
          '</div>' +
          '<div class="prod-footer">' +
            '<button class="btn-comprar" onclick="location.href=\'/produto.html?anuncio=' + a.id + '\'">Ver mais</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function () { grid.innerHTML = ''; });
  }

  function renderProduto(p) {
    /* título e breadcrumb */
    document.title = p.nome + ' — ALL.ECOM';
    document.getElementById('bc-nome').textContent      = p.nome;
    document.getElementById('bc-categoria').textContent = p.categoria || 'Produtos';
    document.getElementById('prd-nome').textContent     = p.nome;

    /* preços */
    var precoFinal = p.desconto > 0 ? p.preco * (1 - p.desconto / 100) : p.preco;
    var precoFmt   = fmt(precoFinal);

    if (p.desconto > 0) {
      var precoDe = document.getElementById('prd-preco-de');
      precoDe.textContent = fmt(p.preco);
      precoDe.style.display = '';
      var badge = document.getElementById('prd-badge-desc');
      badge.textContent = '-' + p.desconto + '%';
      badge.style.display = '';
    }
    document.getElementById('prd-preco-por').textContent = precoFmt;

    /* estoque */
    if (p.estoque === 0) {
      document.getElementById('prd-estoque-wrap').innerHTML = '<span style="color:#ef4444"><i class="ti ti-circle-x"></i> Produto esgotado</span>';
      document.getElementById('btn-comprar-agora').disabled = true;
    }

    /* fotos */
    renderFotos(p.fotos || []);

    /* descrição — abaixo do botão Comprar e também na aba "Descrição" */
    var descHtml = p.descricao || 'Produto ' + p.nome + ' da marca ' + (p.marca || '') + '. Qualidade garantida com assistência técnica especializada.';
    document.getElementById('prd-descricao').innerHTML = descHtml;
    document.getElementById('prd-caracteristicas').innerHTML = descHtml;

    /* avaliações */
    initAvaliacoes(p);
  }

  /* ── AVALIAÇÕES ─────────────────────────────────────────── */
  function avalKey(p)   { return 'allecom_avaliacoes_' + (p._anuncioId || p.id); }
  function getAvaliacoes(p) { try { return JSON.parse(localStorage.getItem(avalKey(p)) || '[]'); } catch { return []; } }

  function initAvaliacoes(p) {
    var nomeEl = document.getElementById('prd-aval-nome-produto');
    if (nomeEl) nomeEl.textContent = p.nome;

    var estrelasWrap = document.getElementById('prd-aval-estrelas');
    var notaSelecionada = 0;
    if (estrelasWrap) {
      var estrelas = estrelasWrap.querySelectorAll('span');
      estrelas.forEach(function (el) {
        el.addEventListener('click', function () {
          notaSelecionada = parseInt(el.dataset.v);
          estrelas.forEach(function (e) { e.classList.toggle('ativa', parseInt(e.dataset.v) <= notaSelecionada); });
        });
      });
    }

    renderAvaliacoes(p);

    var salvarChk = document.getElementById('aval-salvar');
    var savedDados = null;
    try { savedDados = JSON.parse(localStorage.getItem('allecom_aval_dados') || 'null'); } catch {}
    if (savedDados) {
      document.getElementById('aval-nome').value  = savedDados.nome  || '';
      document.getElementById('aval-email').value = savedDados.email || '';
      if (salvarChk) salvarChk.checked = true;
    }

    var form = document.getElementById('form-avaliacao');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var texto = document.getElementById('aval-texto').value.trim();
        var nome  = document.getElementById('aval-nome').value.trim();
        var email = document.getElementById('aval-email').value.trim();
        if (!notaSelecionada) { toast('Selecione uma nota de 1 a 5 estrelas.', '#ef4444'); return; }
        if (!texto || !nome || !email) { toast('Preencha todos os campos obrigatórios.', '#ef4444'); return; }

        var avaliacoes = getAvaliacoes(p);
        avaliacoes.unshift({ nota: notaSelecionada, texto: texto, nome: nome, data: new Date().toISOString() });
        localStorage.setItem(avalKey(p), JSON.stringify(avaliacoes));

        if (salvarChk && salvarChk.checked) {
          localStorage.setItem('allecom_aval_dados', JSON.stringify({ nome: nome, email: email }));
        } else {
          localStorage.removeItem('allecom_aval_dados');
        }

        form.reset();
        notaSelecionada = 0;
        if (estrelasWrap) estrelasWrap.querySelectorAll('span').forEach(function (e) { e.classList.remove('ativa'); });
        renderAvaliacoes(p);
        toast('✓ Avaliação enviada. Obrigado!', '#16a34a');
      });
    }
  }

  function renderAvaliacoes(p) {
    var avaliacoes = getAvaliacoes(p);
    var lista  = document.getElementById('prd-aval-lista');
    var vazio  = document.getElementById('prd-aval-vazio');
    var cta    = document.querySelector('.prd-aval-cta');
    var tabBtn = document.querySelector('.prd-tab[data-tab="avaliacoes"]');

    if (tabBtn) tabBtn.textContent = 'Avaliações (' + avaliacoes.length + ')';
    if (vazio) vazio.style.display = avaliacoes.length ? 'none' : '';
    if (cta) cta.style.display = avaliacoes.length ? 'none' : '';

    if (!lista) return;
    lista.innerHTML = avaliacoes.map(function (a) {
      var estrelas = '★★★★★☆☆☆☆☆'.slice(5 - a.nota, 10 - a.nota);
      return '<div class="prd-aval-item">' +
        '<div class="prd-aval-item-topo"><span class="prd-aval-item-nome">' + a.nome + '</span><span class="prd-aval-item-estrelas">' + estrelas + '</span></div>' +
        '<div class="prd-aval-item-texto">' + a.texto + '</div>' +
      '</div>';
    }).join('');
  }

  function proxySrc(src) {
    if (!src) return '';
    return src.includes('mlstatic.com') ? '/api/ml/img?url=' + encodeURIComponent(src) : src;
  }

  function renderFotos(fotos) {
    var fotoEl   = document.getElementById('prd-foto-principal');
    var fotoBox  = document.querySelector('.prd-img-box-v2');

    if (!fotos.length) {
      fotoBox.innerHTML = '<div class="prd-foto-placeholder"><i class="ti ti-photo"></i></div>';
      return;
    }

    fotoEl.src = proxySrc(fotos[0]);
  }

  /* ── TABS ────────────────────────────────────────────────── */
  document.querySelectorAll('.prd-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.prd-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.prd-tab-panel').forEach(function (p) { p.style.display = 'none'; });
      tab.classList.add('active');
      var panel = document.getElementById('prd-tab-' + tab.dataset.tab);
      if (panel) panel.style.display = '';
    });
  });

  /* ── CARRINHO ───────────────────────────────────────────── */
  function cartTotal() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function cartSum()   { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

  function updateBadge() {
    var b = document.querySelector('.cart-badge');
    if (b) { b.textContent = cartTotal(); b.style.display = cartTotal() ? '' : 'none'; }
  }

  function renderCart() {
    var list  = document.getElementById('cart-list');
    var total = document.getElementById('cart-total');
    if (!list) return;
    if (!cart.length) {
      list.innerHTML = '<p style="padding:20px;color:#888;text-align:center">Seu carrinho está vazio.</p>';
      if (total) total.textContent = 'R$ 0,00';
      return;
    }
    list.innerHTML = cart.map(function (item, idx) {
      return '<div class="cart-item">' +
        '<div class="cart-item-info"><strong>' + item.name + '</strong><small>' + item.marca + '</small></div>' +
        '<div class="cart-item-ctrl">' +
        '<button class="cart-qty-btn" data-idx="' + idx + '" data-d="-1">−</button>' +
        '<span>' + item.qty + '</span>' +
        '<button class="cart-qty-btn" data-idx="' + idx + '" data-d="1">+</button>' +
        '</div>' +
        '<div class="cart-item-price">' + fmt(item.price * item.qty) + '</div>' +
        '<button class="cart-remove" data-idx="' + idx + '">×</button>' +
        '</div>';
    }).join('');
    if (total) total.textContent = fmt(cartSum());

    list.querySelectorAll('.cart-qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = +this.dataset.idx, d = +this.dataset.d;
        cart[idx].qty += d;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
        updateBadge(); renderCart();
      });
    });
    list.querySelectorAll('.cart-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cart.splice(+this.dataset.idx, 1);
        updateBadge(); renderCart();
      });
    });
  }

  function openCart()  {
    renderCart();
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('overlay').classList.add('open');
  }
  function closeCart() {
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
  }

  function addToCart() {
    if (!produto) return;
    var precoFinal = produto.desconto > 0 ? produto.preco * (1 - produto.desconto / 100) : produto.preco;
    var existing   = cart.find(function (i) { return i.id === produto.id; });
    if (existing) { existing.qty += qty; }
    else { cart.push({ id: produto.id, name: produto.nome, marca: produto.marca || '', price: precoFinal, qty: qty }); }
    updateBadge();
  }

  /* ── BOTÕES ─────────────────────────────────────────────── */
  function handleComprar() {
    if (!produto || produto.estoque === 0) return;

    /* produto digital vendido pela Kiwify: vai direto pro checkout deles */
    if (produto.kiwifyCheckoutUrl) {
      window.location.href = produto.kiwifyCheckoutUrl;
      return;
    }

    addToCart();
    var sessao = getSessao();
    if (!sessao) { openModal('modal-conta'); return; }
    /* salva carrinho e vai para checkout */
    sessionStorage.setItem('allecom_checkout_cart', JSON.stringify(cart));
    window.location.href = '/checkout.html';
  }

  document.getElementById('btn-comprar-agora').addEventListener('click', handleComprar);

  document.getElementById('cart-close').addEventListener('click', closeCart);
  document.querySelector('.cart-wrap').addEventListener('click', function (e) { e.preventDefault(); openCart(); });

  /* ── OVERLAY ────────────────────────────────────────────── */
  document.getElementById('overlay').addEventListener('click', function () {
    closeCart();
    ['modal-pagamento','modal-conta','modal-conta-logada'].forEach(closeModal);
  });
  document.querySelectorAll('.modal-close').forEach(function (btn) {
    btn.addEventListener('click', function () { var m = this.closest('.modal'); if (m) closeModal(m.id); });
  });

  /* ── MODAL ──────────────────────────────────────────────── */
  function openModal(id) {
    if (id === 'modal-conta-logada') {
      var s = getSessao();
      if (s) { document.getElementById('logado-nome').textContent = s.nome; document.getElementById('logado-email').textContent = s.email; }
    }
    var el = document.getElementById(id);
    if (el) { el.classList.add('open'); document.getElementById('overlay').classList.add('open'); }
  }
  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
    var anyOpen = document.querySelector('.modal.open, #cart-drawer.open');
    if (!anyOpen) document.getElementById('overlay').classList.remove('open');
  }

  /* ── LOGIN ──────────────────────────────────────────────── */
  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = this.querySelector('input[type="email"]').value.trim();
      var senha = this.querySelector('input[type="password"]').value;
      api('POST', '/auth/login', { email: email, senha: senha })
        .then(function (data) {
          setToken(data.token); setSessao({ nome: data.nome, email: data.email });
          closeModal('modal-conta');
          atualizarHeaderConta();
          /* se tinha intenção de comprar, vai direto para checkout */
          if (cart.length) {
            sessionStorage.setItem('allecom_checkout_cart', JSON.stringify(cart));
            window.location.href = '/checkout.html';
          }
        })
        .catch(function (err) { document.getElementById('login-msg').textContent = err.message; });
    });
  }

  var linkCadastro = document.getElementById('link-cadastro');
  if (linkCadastro) linkCadastro.addEventListener('click', function (e) { e.preventDefault(); window.location.href = '/index.html'; });

  function atualizarHeaderConta() {
    var sessao  = getSessao();
    var btnConta = document.querySelector('.hdr-btn[data-action="conta"], .hdr-btn[data-action="conta-logada"]');
    if (!btnConta) return;
    if (sessao) {
      btnConta.innerHTML = '<i class="ti ti-user-circle"></i><span>' + sessao.nome.split(' ')[0] + '</span>';
      btnConta.dataset.action = 'conta-logada';
    }
    btnConta.onclick = function (e) {
      e.preventDefault();
      getSessao() ? openModal('modal-conta-logada') : openModal('modal-conta');
    };
  }

  var btnSair = document.getElementById('btn-sair-conta');
  if (btnSair) btnSair.addEventListener('click', function () { clearSessao(); closeModal('modal-conta-logada'); atualizarHeaderConta(); });

  /* ── MODAL PAGAMENTO ────────────────────────────────────── */
  var btnPagarMP    = document.getElementById('btn-pagar-mp');
  var btnPagarLocal = document.getElementById('btn-pagar-local');
  var pagMsg        = document.getElementById('pagamento-msg');

  if (btnPagarMP) {
    btnPagarMP.addEventListener('click', function () {
      pagMsg.textContent = 'Preparando pagamento...'; pagMsg.style.color = '#555';
      btnPagarMP.disabled = true;
      var itens   = cart.map(function (i) { return { nome: i.name, qty: i.qty, preco: i.price }; });
      var prodStr = cart.map(function (i) { return i.name + (i.qty > 1 ? ' x' + i.qty : ''); }).join(', ');
      api('POST', '/pedidos', { produtos: prodStr, total: cartSum() })
        .then(function (ped) { return api('POST', '/pagamento/criar', { itens: itens, pedidoId: ped.id }); })
        .then(function (pref) {
          cart = []; updateBadge(); closeModal('modal-pagamento');
          window.location.href = pref.sandbox_init_point || pref.init_point;
        })
        .catch(function (err) { pagMsg.textContent = err.message; pagMsg.style.color = '#ef4444'; btnPagarMP.disabled = false; });
    });
  }
  if (btnPagarLocal) {
    btnPagarLocal.addEventListener('click', function () {
      var prodStr = cart.map(function (i) { return i.name + (i.qty > 1 ? ' x' + i.qty : ''); }).join(', ');
      api('POST', '/pedidos', { produtos: prodStr, total: cartSum() })
        .then(function () {
          cart = []; updateBadge(); closeModal('modal-pagamento');
          toast('✓ Pedido realizado! Entraremos em contato.', '#16a34a');
        })
        .catch(function (err) { alert(err.message); });
    });
  }

  /* ── CHECKOUT PELO DRAWER ───────────────────────────────── */
  var checkoutBtn = document.querySelector('.cart-checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function () {
      if (!cart.length) return;
      var sessao = getSessao();
      if (!sessao) { closeCart(); setTimeout(function () { openModal('modal-conta'); }, 200); return; }
      closeCart();
      openModal('modal-pagamento');
    });
  }

  /* ── BUSCA ──────────────────────────────────────────────── */
  var searchInput = document.getElementById('search-input');
  var searchBtn   = document.getElementById('search-btn');
  function doSearch() {
    var q = searchInput.value.trim();
    if (q) window.location.href = '/index.html?q=' + encodeURIComponent(q);
  }
  if (searchBtn)   searchBtn.addEventListener('click', doSearch);
  if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

  /* ── INICIALIZA ─────────────────────────────────────────── */
  updateBadge();
  atualizarHeaderConta();
})();
