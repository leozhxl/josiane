(function () {
  /* ── API ─────────────────────────────────────────────── */
  var API = '/api';

  function getToken() { return sessionStorage.getItem('allecom_token') || ''; }
  function setToken(t) { sessionStorage.setItem('allecom_token', t); }
  function clearToken() { sessionStorage.removeItem('allecom_token'); }

  function getSessao() {
    try { return JSON.parse(sessionStorage.getItem('allecom_sessao') || 'null'); } catch { return null; }
  }
  function setSessao(u) { sessionStorage.setItem('allecom_sessao', JSON.stringify(u)); }
  function clearSessao() { sessionStorage.removeItem('allecom_sessao'); clearToken(); }

  async function api(method, path, body, token) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (token || getToken()) opts.headers['Authorization'] = 'Bearer ' + (token || getToken());
    if (body) opts.body = JSON.stringify(body);
    var r = await fetch(API + path, opts);
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || 'Erro na requisição.');
    return data;
  }

  /* ── CARRINHO ─────────────────────────────────────────── */
  var cart = [];

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
    if (cart.length === 0) {
      list.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
      total.textContent = 'R$ 0,00';
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
        '<div class="cart-item-price">R$ ' + (item.price * item.qty).toFixed(2).replace('.', ',') + '</div>' +
        '<button class="cart-remove" data-idx="' + idx + '">×</button>' +
        '</div>';
    }).join('');
    total.textContent = 'R$ ' + cartSum().toFixed(2).replace('.', ',');

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

  function openCart()  { renderCart(); document.getElementById('cart-drawer').classList.add('open'); document.getElementById('overlay').classList.add('open'); }
  function closeCart() { document.getElementById('cart-drawer').classList.remove('open'); document.getElementById('overlay').classList.remove('open'); }

  /* ── BOTÃO COMPRAR — redireciona para página do produto ── */
  document.querySelectorAll('.btn-comprar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = this.closest('.prod-card');
      var id   = card ? card.dataset.id : null;
      if (id) window.location.href = '/produto.html?id=' + id;
    });
  });

  var cartWrap = document.querySelector('.cart-wrap');
  if (cartWrap) cartWrap.addEventListener('click', function (e) { e.preventDefault(); openCart(); });
  document.getElementById('cart-close').addEventListener('click', closeCart);

  /* ── OVERLAY ─────────────────────────────────────────── */
  document.getElementById('overlay').addEventListener('click', function () {
    closeCart();
    closeModal('modal-atendimento');
    closeModal('modal-conta');
  });

  /* ── MODAL GENÉRICO ──────────────────────────────────── */
  function openModal(id) {
    if (id === 'modal-conta-logada') {
      var s = getSessao();
      if (s) { document.getElementById('logado-nome').textContent = s.nome; document.getElementById('logado-email').textContent = s.email; }
    }
    document.getElementById(id).classList.add('open');
    document.getElementById('overlay').classList.add('open');
  }
  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
    var anyOpen = document.querySelector('.modal.open, #cart-drawer.open');
    if (!anyOpen) document.getElementById('overlay').classList.remove('open');
  }
  document.querySelectorAll('.modal-close').forEach(function (btn) {
    btn.addEventListener('click', function () { var m = this.closest('.modal'); if (m) closeModal(m.id); });
  });

  var btnAtend = document.querySelector('.hdr-btn[data-action="atendimento"]');
  if (btnAtend) btnAtend.addEventListener('click', function (e) { e.preventDefault(); openModal('modal-atendimento'); });

  var btnConta = document.querySelector('.hdr-btn[data-action="conta"]');
  if (btnConta) btnConta.addEventListener('click', function (e) { e.preventDefault(); openModal('modal-conta'); });

  /* ── ATUALIZAR HEADER ────────────────────────────────── */
  function atualizarHeaderConta() {
    var sessao  = getSessao();
    var btnConta = document.querySelector('.hdr-btn[data-action="conta"], .hdr-btn[data-action="conta-logada"]');
    if (!btnConta) return;
    if (sessao) {
      var primeiro = sessao.nome.split(' ')[0];
      btnConta.innerHTML = '<i class="ti ti-user-circle"></i><span>' + primeiro + '</span>';
      btnConta.dataset.action = 'conta-logada';
    } else {
      btnConta.innerHTML = '<i class="ti ti-user-circle"></i><span>Minha Conta</span>';
      btnConta.dataset.action = 'conta';
    }
    btnConta.onclick = function (e) {
      e.preventDefault();
      getSessao() ? openModal('modal-conta-logada') : openModal('modal-conta');
    };
  }

  /* ── LOGIN ───────────────────────────────────────────── */
  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg   = document.getElementById('login-msg');
      var email = loginForm.querySelector('input[type="email"]').value.trim();
      var senha = loginForm.querySelector('input[type="password"]').value;
      msg.textContent = 'Entrando...'; msg.style.color = '#555';

      api('POST', '/auth/login', { email: email, senha: senha })
        .then(function (data) {
          setToken(data.token);
          setSessao({ nome: data.nome, email: data.email });
          msg.textContent = '✓ Bem-vindo(a), ' + data.nome.split(' ')[0] + '!';
          msg.style.color = '#16a34a';
          setTimeout(function () { closeModal('modal-conta'); msg.textContent = ''; loginForm.reset(); atualizarHeaderConta(); }, 1200);
        })
        .catch(function (err) { msg.textContent = err.message; msg.style.color = '#ef4444'; });
    });
  }

  /* ── CADASTRO ────────────────────────────────────────── */
  var linkCadastro = document.getElementById('link-cadastro');
  var linkLogin    = document.getElementById('link-login');
  if (linkCadastro) linkCadastro.addEventListener('click', function (e) { e.preventDefault(); closeModal('modal-conta'); setTimeout(function () { openModal('modal-cadastro'); }, 150); });
  if (linkLogin)    linkLogin.addEventListener('click', function (e) { e.preventDefault(); closeModal('modal-cadastro'); setTimeout(function () { openModal('modal-conta'); }, 150); });

  /* máscara CPF/CNPJ */
  var cpfInput = document.querySelector('#cadastro-form [name="cpf"]');
  if (cpfInput) {
    cpfInput.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '');
      if (v.length <= 11) v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      else v = v.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
      this.value = v;
    });
  }

  /* máscara telefone */
  var telInput = document.querySelector('#cadastro-form [name="telefone"]');
  if (telInput) {
    telInput.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      else if (v.length > 6) v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
      else if (v.length > 2) v = v.replace(/(\d{2})(\d+)/, '($1) $2');
      this.value = v;
    });
  }

  /* mostrar/ocultar senha */
  document.querySelectorAll('.eye-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var inp = this.previousElementSibling;
      var icon = this.querySelector('i');
      if (inp.type === 'password') { inp.type = 'text'; icon.className = 'ti ti-eye-off'; }
      else { inp.type = 'password'; icon.className = 'ti ti-eye'; }
    });
  });

  var cadastroForm = document.getElementById('cadastro-form');
  if (cadastroForm) {
    cadastroForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg    = document.getElementById('cadastro-msg');
      var nome   = cadastroForm.nome.value.trim();
      var sobre  = cadastroForm.sobrenome.value.trim();
      var email  = cadastroForm.email.value.trim();
      var cpf    = cadastroForm.cpf.value.trim();
      var senha  = cadastroForm.senha.value;
      var senha2 = cadastroForm.senha2.value;
      var aceite = cadastroForm.aceite.checked;

      msg.style.color = '#ef4444';
      if (!nome || !sobre)              { msg.textContent = 'Informe nome e sobrenome.'; return; }
      if (!email || !email.includes('@')){ msg.textContent = 'E-mail inválido.'; return; }
      if (cpf.replace(/\D/g,'').length < 11) { msg.textContent = 'CPF/CNPJ inválido.'; return; }
      if (senha.length < 8)             { msg.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
      if (senha !== senha2)             { msg.textContent = 'As senhas não coincidem.'; return; }
      if (!aceite)                      { msg.textContent = 'Aceite os termos para continuar.'; return; }

      msg.textContent = 'Cadastrando...'; msg.style.color = '#555';

      api('POST', '/auth/cadastro', {
        nome: nome, sobrenome: sobre, email: email, cpf: cpf,
        telefone: cadastroForm.telefone.value.trim(), senha: senha,
        newsletter: cadastroForm.newsletter.checked
      })
        .then(function (data) {
          setToken(data.token);
          setSessao({ nome: data.nome, email: data.email });
          msg.style.color = '#16a34a';
          msg.textContent = '✓ Conta criada! Bem-vindo(a), ' + data.nome.split(' ')[0] + '!';
          setTimeout(function () { closeModal('modal-cadastro'); msg.textContent = ''; cadastroForm.reset(); atualizarHeaderConta(); }, 2200);
        })
        .catch(function (err) { msg.textContent = err.message; msg.style.color = '#ef4444'; });
    });
  }

  /* ── VITRINE DINÂMICA ────────────────────────────────── */
  var _vitrineAnuncios = [];

  function renderVitrine(filtro) {
    var grid  = document.getElementById('vitrine-grid');
    var vazio = document.getElementById('vitrine-vazio');
    if (!grid) return;

    var lista = filtro
      ? _vitrineAnuncios.filter(function (a) { return (a.titulo + (a.marca || '')).toLowerCase().includes(filtro.toLowerCase()); })
      : _vitrineAnuncios;

    if (lista.length === 0) {
      grid.innerHTML = '';
      if (vazio) vazio.style.display = 'block';
      return;
    }
    if (vazio) vazio.style.display = 'none';

    grid.innerHTML = lista.map(function (a) {
      var preco = parseFloat(a.preco) || 0;
      var desc  = parseInt(a.desconto) || 0;
      var pf    = desc > 0 ? preco * (1 - desc / 100) : preco;
      var wpp   = encodeURIComponent('Olá! Tenho interesse no ' + a.titulo);
      var badge = a.status === 'destaque' ? '<span class="prod-badge-novo">Destaque</span>' : (desc > 0 ? '<span class="prod-badge-desc">-' + desc + '%</span>' : '');
      var fotoSrc = (a.fotos && a.fotos.length > 0)
        ? (a.fotos[0].includes('mlstatic.com') ? '/api/ml/img?url=' + encodeURIComponent(a.fotos[0]) : a.fotos[0])
        : null;
      var imgHtml = fotoSrc
        ? '<img src="' + fotoSrc + '" alt="' + a.titulo + '" onerror="this.style.display=\'none\'">'
        : '<i class="ti ti-photo" style="font-size:48px;color:#ddd"></i>';

      return '<div class="prod-card" data-id="' + a.id + '">' +
        '<div class="prod-img-wrap">' + badge + imgHtml + '</div>' +
        '<div class="prod-body">' +
          '<div class="prod-nome">' + a.titulo + '</div>' +
          (desc > 0 ? '<div class="prod-de">R$ ' + preco.toFixed(2).replace('.', ',') + '</div>' : '') +
          '<div class="prod-preco"><sup>R$</sup> ' + pf.toFixed(2).replace('.', ',') + ' <small>à vista</small></div>' +
          '<div class="prod-parcelas">ou 12x de R$ ' + (pf / 12).toFixed(2).replace('.', ',') + ' sem juros</div>' +
        '</div>' +
        '<div class="prod-footer">' +
          '<button class="btn-comprar" onclick="location.href=\'/produto.html?anuncio=' + a.id + '\'">Ver mais</button>' +
          '<a class="btn-wpp" href="https://wa.me/5548999990000?text=' + wpp + '" target="_blank"><i class="ti ti-brand-whatsapp"></i></a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  fetch('/api/anuncios?status=ativo').then(function (r) { return r.json(); }).then(function (anuncios) {
    _vitrineAnuncios = anuncios || [];
    renderVitrine();
  }).catch(function () {
    var grid = document.getElementById('vitrine-grid');
    if (grid) grid.innerHTML = '';
  });

  /* ── BUSCA ───────────────────────────────────────────── */
  var searchInput = document.querySelector('.search-wrap input');
  var searchBtn   = document.querySelector('.search-wrap button');
  function doSearch() {
    var q = searchInput ? searchInput.value.trim() : '';
    if (_vitrineAnuncios.length > 0) {
      renderVitrine(q || null);
      var sec = document.getElementById('produtos');
      if (sec && q) sec.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!q) { document.querySelectorAll('.prod-card').forEach(function (c) { c.style.display = ''; }); return; }
    document.querySelectorAll('.prod-card').forEach(function (card) { card.style.display = card.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none'; });
    var sec = document.getElementById('produtos');
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
  }
  if (searchBtn)   searchBtn.addEventListener('click', doSearch);
  if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

  /* ── NEWSLETTER ──────────────────────────────────────── */
  var nlBtn   = document.querySelector('.newsletter-form button');
  var nlInput = document.querySelector('.newsletter-form input');
  if (nlBtn) {
    nlBtn.addEventListener('click', function () {
      if (!nlInput.value || !nlInput.value.includes('@')) { nlInput.style.borderColor = '#ef4444'; nlInput.focus(); return; }
      nlInput.style.borderColor = '';
      nlBtn.textContent = '✓ Cadastrado!'; nlBtn.disabled = true; nlInput.value = '';
      setTimeout(function () { nlBtn.textContent = 'QUERO RECEBER'; nlBtn.disabled = false; }, 3000);
    });
  }

  /* ── SAIBA MAIS (barra frete) ────────────────────────── */
  var saibaMais = document.querySelector('.barra-frete a');
  if (saibaMais) saibaMais.addEventListener('click', function (e) { e.preventDefault(); openModal('modal-atendimento'); });

  /* ── MODAL CONTA LOGADA ──────────────────────────────── */
  var modalContaLogada = document.getElementById('modal-conta-logada');
  if (modalContaLogada) {
    modalContaLogada.addEventListener('click', function (e) { if (e.target === modalContaLogada) closeModal('modal-conta-logada'); });
    document.getElementById('btn-sair-conta').addEventListener('click', function () {
      clearSessao(); closeModal('modal-conta-logada'); atualizarHeaderConta();
    });
  }

  /* ── FINALIZAR COMPRA ────────────────────────────────── */
  var checkoutBtn = document.querySelector('.cart-checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function () {
      if (cart.length === 0) return;
      var sessao = getSessao();
      if (!sessao) { closeCart(); setTimeout(function () { openModal('modal-conta'); }, 200); return; }
      closeCart();
      openModal('modal-pagamento');
    });
  }

  /* ── MODAL DE PAGAMENTO ──────────────────────────────── */
  var modalPag = document.getElementById('modal-pagamento');
  if (modalPag) {
    var btnPagarMP    = document.getElementById('btn-pagar-mp');
    var btnPagarLocal = document.getElementById('btn-pagar-local');
    var pagMsg        = document.getElementById('pagamento-msg');

    if (btnPagarMP) {
      btnPagarMP.addEventListener('click', function () {
        if (cart.length === 0) return;
        pagMsg.textContent = 'Preparando pagamento...';
        pagMsg.style.color = '#555';
        btnPagarMP.disabled = true;

        var itens   = cart.map(function (i) { return { nome: i.name, qty: i.qty, preco: i.price }; });
        var prodStr = cart.map(function (i) { return i.name + (i.qty > 1 ? ' x' + i.qty : ''); }).join(', ');

        api('POST', '/pedidos', { produtos: prodStr, total: cartSum() })
          .then(function (pedido) { return api('POST', '/pagamento/criar', { itens: itens, pedidoId: pedido.id }); })
          .then(function (pref) {
            cart = []; updateBadge(); renderCart();
            closeModal('modal-pagamento');
            window.location.href = pref.sandbox_init_point || pref.init_point;
          })
          .catch(function (err) {
            pagMsg.textContent = err.message;
            pagMsg.style.color = '#ef4444';
            btnPagarMP.disabled = false;
          });
      });
    }

    if (btnPagarLocal) {
      btnPagarLocal.addEventListener('click', function () {
        var prodStr = cart.map(function (i) { return i.name + (i.qty > 1 ? ' x' + i.qty : ''); }).join(', ');
        api('POST', '/pedidos', { produtos: prodStr, total: cartSum() })
          .then(function () {
            cart = []; updateBadge(); renderCart();
            closeModal('modal-pagamento');
            var aviso = document.createElement('div');
            aviso.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2)';
            aviso.textContent = '✓ Pedido realizado! Entraremos em contato para pagamento.';
            document.body.appendChild(aviso);
            setTimeout(function () { aviso.remove(); }, 4000);
          })
          .catch(function (err) { alert('Erro: ' + err.message); });
      });
    }
  }

  /* ── INICIALIZA ──────────────────────────────────────── */
  updateBadge();
  atualizarHeaderConta();
})();
