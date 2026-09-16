(function () {
  var API = '/api';
  var cart = [];
  var enderecoSelecionadoId = null;
  var etapaAtual = 1;

  /* ── UTILS ────────────────────────────────────── */
  function getToken()  { return sessionStorage.getItem('allecom_token') || ''; }
  function getSessao() { try { return JSON.parse(sessionStorage.getItem('allecom_sessao') || 'null'); } catch { return null; } }

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
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (cor||'#16a34a') + ';color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  /* ── CARRINHO ─────────────────────────────────── */
  function carregarCart() {
    try { cart = JSON.parse(sessionStorage.getItem('allecom_checkout_cart') || '[]'); } catch { cart = []; }
  }

  function cartSum() { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

  /* ── RESUMO LATERAL ───────────────────────────── */
  function renderResumoLateral() {
    var listaEl   = document.getElementById('resumo-produtos-lista');
    var qtdEl     = document.getElementById('resumo-qtd-label');
    var subtotEl  = document.getElementById('resumo-subtotal');
    var totalEl   = document.getElementById('resumo-total');
    var total     = cartSum();
    var totalQtd  = cart.reduce(function (s, i) { return s + i.qty; }, 0);

    if (qtdEl) qtdEl.textContent = '(' + totalQtd + ')';

    if (listaEl) {
      listaEl.innerHTML = cart.map(function (i) {
        var img = i.foto
          ? '<img class="resumo-produto-img" src="' + i.foto + '" alt="">'
          : '<div class="resumo-produto-img-placeholder"><i class="ti ti-photo"></i></div>';
        return '<div class="resumo-produto-item">' + img +
          '<div class="resumo-produto-info">' +
            '<div class="resumo-produto-nome">' + i.name + (i.qty > 1 ? ' ×' + i.qty : '') + '</div>' +
            '<div class="resumo-produto-preco">' + fmt(i.price * i.qty) + '</div>' +
          '</div></div>';
      }).join('');
    }

    if (subtotEl) subtotEl.textContent = fmt(total);
    atualizarTotal();
  }

  function atualizarTotal() {
    var metodo    = document.querySelector('input[name="metodo_pag"]:checked');
    var totalEl   = document.getElementById('resumo-total');
    var descEl    = document.getElementById('resumo-desconto');
    var linhaDesc = document.getElementById('linha-desconto');
    var pixEcon   = document.getElementById('pix-economia');
    var total     = cartSum();

    if (metodo && metodo.value === 'pix') {
      var desc = total * 0.05;
      if (linhaDesc) linhaDesc.style.display = '';
      if (descEl)    descEl.textContent = '- ' + fmt(desc);
      if (totalEl)   totalEl.textContent = fmt(total * 0.95);
      if (pixEcon)   pixEcon.textContent = fmt(desc);
    } else {
      if (linhaDesc) linhaDesc.style.display = 'none';
      if (totalEl)   totalEl.textContent = fmt(total);
      if (pixEcon)   pixEcon.textContent = fmt(total * 0.05);
    }
  }

  /* ── ETAPAS ───────────────────────────────────── */
  function abrirEtapa(num) {
    etapaAtual = num;
    for (var i = 1; i <= 4; i++) {
      var etapa = document.getElementById('etapa-' + i);
      var corpo = document.getElementById('corpo-' + i);
      if (!etapa || !corpo) continue;
      if (i === num) {
        etapa.classList.remove('ck-etapa-fechada');
        corpo.style.display = '';
      } else if (i > num) {
        etapa.classList.add('ck-etapa-fechada');
        corpo.style.display = 'none';
      } else {
        /* etapas já concluídas — mantém aberta mas não repete */
        etapa.classList.remove('ck-etapa-fechada');
      }
    }
    /* scroll suave para a etapa */
    var el = document.getElementById('etapa-' + num);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── ETAPA 1: INFORMAÇÕES PESSOAIS ───────────── */
  var sessao = getSessao();
  if (sessao) {
    var emailEl = document.getElementById('info-email');
    var nomeEl  = document.getElementById('info-nome');
    if (emailEl) { emailEl.value = sessao.email || ''; emailEl.closest('.ck-field').classList.add('valid'); }
    if (nomeEl)  { nomeEl.value  = sessao.nome  || ''; }
  }

  /* máscara CPF */
  var cpfEl = document.getElementById('info-cpf');
  if (cpfEl) {
    cpfEl.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 9)     v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
      else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, '$1.$2');
      this.value = v;
    });
  }

  /* máscara telefone */
  var telInfoEl = document.getElementById('info-tel');
  if (telInfoEl) {
    telInfoEl.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10)      v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      else if (v.length > 6)  v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
      else if (v.length > 2)  v = v.replace(/(\d{2})(\d+)/, '($1) $2');
      this.value = v;
    });
  }

  var btnIrEtapa2 = document.getElementById('btn-ir-etapa2');
  if (btnIrEtapa2) {
    btnIrEtapa2.addEventListener('click', function () {
      var nome = document.getElementById('info-nome').value.trim();
      var msgEl = document.getElementById('info-msg-nome');
      var campo = document.getElementById('info-nome').closest('.ck-field');
      var errIcon = campo.querySelector('.ck-field-err');
      if (!nome) {
        campo.classList.add('invalid');
        if (errIcon) errIcon.style.display = '';
        if (msgEl) msgEl.style.display = '';
        return;
      }
      campo.classList.remove('invalid'); campo.classList.add('valid');
      if (errIcon) errIcon.style.display = 'none';
      if (msgEl) msgEl.style.display = 'none';
      abrirEtapa(2);
      carregarEnderecos();
    });
  }

  /* ── ETAPA 2: ENDEREÇO ────────────────────────── */
  var formWrap    = document.getElementById('form-endereco-wrap');
  var formEnd     = document.getElementById('form-endereco');
  var listaEl     = document.getElementById('enderecos-lista');
  var btnAddEnd   = document.getElementById('btn-add-endereco');
  var btnCancelar = document.getElementById('btn-end-cancelar');
  var cepInput    = document.getElementById('end-cep');
  var semNumChk   = document.getElementById('end-sem-numero');
  var numInput    = document.getElementById('end-numero');
  var telEndEl    = document.getElementById('end-telefone');
  var btnIrEtapa3 = document.getElementById('btn-ir-etapa3');

  function mostrarFormEndereco(endereco) {
    formWrap.style.display = 'block';
    btnAddEnd.style.display = 'none';
    if (btnIrEtapa3) btnIrEtapa3.style.display = 'none';
    document.getElementById('form-end-titulo').textContent = endereco ? 'Editar endereço' : 'Adicione um endereço';
    if (endereco) {
      document.getElementById('end-id').value          = endereco.id;
      cepInput.value                                    = endereco.cep || '';
      document.getElementById('end-rua').value         = endereco.rua || '';
      document.getElementById('end-numero').value      = endereco.numero === 'S/N' ? '' : (endereco.numero || '');
      document.getElementById('end-sem-numero').checked= endereco.numero === 'S/N';
      document.getElementById('end-complemento').value = endereco.complemento || '';
      document.getElementById('end-bairro').value      = endereco.bairro || '';
      document.getElementById('end-cidade').value      = endereco.cidade || '';
      document.getElementById('end-estado').value      = endereco.estado || '';
      document.getElementById('end-nome').value        = endereco.nome || '';
      telEndEl.value                                    = endereco.telefone || '';
      document.getElementById('end-predefinido').checked= !!endereco.predefinido;
    } else {
      formEnd.reset();
      document.getElementById('end-id').value = '';
      var s = getSessao();
      if (s) { document.getElementById('end-nome').value = s.nome || ''; }
    }
  }

  function fecharFormEndereco() {
    formWrap.style.display = 'none';
    btnAddEnd.style.display = '';
    document.getElementById('end-msg-erro').textContent = '';
    if (enderecoSelecionadoId && btnIrEtapa3) btnIrEtapa3.style.display = '';
  }

  function renderEnderecos(lista) {
    if (!lista || !lista.length) {
      listaEl.innerHTML = '';
      if (btnIrEtapa3) btnIrEtapa3.style.display = 'none';
      return;
    }
    var predefinido = lista.find(function (e) { return e.predefinido; }) || lista[0];
    if (!enderecoSelecionadoId) enderecoSelecionadoId = predefinido.id;

    listaEl.innerHTML = lista.map(function (e) {
      var sel = e.id === enderecoSelecionadoId ? ' selecionado' : '';
      return '<div class="endereco-card' + sel + '" data-id="' + e.id + '">' +
        '<div class="endereco-card-acoes">' +
          '<button class="end-btn-edit" data-edit="' + e.id + '" title="Editar"><i class="ti ti-pencil"></i></button>' +
          '<button class="end-btn-del"  data-del="'  + e.id + '" title="Excluir"><i class="ti ti-trash"></i></button>' +
        '</div>' +
        '<div class="endereco-card-nome">' + e.nome + '</div>' +
        '<div class="endereco-card-rua">' + e.rua + ', ' + e.numero + (e.complemento ? ' — ' + e.complemento : '') + '</div>' +
        '<div class="endereco-card-rua">' + (e.bairro ? e.bairro + ' · ' : '') + e.cidade + ' — ' + e.estado + ' · CEP ' + e.cep + '</div>' +
        (e.predefinido ? '<span class="endereco-card-tag">Predefinido</span>' : '') +
      '</div>';
    }).join('');

    if (btnIrEtapa3) btnIrEtapa3.style.display = '';

    listaEl.querySelectorAll('.endereco-card').forEach(function (card) {
      card.addEventListener('click', function (ev) {
        if (ev.target.closest('.end-btn-edit, .end-btn-del')) return;
        listaEl.querySelectorAll('.endereco-card').forEach(function (c) { c.classList.remove('selecionado'); });
        card.classList.add('selecionado');
        enderecoSelecionadoId = +card.dataset.id;
        if (btnIrEtapa3) btnIrEtapa3.style.display = '';
      });
    });

    listaEl.querySelectorAll('.end-btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        api('GET', '/enderecos').then(function (l) {
          var end = l.find(function (x) { return x.id === +btn.dataset.edit; });
          if (end) mostrarFormEndereco(end);
        });
      });
    });

    listaEl.querySelectorAll('.end-btn-del').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!confirm('Excluir este endereço?')) return;
        api('DELETE', '/enderecos/' + btn.dataset.del).then(carregarEnderecos).catch(function (err) { alert(err.message); });
      });
    });
  }

  function carregarEnderecos() {
    api('GET', '/enderecos').then(renderEnderecos).catch(function () {});
  }

  if (btnAddEnd)   btnAddEnd.addEventListener('click', function () { mostrarFormEndereco(null); });
  if (btnCancelar) btnCancelar.addEventListener('click', fecharFormEndereco);
  if (btnIrEtapa3) btnIrEtapa3.addEventListener('click', function () { abrirEtapa(3); });

  /* CEP */
  if (cepInput) {
    cepInput.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '').slice(0, 8);
      this.value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
      if (v.length === 8) buscarCep(v);
    });
  }

  function buscarCep(cep) {
    var msgEl = document.getElementById('end-msg-cep');
    msgEl.textContent = 'Buscando...'; msgEl.style.color = '#888';
    fetch('https://viacep.com.br/ws/' + cep + '/json/')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.erro) { msgEl.textContent = 'CEP não encontrado.'; msgEl.style.color = '#ef4444'; return; }
        document.getElementById('end-rua').value    = d.logradouro || '';
        document.getElementById('end-bairro').value = d.bairro || '';
        document.getElementById('end-cidade').value = d.localidade || '';
        document.getElementById('end-estado').value = d.uf || '';
        msgEl.textContent = '✓ Endereço encontrado!'; msgEl.style.color = '#00a650';
        document.getElementById('end-numero').focus();
      })
      .catch(function () { msgEl.textContent = 'Erro ao buscar CEP.'; msgEl.style.color = '#ef4444'; });
  }

  if (semNumChk) {
    semNumChk.addEventListener('change', function () { numInput.disabled = this.checked; if (this.checked) numInput.value = ''; });
  }

  if (telEndEl) {
    telEndEl.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10)      v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      else if (v.length > 6)  v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
      else if (v.length > 2)  v = v.replace(/(\d{2})(\d+)/, '($1) $2');
      this.value = v;
    });
  }

  if (formEnd) {
    formEnd.addEventListener('submit', function (e) {
      e.preventDefault();
      var msgErro = document.getElementById('end-msg-erro');
      var cep    = document.getElementById('end-cep').value.trim();
      var rua    = document.getElementById('end-rua').value.trim();
      var nome   = document.getElementById('end-nome').value.trim();
      var semNum = document.getElementById('end-sem-numero').checked;
      var numero = semNum ? 'S/N' : document.getElementById('end-numero').value.trim();
      msgErro.textContent = '';
      if (!cep)  { msgErro.textContent = 'Informe o CEP.'; return; }
      if (!rua)  { msgErro.textContent = 'Informe a rua.'; return; }
      if (!nome) { msgErro.textContent = 'Informe o nome completo.'; return; }
      if (!semNum && !numero) { msgErro.textContent = 'Informe o número ou marque "Sem número".'; return; }
      var id = document.getElementById('end-id').value;
      var payload = {
        cep, rua, numero,
        complemento: document.getElementById('end-complemento').value.trim(),
        bairro: document.getElementById('end-bairro').value.trim(),
        cidade: document.getElementById('end-cidade').value.trim(),
        estado: document.getElementById('end-estado').value.trim().toUpperCase(),
        nome,
        telefone: document.getElementById('end-telefone').value.trim(),
        predefinido: document.getElementById('end-predefinido').checked
      };
      var req = id ? api('PUT', '/enderecos/' + id, payload) : api('POST', '/enderecos', payload);
      req.then(function (saved) {
        enderecoSelecionadoId = saved.id || enderecoSelecionadoId;
        fecharFormEndereco();
        carregarEnderecos();
        toast('✓ Endereço salvo!', '#16a34a');
      }).catch(function (err) { msgErro.textContent = err.message; });
    });
  }

  /* ── ETAPA 3: ENVIO ───────────────────────────── */
  var btnIrEtapa4 = document.getElementById('btn-ir-etapa4');
  if (btnIrEtapa4) {
    btnIrEtapa4.addEventListener('click', function () {
      abrirEtapa(4);
      preencherParcelas();
      atualizarTotal();
    });
  }

  /* ── ETAPA 4: PAGAMENTO ───────────────────────── */
  document.querySelectorAll('input[name="metodo_pag"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      var form = document.getElementById('ck-cartao-form');
      if (form) form.style.display = this.value === 'cartao' ? 'block' : 'none';
      atualizarTotal();
    });
  });

  function preencherParcelas() {
    var sel = document.getElementById('cartao-parcelas');
    if (!sel) return;
    var total = cartSum();
    sel.innerHTML = '';
    for (var i = 1; i <= 10; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i + 'x de ' + fmt(total / i) + ' sem juros';
      sel.appendChild(opt);
    }
  }

  /* máscaras cartão */
  var cnEl = document.getElementById('cartao-numero');
  if (cnEl) cnEl.addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 16);
    this.value = v.replace(/(\d{4})(?=\d)/g, '$1 ');
  });
  var cvEl = document.getElementById('cartao-validade');
  if (cvEl) cvEl.addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 4);
    this.value = v.length > 2 ? v.slice(0,2) + '/' + v.slice(2) : v;
  });
  var ccEl = document.getElementById('cartao-cpf');
  if (ccEl) ccEl.addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9)      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, '$1.$2');
    this.value = v;
  });

  /* ── OBSERVAÇÕES ──────────────────────────────── */
  var btnObs = document.getElementById('btn-obs');
  var obsTA  = document.getElementById('ck-obs-textarea');
  if (btnObs && obsTA) {
    btnObs.addEventListener('click', function () {
      var open = obsTA.style.display !== 'none';
      obsTA.style.display = open ? 'none' : 'block';
      var icon = btnObs.querySelector('i');
      if (icon) icon.className = open ? 'ti ti-chevron-down' : 'ti ti-chevron-up';
    });
  }

  /* ── FINALIZAR PEDIDO ─────────────────────────── */
  var btnFinalizar = document.getElementById('btn-finalizar');
  var finalizarMsg = document.getElementById('finalizar-msg');

  if (btnFinalizar) {
    btnFinalizar.addEventListener('click', function () {
      if (etapaAtual < 4) {
        finalizarMsg.textContent = 'Complete todas as etapas antes de finalizar.';
        return;
      }
      finalizarMsg.textContent = '';
      var metodo  = document.querySelector('input[name="metodo_pag"]:checked');
      var total   = cartSum();
      var isPix   = metodo && metodo.value === 'pix';
      var totalFinal = isPix ? total * 0.95 : total;
      var obs     = document.getElementById('ck-obs-textarea').value.trim();
      var prodStr = cart.map(function (i) { return i.name + (i.qty > 1 ? ' x' + i.qty : ''); }).join(', ');

      btnFinalizar.disabled = true;
      btnFinalizar.textContent = 'Processando...';

      var metodoStr = metodo ? metodo.value : 'loja';

      if (metodoStr === 'loja' || metodoStr === 'boleto') {
        api('POST', '/pedidos', { produtos: prodStr, total: totalFinal, obs: obs })
          .then(function () {
            sessionStorage.removeItem('allecom_checkout_cart');
            toast('✓ Pedido realizado! Entraremos em contato.', '#16a34a');
            setTimeout(function () { window.location.href = '/index.html'; }, 2000);
          })
          .catch(function (err) {
            finalizarMsg.textContent = err.message;
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = 'Finalizar pedido';
          });
        return;
      }

      /* Pix / Cartão → Mercado Pago */
      var itens = cart.map(function (i) { return { nome: i.name, qty: i.qty, preco: isPix ? i.price * 0.95 : i.price }; });
      api('POST', '/pedidos', { produtos: prodStr, total: totalFinal, obs: obs })
        .then(function (ped) { return api('POST', '/pagamento/criar', { itens: itens, pedidoId: ped.id }); })
        .then(function (pref) {
          sessionStorage.removeItem('allecom_checkout_cart');
          window.location.href = pref.sandbox_init_point || pref.init_point;
        })
        .catch(function (err) {
          finalizarMsg.textContent = err.message;
          btnFinalizar.disabled = false;
          btnFinalizar.textContent = 'Finalizar pedido';
        });
    });
  }

  /* ── INICIALIZA ───────────────────────────────── */
  if (!getSessao()) { window.location.href = '/index.html'; return; }
  carregarCart();
  renderResumoLateral();
  atualizarTotal();
})();
