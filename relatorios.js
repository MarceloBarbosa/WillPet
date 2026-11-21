import {
  sb, el, hasPerm, q, todas, acao, tabela, campo, input, select, botao, brl, num, dataBR, dataHoraBR,
  hojeISO, mesInicioISO, inicioDiaISO, fimDiaISO, exportarCSV, exportarPDF,
} from '../core.js';

export const paginas = [
  { id: 'relatorios', titulo: 'Relatórios', grupo: 'Relatórios', perm: 'relatorios', render: renderRelatorios },
];

const TIPOS = [
  { id: 'vendas', label: 'Vendas por período', periodo: true },
  { id: 'produtos', label: 'Produtos mais vendidos', periodo: true },
  { id: 'estoque', label: 'Estoque atual (valorizado)', periodo: false },
  { id: 'validade', label: 'Validade: vencidos e vencendo', periodo: false },
  { id: 'carteira', label: 'Carteira em aberto por cliente', periodo: false },
  { id: 'entradas', label: 'Entradas e ajustes de estoque', periodo: true },
  { id: 'despesas', label: 'Despesas por período', periodo: true },
  { id: 'contas', label: 'Contas a pagar por vencimento', periodo: true },
  { id: 'balanco', label: 'Balanço anual (mês a mês)', periodo: false },
];

// Cada relatório devolve { colunas, linhas, titulo, subtitulo?, rodape? } (e opcionalmente chart)
const RELATORIOS = {
  async vendas(ini, fim) {
    const v = await todas(() => sb.from('vendas').select('*')
      .gte('data', inicioDiaISO(ini)).lte('data', fimDiaISO(fim)).order('data'));
    const validas = v.filter(x => !x.cancelada);
    return {
      colunas: [{ h: 'Nº', num: true }, { h: 'Data' }, { h: 'Cliente' }, { h: 'Pagamento' }, { h: 'Subtotal', num: true },
        { h: 'Desconto', num: true }, { h: 'Total', num: true }, { h: 'Taxa', num: true }, { h: 'Custo', num: true }, { h: 'Lucro', num: true }, { h: 'Situação' }],
      linhas: v.map(x => ({ classe: x.cancelada ? 'cancelada' : '', cells: [`#${x.id}`, dataHoraBR(x.data), x.cliente_nome || '', x.forma_pagamento,
        brl(x.subtotal), brl(x.desconto), brl(x.total), brl(x.taxa_valor), brl(x.custo_total), brl(x.lucro),
        x.cancelada ? 'CANCELADA' : x.status_pagamento === 'ABERTO' ? 'FIADO EM ABERTO' : 'OK'] })),
      rodape: ['Totais (sem cancelados)', '', '', '', '', brl(validas.reduce((s, x) => s + Number(x.desconto), 0)),
        brl(validas.reduce((s, x) => s + Number(x.total), 0)), brl(validas.reduce((s, x) => s + Number(x.taxa_valor), 0)),
        brl(validas.reduce((s, x) => s + Number(x.custo_total), 0)), brl(validas.reduce((s, x) => s + Number(x.lucro), 0)), ''],
    };
  },

  async produtos(ini, fim) {
    const itens = await todas(() => sb.from('venda_itens')
      .select('codigo,produto_nome,quantidade,total,custo_unit, vendas!inner(data,cancelada)')
      .gte('vendas.data', inicioDiaISO(ini)).lte('vendas.data', fimDiaISO(fim)).eq('vendas.cancelada', false));
    const mapa = new Map();
    for (const i of itens) {
      const k = i.codigo;
      const m = mapa.get(k) || { codigo: i.codigo, nome: i.produto_nome, qtd: 0, fat: 0, custo: 0 };
      m.qtd += i.quantidade; m.fat += Number(i.total); m.custo += Number(i.custo_unit) * i.quantidade;
      mapa.set(k, m);
    }
    const ordenado = [...mapa.values()].sort((a, b) => b.qtd - a.qtd);
    return {
      colunas: [{ h: 'Código' }, { h: 'Produto' }, { h: 'Qtd vendida', num: true }, { h: 'Faturamento', num: true }, { h: 'Lucro bruto', num: true }],
      linhas: ordenado.map(m => ({ cells: [m.codigo, m.nome, num(m.qtd), brl(m.fat), brl(m.fat - m.custo)] })),
    };
  },

  async estoque() {
    const p = await todas(() => sb.from('produtos_estoque').select('*').eq('ativo', true).order('nome'));
    return {
      colunas: [{ h: 'Código' }, { h: 'Produto' }, { h: 'Categoria' }, { h: 'Estoque', num: true }, { h: 'Custo', num: true }, { h: 'Venda', num: true },
        { h: 'Valor custo', num: true }, { h: 'Valor venda', num: true }],
      linhas: p.map(x => ({ cells: [x.codigo, x.nome, x.categoria || '', num(x.estoque), brl(x.custo), brl(x.preco), brl(x.valor_custo), brl(x.valor_venda)] })),
      rodape: ['Total', '', '', num(p.reduce((s, x) => s + x.estoque, 0)), '', '', brl(p.reduce((s, x) => s + Number(x.valor_custo), 0)), brl(p.reduce((s, x) => s + Number(x.valor_venda), 0))],
    };
  },

  async validade() {
    const p = await todas(() => sb.from('produtos_estoque').select('*').eq('ativo', true).order('validade'));
    const lista = p.filter(x => ['VENCIDO', 'VENCE HOJE', 'VENCENDO'].includes(x.situacao_validade));
    return {
      colunas: [{ h: 'Código' }, { h: 'Produto' }, { h: 'Validade' }, { h: 'Situação' }, { h: 'Estoque', num: true }, { h: 'Valor custo', num: true }],
      linhas: lista.map(x => ({ cells: [x.codigo, x.nome, dataBR(x.validade), x.situacao_validade, num(x.estoque), brl(x.valor_custo)] })),
    };
  },

  async carteira() {
    const v = await todas(() => sb.from('vendas').select('*').eq('forma_pagamento', 'CARTEIRA').eq('status_pagamento', 'ABERTO').eq('cancelada', false).order('data'));
    const mapa = new Map();
    for (const x of v) {
      const k = x.cliente_nome || 'SEM NOME';
      const m = mapa.get(k) || { n: 0, total: 0, ultima: x.data };
      m.n += 1; m.total += Number(x.total); m.ultima = x.data > m.ultima ? x.data : m.ultima;
      mapa.set(k, m);
    }
    const lista = [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
    return {
      colunas: [{ h: 'Cliente' }, { h: 'Compras em aberto', num: true }, { h: 'Saldo devedor', num: true }, { h: 'Última compra' }],
      linhas: lista.map(([c, m]) => ({ cells: [c, num(m.n), brl(m.total), dataBR(m.ultima)] })),
      rodape: ['Total', '', brl(lista.reduce((s, [, m]) => s + m.total, 0)), ''],
    };
  },

  async entradas(ini, fim) {
    const e = await todas(() => sb.from('entradas').select('*, produtos(codigo,nome), fornecedores(empresa)')
      .gte('data', inicioDiaISO(ini)).lte('data', fimDiaISO(fim)).order('data'));
    return {
      colunas: [{ h: 'Data' }, { h: 'Tipo' }, { h: 'Código' }, { h: 'Produto' }, { h: 'Qtd', num: true }, { h: 'Custo', num: true }, { h: 'Fornecedor' }, { h: 'Nota / motivo' }],
      linhas: e.map(x => ({ cells: [dataHoraBR(x.data), x.tipo, x.produtos?.codigo || '', x.produtos?.nome || '', num(x.quantidade),
        x.custo_unit != null ? brl(x.custo_unit) : '', x.fornecedores?.empresa || '', x.nota || x.motivo || ''] })),
    };
  },

  async despesas(ini, fim) {
    const d = await todas(() => sb.from('despesas').select('*').gte('data', ini).lte('data', fim).order('data'));
    const porCat = new Map();
    d.forEach(x => porCat.set(x.categoria, (porCat.get(x.categoria) || 0) + Number(x.valor)));
    return {
      colunas: [{ h: 'Data' }, { h: 'Categoria' }, { h: 'Descrição' }, { h: 'Forma' }, { h: 'Valor', num: true }],
      linhas: d.map(x => ({ cells: [dataBR(x.data), x.categoria, x.descricao, x.forma_pagto, brl(x.valor)] })),
      rodape: ['Total', '', [...porCat].map(([c, v]) => `${c}: ${brl(v)}`).join(' · '), '', brl(d.reduce((s, x) => s + Number(x.valor), 0))],
    };
  },

  async contas(ini, fim) {
    const c = await todas(() => sb.from('contas_pagar').select('*').gte('vencimento', ini).lte('vencimento', fim).order('vencimento'));
    return {
      colunas: [{ h: 'Vencimento' }, { h: 'Empresa' }, { h: 'Nota' }, { h: 'Parcela' }, { h: 'Total', num: true }, { h: 'Situação' }, { h: 'Pago em' }],
      linhas: c.map(x => ({ cells: [dataBR(x.vencimento), x.empresa, x.nota || '', `${x.parcela}/${x.total_parcelas}`, brl(x.valor_total), x.status, dataBR(x.data_pagamento)] })),
      rodape: ['Totais', '', '', '', brl(c.reduce((s, x) => s + Number(x.valor_total), 0)),
        `Em aberto: ${brl(c.filter(x => x.status === 'ABERTO').reduce((s, x) => s + Number(x.valor_total), 0))}`, ''],
    };
  },
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

async function renderRelatorios(root) {
  const $tipo = select(TIPOS.map(t => ({ value: t.id, label: t.label })));
  const $ini = input({ type: 'date', value: mesInicioISO() });
  const $fim = input({ type: 'date', value: hojeISO() });
  const $ano = input({ type: 'number', min: '2000', max: '2100', value: String(new Date().getFullYear()) });
  const $periodo = el('div', { class: 'filtros' }, campo('De', $ini), campo('Até', $fim));
  const $anoBox = el('div', { class: 'filtros', hidden: true }, campo('Ano', $ano));
  const $saida = el('div');
  let ultimo = null;

  const atualizarFiltros = () => {
    const t = TIPOS.find(x => x.id === $tipo.value);
    $periodo.hidden = !t.periodo;
    $anoBox.hidden = $tipo.value !== 'balanco';
  };

  async function gerar() {
    const tipo = $tipo.value;
    ultimo = null;
    if (tipo === 'balanco') return balanco();
    const r = await RELATORIOS[tipo]($ini.value, $fim.value);
    ultimo = { ...r, nome: `${tipo}-${$ini.value}-a-${$fim.value}`, titulo: TIPOS.find(t => t.id === tipo).label };
    const linhas = [...r.linhas];
    if (r.rodape) linhas.push({ classe: 'totalizador', cells: r.rodape });
    $saida.replaceChildren(el('p', { class: 'muted' }, `${r.linhas.length} registro(s)`), tabela(r.colunas, linhas));
  }

  async function balanco() {
    const linhasRpc = await q(sb.rpc('balanco_mensal', { p_ano: Number($ano.value) }));
    const linhas = linhasRpc.map(m => ({ cells: [MESES[m.mes - 1], brl(m.vendas), brl(m.custo), brl(m.taxas), brl(m.lucro), brl(m.despesas), brl(m.contas_pagas), brl(Number(m.lucro) - Number(m.despesas))] }));
    const soma = k => linhasRpc.reduce((s, m) => s + Number(m[k]), 0);
    linhas.push({ classe: 'totalizador', cells: ['Ano', brl(soma('vendas')), brl(soma('custo')), brl(soma('taxas')), brl(soma('lucro')), brl(soma('despesas')), brl(soma('contas_pagas')), brl(soma('lucro') - soma('despesas'))] });
    const colunas = [{ h: 'Mês' }, { h: 'Vendas', num: true }, { h: 'Custo', num: true }, { h: 'Taxas cartão', num: true }, { h: 'Lucro bruto', num: true },
      { h: 'Despesas', num: true }, { h: 'Contas pagas', num: true }, { h: 'Resultado (lucro − despesas)', num: true }];
    const canvas = el('canvas', { height: '110' });
    $saida.replaceChildren(
      el('div', { class: 'painel' }, el('h3', {}, `Balanço ${$ano.value}`), canvas),
      tabela(colunas, linhas));
    if (window.Chart) {
      new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: MESES,
          datasets: [
            { label: 'Vendas', data: linhasRpc.map(m => Number(m.vendas)), backgroundColor: '#2f6fb3' },
            { label: 'Lucro bruto', data: linhasRpc.map(m => Number(m.lucro)), backgroundColor: '#3aa76d' },
            { label: 'Despesas', data: linhasRpc.map(m => Number(m.despesas)), backgroundColor: '#d9534f' },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }
  }

  const exportar = tipo => () => {
    if (!ultimo) throw new Error('Gere um relatório antes de exportar.');
    if (tipo === 'csv') exportarCSV(ultimo.nome, ultimo.colunas, [...ultimo.linhas, ...(ultimo.rodape ? [{ cells: ultimo.rodape }] : [])]);
    else exportarPDF(ultimo.nome, ultimo.titulo, `Período: ${$ini.value} a ${$fim.value}`, ultimo.colunas, [...ultimo.linhas, ...(ultimo.rodape ? [{ cells: ultimo.rodape }] : [])]);
  };

  $tipo.addEventListener('change', () => { atualizarFiltros(); $saida.replaceChildren(); });
  root.append(
    el('h2', {}, 'Relatórios'),
    el('div', { class: 'filtros' }, campo('Relatório', $tipo), botao('Gerar', acao(gerar), 'btn primario'),
      botao('CSV', acao(exportar('csv')), 'btn'), botao('PDF', acao(exportar('pdf')), 'btn')),
    $periodo, $anoBox, $saida);
  atualizarFiltros();
  await gerar();
}
