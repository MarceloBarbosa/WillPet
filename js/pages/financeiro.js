import {
  sb, el, hasPerm, q, todas, acao, modal, tabela, campo, input, select, botao, toast, recarregar, brl, num,
  dataBR, dataHoraBR, hojeISO, mesInicioISO, addDias, exportarCSV, exportarPDF,
} from '../core.js';

export const paginas = [
  { id: 'caixa', titulo: 'Caixa', grupo: 'Financeiro', perm: 'caixa', render: renderCaixa },
  { id: 'despesas', titulo: 'Despesas', grupo: 'Financeiro', perm: 'despesa', render: renderDespesas },
  { id: 'contas', titulo: 'Contas a pagar', grupo: 'Financeiro', perm: 'contas', render: renderContas },
];

const linhaResumo = (rot, valor, destaque = false) => el('div', { class: `linha-total ${destaque ? 'grande' : ''}` }, el('span', {}, rot), brl(valor));

// ============================================================
// CAIXA
// ============================================================
async function renderCaixa(root) {
  const aberto = await q(sb.from('caixa_sessoes').select('*').eq('status', 'ABERTO').maybeSingle());
  const historico = await q(sb.from('caixa_sessoes').select('*').eq('status', 'FECHADO').order('fechada_em', { ascending: false }).limit(30));

  if (!aberto) {
    const $saldo = input({ type: 'number', step: '0.01', min: '0', value: '0' });
    root.append(el('h2', {}, 'Caixa'),
      el('div', { class: 'painel' }, el('p', {}, 'O caixa está fechado. Informe o dinheiro que está na gaveta para abrir.'),
        el('div', { class: 'filtros' }, campo('Saldo inicial em dinheiro (R$)', $saldo),
          botao('Abrir caixa', acao(async () => {
            await q(sb.rpc('abrir_caixa', { p_saldo: Number($saldo.value) || 0 }));
            toast('Caixa aberto.');
            recarregar();
          }), 'btn primario'))),
      el('h3', {}, 'Histórico de fechamentos'), historicoTabela(historico));
    return;
  }

  const r = await q(sb.rpc('resumo_caixa', { p_sessao: aberto.id }));
  const registrarSangria = () => {
    const $valor = input({ type: 'number', step: '0.01', min: '0.01' });
    const $motivo = input({ placeholder: 'Ex.: troco / pagamento de fornecedor' });
    modal('Sangria (retirada de dinheiro)', el('div', { class: 'form-col' },
      el('p', { class: 'muted' }, `Saldo em dinheiro disponível: ${brl(r.saldo_dinheiro)}`),
      campo('Valor (R$)', $valor), campo('Motivo', $motivo)),
      [{ label: 'Registrar sangria', classe: 'btn primario', acao: acao(async () => {
        await q(sb.rpc('registrar_sangria', { p_valor: Number($valor.value), p_motivo: $motivo.value.trim() || null }));
        toast('Sangria registrada.');
        recarregar();
      }) }]);
  };
  const fecharCaixa = () => {
    const $gaveta = input({ type: 'number', step: '0.01', min: '0', value: String(r.saldo_dinheiro) });
    const $obs = input({ placeholder: 'Observação (opcional)' });
    modal('Fechar caixa', el('div', { class: 'form-col' },
      el('p', {}, `Saldo em dinheiro pelo sistema: ${brl(r.saldo_dinheiro)}`),
      campo('Dinheiro contado na gaveta (R$)', $gaveta), campo('Observação', $obs)),
      [{ label: 'Confirmar fechamento', classe: 'btn primario', acao: acao(async () => {
        const res = await q(sb.rpc('fechar_caixa', { p_gaveta: Number($gaveta.value), p_obs: $obs.value.trim() || null }));
        modal('Caixa fechado', el('div', {},
          linhaResumo('Sistema (dinheiro)', res.saldo_dinheiro),
          linhaResumo('Gaveta contada', res.gaveta),
          linhaResumo('Diferença', res.diferenca, true),
          el('p', { class: 'muted' }, res.diferenca === 0 ? 'Caixa conferido.' : res.diferenca > 0 ? 'Sobra em relação ao sistema.' : 'Falta em relação ao sistema.')), []);
        recarregar();
      }) }]);
  };

  root.append(
    el('div', { class: 'cabecalho-tela' }, el('h2', {}, 'Caixa aberto'),
      el('div', { class: 'acoes-linha' },
        botao('Sangria', registrarSangria, 'btn'),
        botao('Fechar caixa', fecharCaixa, 'btn primario'))),
    el('p', { class: 'muted' }, `Aberto em ${dataHoraBR(aberto.aberta_em)}`),
    el('div', { class: 'cards' },
      el('div', { class: 'card destaque' }, el('small', {}, 'Saldo em dinheiro (gaveta)'), el('strong', {}, brl(r.saldo_dinheiro))),
      el('div', { class: 'card' }, el('small', {}, 'Saldo inicial'), el('strong', {}, brl(r.saldo_inicial))),
      el('div', { class: 'card' }, el('small', {}, 'Vendas em dinheiro'), el('strong', {}, brl(r.vendas_dinheiro))),
      el('div', { class: 'card' }, el('small', {}, 'Carteira recebida em dinheiro'), el('strong', {}, brl(r.carteira_recebida_dinheiro))),
      el('div', { class: 'card' }, el('small', {}, 'Sangrias'), el('strong', {}, brl(r.sangrias))),
      el('div', { class: 'card' }, el('small', {}, 'Despesas e contas em dinheiro'), el('strong', {}, brl(Number(r.despesas_dinheiro) + Number(r.contas_pagas_dinheiro)))),
    ),
    el('h3', {}, 'Outras formas de pagamento'),
    el('div', { class: 'grid-duas' },
      el('div', { class: 'painel' },
        linhaResumo('PIX', r.vendas_pix), linhaResumo('Débito', r.vendas_debito), linhaResumo('Crédito', r.vendas_credito),
        linhaResumo('Carteira recebida em PIX', r.carteira_recebida_pix)),
      el('div', { class: 'painel' },
        linhaResumo('Novas vendas na carteira (em aberto)', r.vendas_carteira), linhaResumo('Descontos concedidos', r.descontos),
        linhaResumo('Despesas do caixa (total)', r.despesas), linhaResumo('Contas pagas do caixa (total)', r.contas_pagas))),
    el('h3', {}, 'Histórico de fechamentos'), historicoTabela(historico));
}

function historicoTabela(lista) {
  const colunas = [{ h: 'Abertura' }, { h: 'Fechamento' }, { h: 'Saldo inicial', num: true }, { h: 'Vendas dinheiro', num: true },
    { h: 'PIX', num: true }, { h: 'Débito', num: true }, { h: 'Crédito', num: true }, { h: 'Gaveta', num: true }, { h: 'Diferença', num: true }];
  return tabela(colunas, lista.map(s => ({ classe: '', cells: [dataHoraBR(s.aberta_em), dataHoraBR(s.fechada_em),
    brl(s.saldo_inicial), brl(s.resumo?.vendas_dinheiro), brl(s.resumo?.vendas_pix), brl(s.resumo?.vendas_debito),
    brl(s.resumo?.vendas_credito), brl(s.gaveta_informada), brl(s.diferenca)] })), { vazio: 'Nenhum fechamento ainda.' });
}

// ============================================================
// DESPESAS
// ============================================================
async function renderDespesas(root) {
  const $ini = input({ type: 'date', value: mesInicioISO() });
  const $fim = input({ type: 'date', value: hojeISO() });
  const $cat = input({ list: 'cats-desp', placeholder: 'Ex.: FEIRA, PADARIA, UBER' });
  const $desc = input({ placeholder: 'Descrição' });
  const $valor = input({ type: 'number', step: '0.01', min: '0.01' });
  const $data = input({ type: 'date', value: hojeISO() });
  const $forma = select(['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'BOLETO']);
  const $saida = el('div');

  async function carregar() {
    const lista = await q(sb.from('despesas').select('*').gte('data', $ini.value).lte('data', $fim.value).order('data', { ascending: false }).limit(2000));
    const total = lista.reduce((s, d) => s + Number(d.valor), 0);
    const colunas = [{ h: 'Data' }, { h: 'Categoria' }, { h: 'Descrição' }, { h: 'Forma' }, { h: 'Valor', num: true }, { h: '' }];
    const linhas = lista.map(d => ({ cells: [dataBR(d.data), d.categoria, d.descricao, d.forma_pagto, brl(d.valor),
      hasPerm('despesa') ? botao('Excluir', () => modal('Excluir despesa?', el('p', {}, `${d.descricao} — ${brl(d.valor)}`),
        [{ label: 'Excluir', classe: 'btn perigo', acao: acao(async () => { await q(sb.from('despesas').delete().eq('id', d.id)); carregar(); }) }]), 'btn pequeno perigo') : ''] }));
    linhas.push({ classe: 'totalizador', cells: ['', '', '', el('b', {}, 'Total'), el('b', {}, brl(total)), ''] });
    $saida.replaceChildren(tabela(colunas, linhas, { vazio: 'Nenhuma despesa no período.' }));
    const cats = [...new Set(lista.map(d => d.categoria))];
    datalistCats.replaceChildren(...cats.map(c => el('option', { value: c })));
  }

  const datalistCats = el('datalist', { id: 'cats-desp' });
  const salvar = acao(async () => {
    if (!$cat.value.trim() || !$desc.value.trim() || !($valor.value > 0)) throw new Error('Preencha categoria, descrição e valor.');
    const aberto = await q(sb.from('caixa_sessoes').select('id').eq('status', 'ABERTO').maybeSingle());
    await q(sb.from('despesas').insert({
      categoria: $cat.value.trim().toUpperCase(), descricao: $desc.value.trim(), valor: Number($valor.value),
      data: $data.value, forma_pagto: $forma.value, sessao_id: aberto?.id ?? null,
    }));
    toast('Despesa registrada.');
    $desc.value = ''; $valor.value = '';
    carregar();
  });

  const exportar = tipo => () => {
    const colunas = [{ h: 'Data' }, { h: 'Categoria' }, { h: 'Descrição' }, { h: 'Forma' }, { h: 'Valor' }];
    q(sb.from('despesas').select('*').gte('data', $ini.value).lte('data', $fim.value).order('data')).then(lista => {
      const linhas = lista.map(d => ({ cells: [dataBR(d.data), d.categoria, d.descricao, d.forma_pagto, brl(d.valor)] }));
      const nome = `despesas-${$ini.value}-a-${$fim.value}`;
      if (tipo === 'csv') exportarCSV(nome, colunas, linhas);
      else exportarPDF(nome, 'Despesas', `${$ini.value} a ${$fim.value}`, colunas, linhas);
    });
  };

  root.append(el('h2', {}, 'Despesas'),
    hasPerm('despesa') ? el('div', { class: 'painel' }, el('h3', {}, 'Nova despesa'),
      el('div', { class: 'grid-form' }, campo('Categoria', $cat), campo('Descrição', $desc), campo('Valor (R$)', $valor),
        campo('Data', $data), campo('Forma de pagamento', $forma)),
      el('div', { class: 'acoes' }, botao('Registrar despesa', salvar, 'btn primario'))) : null,
    el('div', { class: 'filtros' }, campo('De', $ini), campo('Até', $fim),
      botao('Buscar', acao(carregar), 'btn primario'), botao('CSV', acao(exportar('csv')), 'btn'), botao('PDF', acao(exportar('pdf')), 'btn')),
    datalistCats, $saida);
  await carregar();
}

// ============================================================
// CONTAS A PAGAR
// ============================================================
async function renderContas(root) {
  const fornecedores = await q(sb.from('fornecedores').select('id,empresa').order('empresa'));
  const $filtro = select([
    { value: 'ABERTO', label: 'Em aberto' }, { value: 'VENCIDO', label: 'Vencidas' },
    { value: 'PAGO', label: 'Pagas' }, { value: 'TODAS', label: 'Todas' }]);
  const $ini = input({ type: 'date', value: addDias(hojeISO(), -60) });
  const $fim = input({ type: 'date', value: addDias(hojeISO(), 120) });
  const $saida = el('div');

  async function carregar() {
    let qy = sb.from('contas_pagar').select('*').gte('vencimento', $ini.value).lte('vencimento', $fim.value)
      .order('vencimento').limit(2000);
    if ($filtro.value === 'ABERTO') qy = qy.eq('status', 'ABERTO');
    if ($filtro.value === 'PAGO') qy = qy.eq('status', 'PAGO');
    if ($filtro.value === 'VENCIDO') qy = qy.eq('status', 'ABERTO').lt('vencimento', hojeISO());
    const lista = await q(qy);
    const aberto = lista.filter(c => c.status === 'ABERTO').reduce((s, c) => s + Number(c.valor_total), 0);
    const colunas = [{ h: 'Vencimento' }, { h: 'Empresa' }, { h: 'Nota' }, { h: 'Parcela' }, { h: 'Valor', num: true }, { h: 'Juros', num: true },
      { h: 'Total', num: true }, { h: 'Situação' }, { h: '' }];
    const hoje = hojeISO();
    const linhas = lista.map(c => {
      const vencida = c.status === 'ABERTO' && c.vencimento < hoje;
      return {
        classe: vencida ? 'vencida' : '',
        cells: [dataBR(c.vencimento), c.empresa, [c.nota, c.serie ? `/${c.serie}` : ''].join(''),
          `${c.parcela}/${c.total_parcelas}`, brl(c.valor), brl(c.juros), brl(c.valor_total),
          el('span', { class: `badge ${c.status === 'PAGO' ? 'ok' : vencida ? 'vencido' : 'atencao'}` },
            c.status === 'PAGO' ? `PAGO ${dataBR(c.data_pagamento)}` : vencida ? 'VENCIDA' : 'ABERTO'),
          c.status === 'ABERTO' && hasPerm('contas') ? botao('Pagar', () => pagar(c), 'btn pequeno primario') : ''],
      };
    });
    linhas.push({ classe: 'totalizador', cells: ['', '', '', el('b', {}, 'Em aberto'), '', '', el('b', {}, brl(aberto)), '', ''] });
    $saida.replaceChildren(tabela(colunas, linhas, { vazio: 'Nenhuma conta no filtro.' }));
  }

  function pagar(c) {
    const $forma = select(['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'BOLETO']);
    const $juros = input({ type: 'number', step: '0.01', min: '0', value: String(c.juros || 0) });
    modal(`Pagar ${c.empresa} · parcela ${c.parcela}/${c.total_parcelas}`, el('div', { class: 'form-col' },
      el('p', {}, `Valor ${brl(c.valor)} · vencimento ${dataBR(c.vencimento)}`),
      campo('Juros / multa (R$)', $juros), campo('Forma de pagamento', $forma),
      el('small', { class: 'muted' }, 'Pagamento em DINHEIRO sai do caixa aberto.')),
      [{ label: 'Confirmar pagamento', classe: 'btn primario', acao: acao(async () => {
        await q(sb.rpc('pagar_conta', { p_conta: c.id, p_forma: $forma.value, p_juros: Number($juros.value) || 0 }));
        toast('Conta paga.');
        carregar();
      }) }]);
  }

  function nova() {
    const $empresa = input({ list: 'lista-forn', placeholder: 'Fornecedor' });
    const $forn = select([{ value: '', label: '— selecione (ou digite acima) —' }, ...fornecedores.map(f => ({ value: f.id, label: f.empresa }))]);
    const $nota = input({ placeholder: 'Nº da nota' });
    const $serie = input({ placeholder: 'Série' });
    const $compra = input({ type: 'date', value: hojeISO() });
    const $total = input({ type: 'number', step: '0.01', min: '0.01' });
    const $parc = input({ type: 'number', step: '1', min: '1', max: '120', value: '1' });
    const $venc = input({ type: 'date', value: addDias(hojeISO(), 30) });
    modal('Nova compra a prazo', el('div', { class: 'grid-form' },
      campo('Fornecedor', $forn), campo('Empresa (texto livre)', $empresa, 'Usada se não escolher um fornecedor.'),
      campo('Nota', $nota), campo('Série', $serie), campo('Data da compra', $compra),
      campo('Valor total (R$)', $total), campo('Parcelas', $parc), campo('1º vencimento', $venc,
        'As demais parcelas vencem de mês em mês. Centavos vão para a última parcela.')),
      [{ label: 'Gerar parcelas', classe: 'btn primario', acao: acao(async () => {
        const forn = fornecedores.find(f => String(f.id) === $forn.value);
        const empresa = forn?.empresa || $empresa.value.trim();
        if (!empresa) throw new Error('Informe o fornecedor.');
        await q(sb.rpc('criar_contas_parceladas', {
          p_empresa: empresa, p_fornecedor: forn?.id ?? null, p_nota: $nota.value.trim() || null,
          p_serie: $serie.value.trim() || null, p_data_compra: $compra.value,
          p_valor_total: Number($total.value), p_parcelas: parseInt($parc.value, 10), p_primeiro_venc: $venc.value,
        }));
        toast('Parcelas geradas.');
        carregar();
      }) }]);
  }

  root.append(
    el('div', { class: 'cabecalho-tela' }, el('h2', {}, 'Contas a pagar'),
      hasPerm('contas') ? botao('+ Nova compra a prazo', nova, 'btn primario') : null),
    el('div', { class: 'filtros' }, campo('Mostrar', $filtro), campo('Vencimento de', $ini), campo('até', $fim),
      botao('Atualizar', acao(carregar), 'btn')),
    el('datalist', { id: 'lista-forn' }, fornecedores.map(f => el('option', { value: f.empresa }))),
    $saida);
  $filtro.addEventListener('change', acao(carregar));
  await carregar();
}
