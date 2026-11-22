import { sb, el, hasPerm, q, brl, num, dataBR, hojeISO, inicioDiaISO, fimDiaISO, addDias, todas } from '../core.js';

export const paginas = [
  { id: 'inicio', titulo: 'Início', grupo: 'Início', perm: null, render: renderInicio },
];

function card(titulo, valor, detalhe, alerta = false) {
  return el('div', { class: `card ${alerta ? 'alerta' : ''}` },
    el('small', {}, titulo),
    el('strong', {}, valor),
    detalhe ? el('span', {}, detalhe) : null);
}

async function renderInicio(root) {
  const hoje = hojeISO();
  const cards = [];
  root.append(el('img', { src: 'img/logo.png', alt: 'Will Pet', class: 'logo-inicio' }));
  root.append(el('h2', {}, 'Visão geral'), el('p', { class: 'muted' }, `Hoje: ${dataBR(hoje)}`));

  if (hasPerm('caixa') || hasPerm('relatorios')) {
    const caixa = await q(sb.from('caixa_sessoes').select('id,saldo_inicial,aberta_em').eq('status', 'ABERTO').maybeSingle());
    cards.push(card('Caixa', caixa ? 'ABERTO' : 'FECHADO',
      caixa ? `desde ${new Date(caixa.aberta_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}` : 'abra o caixa para vender', !caixa));
  }

  if (hasPerm('vendas') || hasPerm('relatorios')) {
    const vendas = await q(sb.from('vendas').select('total,forma_pagamento')
      .gte('data', inicioDiaISO(hoje)).lte('data', fimDiaISO(hoje)).eq('cancelada', false));
    const total = vendas.reduce((s, v) => s + Number(v.total), 0);
    cards.push(card('Vendas de hoje', brl(total), `${vendas.length} venda(s)`));
  }

  if (hasPerm('carteira') || hasPerm('relatorios')) {
    const fiado = await q(sb.from('vendas').select('total').eq('forma_pagamento', 'CARTEIRA')
      .eq('status_pagamento', 'ABERTO').eq('cancelada', false));
    cards.push(card('Carteira em aberto', brl(fiado.reduce((s, v) => s + Number(v.total), 0)), `${fiado.length} venda(s) fiadas`));
  }

  if (hasPerm('contas') || hasPerm('relatorios')) {
    const abertas = await q(sb.from('contas_pagar').select('valor,juros,vencimento,empresa')
      .eq('status', 'ABERTO').lte('vencimento', addDias(hoje, 7)).order('vencimento'));
    const total = abertas.reduce((s, c) => s + Number(c.valor) + Number(c.juros), 0);
    cards.push(card('Contas a pagar (7 dias)', brl(total), `${abertas.length} conta(s) vencendo ou vencidas`, abertas.length > 0));
  }

  if (hasPerm('estoque') || hasPerm('entrada') || hasPerm('relatorios')) {
    const produtos = await todas(() => sb.from('produtos_estoque')
      .select('codigo,nome,estoque,estoque_minimo,situacao_validade,validade').eq('ativo', true).order('nome'));
    const vencidos = produtos.filter(p => p.situacao_validade === 'VENCIDO' || p.situacao_validade === 'VENCE HOJE');
    const vencendo = produtos.filter(p => p.situacao_validade === 'VENCENDO');
    const baixo = produtos.filter(p => p.estoque_minimo > 0 && p.estoque <= p.estoque_minimo);
    cards.push(card('Vencidos / vencem hoje', num(vencidos.length), 'produtos com validade crítica', vencidos.length > 0));
    cards.push(card('Vencendo em 30 dias', num(vencendo.length), 'produtos próximos da validade', vencendo.length > 0));
    cards.push(card('Estoque baixo', num(baixo.length), 'abaixo do estoque mínimo', baixo.length > 0));
  }

  root.append(el('div', { class: 'cards' }, cards.length ? cards : el('p', { class: 'muted' }, 'Use o menu à esquerda para começar.')));
}
