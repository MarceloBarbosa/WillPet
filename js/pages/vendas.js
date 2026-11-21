import {
  sb, el, hasPerm, q, todas, acao, modal, tabela, campo, input, select, botao, toast, brl, num, dataHoraBR,
  hojeISO, inicioDiaISO, fimDiaISO, buscarProdutos, gerarCupom, exportarCSV, exportarPDF, FORMAS, CREDITOS,
} from '../core.js';

export const paginas = [
  { id: 'pdv', titulo: 'Vendas (PDV)', grupo: 'Vendas', perm: 'vendas', render: renderPDV },
  { id: 'historico', titulo: 'Histórico de vendas', grupo: 'Vendas', perm: 'vendas', render: renderHistorico },
  { id: 'carteira', titulo: 'Carteira (fiado)', grupo: 'Vendas', perm: 'carteira', render: renderCarteira },
];

const ehCartao = f => f === 'DEBITO' || f.startsWith('CREDITO');

// Taxa estimada da máquina escolhida para a forma de pagamento
function taxaDe(cartao, forma) {
  if (!cartao || !ehCartao(forma)) return 0;
  if (forma === 'DEBITO') return Number(cartao.debito) || 0;
  const n = Number(forma.match(/\d+/)[0]);
  return Number(cartao.credito[n - 1]) || 0;
}

// ============================================================
// PDV
// ============================================================
async function renderPDV(root) {
  const [cartoes, clientes] = await Promise.all([
    q(sb.from('cartao_maquinas').select('*').eq('ativo', true).order('maquina')),
    q(sb.from('clientes').select('nome').order('nome').limit(2000)),
  ]);
  const carrinho = [];
  let forma = 'DINHEIRO';

  const $busca = input({ placeholder: 'Código, código de barras ou nome — Enter adiciona', autofocus: true, autocomplete: 'off' });
  const $qtd = input({ type: 'number', min: '1', step: '1', value: '1', class: 'input qtd' });
  const $res = el('div', { class: 'resultados' });
  const $carrinho = el('div');
  const $totais = el('div', { class: 'totais' });
  const $cliente = input({ list: 'lista-clientes', placeholder: 'Nome do cliente (obrigatório na carteira)' });
  const $obs = input({ placeholder: 'Observação (opcional)' });
  const $formaSel = select(FORMAS, { value: forma });
  const $cartaoSel = select([{ value: '', label: '— escolha a máquina —' },
    ...cartoes.map(c => ({ value: c.id, label: `${c.maquina} · ${c.bandeira}` }))]);
  const $blocoCartao = el('div', { class: 'campo', hidden: true }, el('span', {}, 'Máquina / bandeira'), $cartaoSel);
  const datalist = el('datalist', { id: 'lista-clientes' }, clientes.map(c => el('option', { value: c.nome })));

  function adicionar(p, qtd = 1) {
    if (!p.ativo) return toast('Produto inativo.', 'erro');
    const existente = carrinho.find(i => i.produto_id === p.id);
    const jaNoCarrinho = existente ? existente.qtd : 0;
    if (jaNoCarrinho + qtd > Number(p.estoque)) {
      return toast(`Estoque disponível de ${p.nome}: ${p.estoque}`, 'erro');
    }
    if (existente) existente.qtd += qtd;
    else carrinho.push({ produto_id: p.id, codigo: p.codigo, nome: p.nome, preco: Number(p.preco), custo: Number(p.custo), estoque: Number(p.estoque), qtd, desc: 0 });
    $busca.value = '';
    $res.replaceChildren();
    $qtd.value = '1';
    desenhar();
    $busca.focus();
  }

  async function pesquisar(termo, rapido) {
    const lista = await buscarProdutos(termo);
    const exato = lista.find(p => p.codigo === termo.trim() || p.codigo_barras === termo.trim());
    if (rapido && exato) return adicionar(exato, Math.max(1, parseInt($qtd.value, 10) || 1));
    if (!lista.length) { toast('Produto não encontrado.', 'erro'); return; }
    $res.replaceChildren(...lista.map(p => el('button', {
      class: 'resultado', type: 'button',
      onclick: () => adicionar(p, Math.max(1, parseInt($qtd.value, 10) || 1)),
    }, el('b', {}, p.nome), el('span', {}, ` · ${p.codigo} · ${brl(p.preco)} · estoque ${num(p.estoque)}`))));
  }

  $busca.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); acao(() => pesquisar($busca.value, true))(); }
  });

  function totaisAtuais() {
    const subtotal = carrinho.reduce((s, i) => s + i.qtd * i.preco, 0);
    const desconto = carrinho.reduce((s, i) => s + (Number(i.desc) || 0), 0);
    const cartao = cartoes.find(c => String(c.id) === $cartaoSel.value);
    const taxa = (subtotal - desconto) * taxaDe(cartao, forma);
    return { subtotal, desconto, total: subtotal - desconto, taxa };
  }

  function desenhar() {
    const cols = [{ h: 'Código' }, { h: 'Produto' }, { h: 'Qtd', num: true }, { h: 'Unitário', num: true }, { h: 'Desconto (R$)', num: true }, { h: 'Total', num: true }, { h: '' }];
    const linhas = carrinho.map((i, idx) => {
      const $q = input({ type: 'number', min: '1', step: '1', value: i.qtd, class: 'input qtd' });
      const $d = input({ type: 'number', min: '0', step: '0.01', value: i.desc || '', class: 'input desc', placeholder: '0,00', disabled: !hasPerm('desconto') });
      $q.addEventListener('change', () => {
        const v = Math.floor(Number($q.value));
        if (!(v > 0)) { $q.value = i.qtd; return; }
        if (v > i.estoque) { toast(`Estoque disponível: ${i.estoque}`, 'erro'); $q.value = i.qtd; return; }
        i.qtd = v; desenhar();
      });
      $d.addEventListener('change', () => {
        const v = Math.max(0, Number($d.value) || 0);
        if (v > i.qtd * i.preco) { toast('Desconto maior que o valor do item.', 'erro'); $d.value = i.desc || ''; return; }
        i.desc = Math.round(v * 100) / 100; desenhar();
      });
      return {
        cells: [i.codigo, i.nome, $q, brl(i.preco), $d, brl(i.qtd * i.preco - (i.desc || 0)),
          botao('✕', () => { carrinho.splice(idx, 1); desenhar(); }, 'btn icone perigo')],
      };
    });
    $carrinho.replaceChildren(tabela(cols, linhas, { vazio: 'Carrinho vazio — bipe ou digite um produto.' }));
    const t = totaisAtuais();
    $totais.replaceChildren(
      el('div', { class: 'linha-total' }, el('span', {}, 'Subtotal'), brl(t.subtotal)),
      el('div', { class: 'linha-total' }, el('span', {}, 'Descontos'), brl(t.desconto)),
      el('div', { class: 'linha-total grande' }, el('span', {}, 'TOTAL'), brl(t.total)),
      t.taxa > 0 ? el('div', { class: 'linha-total muted' }, el('span', {}, 'Taxa estimada da máquina'), brl(t.taxa)) : null,
    );
  }

  $formaSel.addEventListener('change', () => {
    forma = $formaSel.value;
    $blocoCartao.hidden = !ehCartao(forma);
    desenhar();
  });
  $cartaoSel.addEventListener('change', desenhar);

  const finalizar = acao(async () => {
    if (!carrinho.length) return toast('Adicione produtos antes de finalizar.', 'erro');
    if (ehCartao(forma) && !$cartaoSel.value) return toast('Escolha a máquina/bandeira.', 'erro');
    if (forma === 'CARTEIRA' && !$cliente.value.trim()) return toast('Informe o cliente para a carteira.', 'erro');
    const itens = carrinho.map(i => ({ produto_id: i.produto_id, quantidade: i.qtd, desconto: i.desc || 0 }));
    const vendaId = await q(sb.rpc('finalizar_venda', {
      p_itens: itens,
      p_forma: forma,
      p_cliente: $cliente.value.trim() || null,
      p_cartao_id: ehCartao(forma) ? Number($cartaoSel.value) : null,
      p_obs: $obs.value.trim() || null,
    }));
    const snapshot = carrinho.map(i => ({ ...i }));
    const t = totaisAtuais();
    const clienteVenda = $cliente.value.trim() || null;
    carrinho.length = 0;
    $cliente.value = ''; $obs.value = ''; $cartaoSel.value = '';
    desenhar();
    toast(`Venda #${vendaId} registrada.`);
    modal(`Venda #${vendaId} registrada`, el('p', {}, `Total ${brl(t.total)} · ${forma}`), [
      { label: 'Imprimir cupom', classe: 'btn primario', acao: () => {
        gerarCupom({ id: vendaId, forma, cliente: clienteVenda, itens: snapshot, subtotal: t.subtotal, desconto: t.desconto, total: t.total });
      } },
    ]);
    $busca.focus();
  });

  const orcamento = () => {
    if (!carrinho.length) return toast('Carrinho vazio.', 'erro');
    const t = totaisAtuais();
    gerarCupom({ tipo: 'ORCAMENTO', itens: carrinho, subtotal: t.subtotal, desconto: t.desconto, total: t.total, cliente: $cliente.value || null });
  };

  root.append(
    el('div', { class: 'pdv' },
      el('section', { class: 'pdv-esq' },
        el('div', { class: 'busca-linha' }, $busca,
          el('label', { class: 'qtd-label' }, 'Qtd', $qtd),
          botao('Adicionar', acao(() => pesquisar($busca.value, true)), 'btn')),
        $res,
        $carrinho),
      el('aside', { class: 'pdv-dir' },
        $totais,
        el('div', { class: 'form-col' },
          campo('Forma de pagamento', $formaSel),
          $blocoCartao,
          campo('Cliente', $cliente),
          campo('Observação', $obs),
        ),
        el('div', { class: 'acoes-pdv' },
          botao('Orçamento (PDF)', orcamento, 'btn'),
          botao('Finalizar venda', finalizar, 'btn primario grande')),
      ),
      datalist,
    ),
  );
  desenhar();
  $busca.focus();
}

// ============================================================
// HISTÓRICO
// ============================================================
async function renderHistorico(root) {
  const $ini = input({ type: 'date', value: hojeISO() });
  const $fim = input({ type: 'date', value: hojeISO() });
  const $forma = select([{ value: '', label: 'Todas as formas' }, ...FORMAS.map(f => ({ value: f, label: f }))]);
  const $saida = el('div');
  const podeCancelar = hasPerm('cancelar');
  const podeLucro = hasPerm('relatorios');

  async function carregar() {
    let qy = sb.from('vendas').select('*')
      .gte('data', inicioDiaISO($ini.value)).lte('data', fimDiaISO($fim.value))
      .order('data', { ascending: false }).limit(1000);
    if ($forma.value) qy = qy.eq('forma_pagamento', $forma.value);
    const vendas = await q(qy);
    const validas = vendas.filter(v => !v.cancelada);
    const total = validas.reduce((s, v) => s + Number(v.total), 0);
    const lucro = validas.reduce((s, v) => s + Number(v.lucro), 0);

    const colunas = [{ h: 'Nº', num: true }, { h: 'Data' }, { h: 'Cliente' }, { h: 'Pagamento' }, { h: 'Desconto', num: true },
      { h: 'Total', num: true }, ...(podeLucro ? [{ h: 'Lucro', num: true }] : []), { h: 'Situação' }, { h: '' }];
    const linhas = vendas.map(v => ({
      classe: v.cancelada ? 'cancelada' : '',
      cells: [
        `#${v.id}`, dataHoraBR(v.data), v.cliente_nome || '—', v.forma_pagamento, brl(v.desconto), brl(v.total),
        ...(podeLucro ? [brl(v.lucro)] : []),
        v.cancelada ? 'CANCELADA' : v.forma_pagamento === 'CARTEIRA' ? (v.status_pagamento === 'PAGO' ? 'FIADO RECEBIDO' : 'EM ABERTO') : 'OK',
        el('div', { class: 'acoes-linha' },
          botao('Cupom', acao(() => imprimirVenda(v)), 'btn pequeno'),
          podeCancelar && !v.cancelada ? botao('Cancelar', acao(() => cancelar(v)), 'btn pequeno perigo') : null),
      ],
    }));
    const rodape = { cells: ['', '', '', '', '', el('b', {}, brl(total)), ...(podeLucro ? [el('b', {}, brl(lucro))] : []), '', ''], classe: 'totalizador' };
    $saida.replaceChildren(
      el('p', { class: 'muted' }, `${validas.length} venda(s) válida(s) · ${vendas.length - validas.length} cancelada(s)`),
      tabela(colunas, [...linhas, rodape]),
    );
  }

  async function imprimirVenda(v) {
    const itens = await q(sb.from('venda_itens').select('*').eq('venda_id', v.id));
    gerarCupom({
      id: v.id, data: v.data, forma: v.forma_pagamento, cliente: v.cliente_nome,
      itens: itens.map(i => ({ codigo: i.codigo, nome: i.produto_nome, qtd: i.quantidade, preco: Number(i.preco_unit), desc: Number(i.desconto) })),
      subtotal: Number(v.subtotal), desconto: Number(v.desconto), total: Number(v.total),
    });
  }

  async function cancelar(v) {
    modal(`Cancelar venda #${v.id}?`, el('p', {}, 'O estoque dos itens será devolvido. A venda continua no histórico marcada como cancelada.'), [
      { label: 'Confirmar cancelamento', classe: 'btn perigo', acao: acao(async () => {
        await q(sb.rpc('cancelar_venda', { p_venda: v.id }));
        toast(`Venda #${v.id} cancelada.`);
        await carregar();
      }) },
    ]);
  }

  const exportar = (tipo) => async () => {
    const vendas = await q(sb.from('vendas').select('*')
      .gte('data', inicioDiaISO($ini.value)).lte('data', fimDiaISO($fim.value)).order('data').limit(5000));
    const colunas = [{ h: 'Nº' }, { h: 'Data' }, { h: 'Cliente' }, { h: 'Pagamento' }, { h: 'Total' }, { h: 'Situação' }];
    const linhas = vendas.map(v => ({ cells: [`#${v.id}`, dataHoraBR(v.data), v.cliente_nome || '', v.forma_pagamento, brl(v.total), v.cancelada ? 'CANCELADA' : 'OK'] }));
    const nome = `vendas-${$ini.value}-a-${$fim.value}`;
    if (tipo === 'csv') exportarCSV(nome, colunas, linhas);
    else exportarPDF(nome, 'Histórico de vendas', `Período: ${$ini.value} a ${$fim.value}`, colunas, linhas);
  };

  root.append(
    el('h2', {}, 'Histórico de vendas'),
    el('div', { class: 'filtros' },
      campo('De', $ini), campo('Até', $fim), campo('Forma', $forma),
      botao('Buscar', acao(carregar), 'btn primario'),
      botao('CSV', acao(exportar('csv')), 'btn'),
      botao('PDF', acao(exportar('pdf')), 'btn')),
    $saida,
  );
  $forma.addEventListener('change', acao(carregar));
  await carregar();
}

// ============================================================
// CARTEIRA (FIADO)
// ============================================================
async function renderCarteira(root) {
  const $filtro = input({ placeholder: 'Filtrar por cliente' });
  const $saida = el('div');

  async function carregar() {
    const abertas = await q(sb.from('vendas').select('*')
      .eq('forma_pagamento', 'CARTEIRA').eq('status_pagamento', 'ABERTO').eq('cancelada', false)
      .order('data').limit(2000));
    const termo = $filtro.value.trim().toUpperCase();
    const filtradas = termo ? abertas.filter(v => (v.cliente_nome || '').includes(termo)) : abertas;

    const grupos = new Map();
    for (const v of filtradas) {
      const k = v.cliente_nome || 'SEM NOME';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    const colunas = [{ h: 'Cliente / compra' }, { h: 'Data' }, { h: 'Total', num: true }, { h: '' }];
    const linhas = [];
    let geral = 0;
    for (const [cliente, vendas] of grupos) {
      const soma = vendas.reduce((s, v) => s + Number(v.total), 0);
      geral += soma;
      linhas.push({ classe: 'grupo', cells: [el('b', {}, cliente), '', el('b', {}, brl(soma)),
        botao('Receber tudo', acao(() => receberVarias(cliente, vendas)), 'btn pequeno primario')] });
      for (const v of vendas) {
        linhas.push({ cells: [`   Venda #${v.id}`, dataHoraBR(v.data), brl(v.total),
          botao('Receber', acao(() => receber([v])), 'btn pequeno')] });
      }
    }
    $saida.replaceChildren(
      el('p', { class: 'muted' }, `${grupos.size} cliente(s) · total em aberto ${brl(geral)}`),
      tabela(colunas, linhas, { vazio: 'Nenhuma venda fiada em aberto.' }),
    );
  }

  function receber(vendas) {
    const $forma = select(['DINHEIRO', 'PIX']);
    const total = vendas.reduce((s, v) => s + Number(v.total), 0);
    modal(`Receber ${vendas.length > 1 ? `${vendas.length} vendas` : `venda #${vendas[0].id}`}`,
      el('div', { class: 'form-col' }, el('p', {}, `Valor: ${brl(total)}`), campo('Forma de recebimento', $forma),
        el('small', { class: 'muted' }, 'O recebimento entra no caixa aberto.')),
      [{ label: 'Confirmar recebimento', classe: 'btn primario', acao: acao(async () => {
        for (const v of vendas) {
          await q(sb.rpc('baixar_carteira', { p_venda: v.id, p_forma: $forma.value }));
        }
        toast('Recebimento registrado.');
        await carregar();
      }) }]);
  }

  async function receberVarias(cliente, vendas) { receber(vendas); }

  $filtro.addEventListener('input', acao(carregar));
  root.append(el('h2', {}, 'Carteira (fiado)'), el('div', { class: 'filtros' }, campo('Cliente', $filtro)), $saida);
  await carregar();
}
