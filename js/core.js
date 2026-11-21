// Núcleo compartilhado: cliente Supabase, permissões, formatação, tabelas, modais e exportação.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMPRESA, EMPRESA_DETALHES } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const state = { user: null, perfil: null };
export const TZ = 'America/Sao_Paulo';

export const PERMISSOES = [
  ['vendas', 'Vendas (PDV e histórico)'],
  ['desconto', 'Dar desconto nos itens'],
  ['cancelar', 'Cancelar vendas'],
  ['carteira', 'Carteira (fiado) e recebimentos'],
  ['estoque', 'Produtos e estoque'],
  ['entrada', 'Entradas e ajustes de estoque'],
  ['fornecedor', 'Fornecedores'],
  ['categoria', 'Categorias'],
  ['cartao', 'Máquinas de cartão e taxas'],
  ['caixa', 'Caixa (abrir, sangria, fechar)'],
  ['despesa', 'Despesas'],
  ['contas', 'Contas a pagar'],
  ['relatorios', 'Relatórios e balanço anual'],
  ['privilegio', 'Acessos (administrar usuários)'],
];

export const CREDITOS = Array.from({ length: 10 }, (_, i) => `CREDITO ${i + 1}X`);
export const FORMAS = ['DINHEIRO', 'PIX', 'DEBITO', ...CREDITOS, 'CARTEIRA'];

export function hasPerm(p) {
  const f = state.perfil;
  if (!f || !f.ativo) return false;
  return !!f.is_admin || f.permissoes?.[p] === true;
}

// ---------- DOM ----------
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'readOnly', 'hidden', 'multiple', 'autofocus']);
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (PROPS.has(k)) node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const input = (attrs = {}) => el('input', { class: 'input', ...attrs });
export function select(opcoes, attrs = {}) {
  return el('select', { class: 'input', ...attrs },
    opcoes.map(o => typeof o === 'string' ? el('option', { value: o }, o) : el('option', { value: o.value }, o.label)));
}
export function campo(rotulo, control, ajuda) {
  return el('label', { class: 'campo' }, el('span', {}, rotulo), control, ajuda ? el('small', {}, ajuda) : null);
}
export const botao = (texto, onclick, classe = 'btn') => el('button', { class: classe, type: 'button', onclick }, texto);

// ---------- FORMATAÇÃO ----------
export const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = v => `${((Number(v) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
export const dataBR = d => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00-03:00' : d).toLocaleDateString('pt-BR', { timeZone: TZ }) : '';
export const dataHoraBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: TZ }) : '';
export const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const mesInicioISO = () => hojeISO().slice(0, 8) + '01';
export const inicioDiaISO = d => `${d}T00:00:00-03:00`;
export const fimDiaISO = d => `${d}T23:59:59.999-03:00`;
export function addDias(iso, n) {
  const d = new Date(iso + 'T12:00:00-03:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

// ---------- DADOS ----------
// Executa uma consulta/RPC do Supabase e lança erro legível se falhar.
export async function q(consulta) {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data;
}

// Busca todas as linhas (o Supabase devolve no máximo 1000 por requisição).
export async function todas(fabrica) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fabrica().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Envolve um handler para mostrar erros em vez de quebrar a tela.
export function acao(fn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (e) { toast(e.message, 'erro'); return false; }
  };
}

// Busca de produtos por código, código de barras ou nome.
export async function buscarProdutos(termo, limite = 15) {
  const t = String(termo || '').replace(/[%_,()*]/g, ' ').trim();
  if (!t) return [];
  return q(sb.from('produtos_estoque')
    .select('id,codigo,codigo_barras,nome,preco,custo,estoque,validade,situacao_validade,ativo,estoque_minimo')
    .eq('ativo', true)
    .or(`codigo.eq.${t},codigo_barras.eq.${t},nome.ilike.%${t}%`)
    .order('nome').limit(limite));
}

// Re-renderiza a tela atual (o roteador escuta o evento hashchange).
export const recarregar = () => window.dispatchEvent(new Event('hashchange'));

// ---------- FEEDBACK E JANELAS ----------
export function toast(msg, tipo = 'ok') {
  const t = el('div', { class: `toast ${tipo}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 4000);
}

export function modal(titulo, corpo, botoes = []) {
  let back;
  const fechar = () => back?.remove();
  const acoes = botoes.map(b => el('button', {
    class: b.classe || 'btn',
    type: 'button',
    onclick: async () => { const ok = await b.acao?.(); if (ok !== false) fechar(); },
  }, b.label));
  back = el('div', { class: 'modal-back', onclick: e => { if (e.target === back) fechar(); } },
    el('div', { class: 'modal' },
      el('h3', {}, titulo),
      corpo,
      el('div', { class: 'acoes' }, el('button', { class: 'btn ghost', type: 'button', onclick: fechar }, 'Fechar'), acoes)));
  document.body.append(back);
  return { fechar };
}

// ---------- TABELA ----------
// colunas: [{ h: 'Título', num: true|false }]
// linhas:  [{ cells: [conteúdo, ...], classe?: 'linha-classe' }]
export function tabela(colunas, linhas, opts = {}) {
  if (!linhas.length) return el('p', { class: 'vazio' }, opts.vazio || 'Nenhum registro encontrado.');
  return el('div', { class: 'tabela-wrap' },
    el('table', { class: 'tabela' },
      el('thead', {}, el('tr', {}, colunas.map(c => el('th', { class: c.num ? 'num' : '' }, c.h)))),
      el('tbody', {}, linhas.map(l => el('tr', { class: l.classe || '' },
        l.cells.map((cell, i) => el('td', { class: colunas[i]?.num ? 'num' : '' }, cell)))))));
}

// ---------- EXPORTAÇÃO ----------
const textoCelula = c => c instanceof Node ? c.textContent : String(c ?? '');
function baixar(blob, nomeArquivo) {
  const a = el('a', { href: URL.createObjectURL(blob), download: nomeArquivo });
  document.body.append(a); a.click(); a.remove();
}

export function exportarCSV(nome, colunas, linhas) {
  const esc = v => `"${textoCelula(v).replace(/"/g, '""')}"`;
  const corpo = [colunas.map(c => esc(c.h)).join(';'), ...linhas.map(l => l.cells.map(esc).join(';'))].join('\r\n');
  baixar(new Blob(['﻿' + corpo], { type: 'text/csv;charset=utf-8' }), `${nome}.csv`);
}

export function exportarPDF(nome, titulo, subtitulo, colunas, linhas) {
  const doc = new window.jspdf.jsPDF({ orientation: colunas.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(13);
  doc.text(`${EMPRESA} - ${titulo}`, 14, 14);
  doc.setFontSize(9);
  doc.text(subtitulo, 14, 20);
  doc.autoTable({
    startY: 25,
    head: [colunas.map(c => c.h)],
    body: linhas.map(l => l.cells.map(textoCelula)),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [33, 74, 120] },
    margin: { left: 12, right: 12 },
  });
  doc.save(`${nome}.pdf`);
}

// Cupom não fiscal (80 mm) ou orçamento com validade de 7 dias.
export function gerarCupom({ tipo = 'CUPOM', id, data, cliente, forma, itens, subtotal, desconto, total }) {
  const altura = 95 + itens.length * 10 + EMPRESA_DETALHES.length * 4;
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [80, altura] });
  let y = 7;
  const centro = (t, tam = 8, negrito = false) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.text(String(t), 40, y, { align: 'center' });
    y += tam * 0.5 + 1.5;
  };
  const linha = (esq, dir = '', negrito = false) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.text(String(esq), 4, y);
    if (dir !== '') doc.text(String(dir), 76, y, { align: 'right' });
    y += 4;
  };
  const sep = () => { doc.setFontSize(7); doc.text('-'.repeat(46), 4, y); y += 4; };

  centro(EMPRESA, 11, true);
  EMPRESA_DETALHES.forEach(l => centro(l, 7));
  y += 1;
  centro(tipo === 'ORCAMENTO' ? 'ORÇAMENTO' : 'CUPOM NÃO FISCAL', 9, true);
  centro(`Nº ${id ?? '-'}   ${dataHoraBR(data || new Date())}`, 7);
  sep();
  linha('Código  Descrição', '', true);
  itens.forEach(i => {
    linha(`${i.codigo}  ${i.nome}`.slice(0, 44));
    linha(`   ${i.qtd} x ${brl(i.preco)}${i.desc ? `  desc. -${brl(i.desc)}` : ''}`, brl(i.qtd * i.preco - (i.desc || 0)));
  });
  sep();
  linha('Subtotal', brl(subtotal));
  if (desconto) linha('Descontos', `-${brl(desconto)}`);
  linha('TOTAL', brl(total), true);
  if (forma) linha('Pagamento', forma);
  if (cliente) linha('Cliente', cliente);
  sep();
  centro(tipo === 'ORCAMENTO' ? 'VÁLIDO POR 7 DIAS' : 'Agradecemos a sua preferência!', 7, true);
  doc.save(`${tipo === 'ORCAMENTO' ? 'orcamento' : 'cupom'}-${id ?? 'novo'}.pdf`);
}
