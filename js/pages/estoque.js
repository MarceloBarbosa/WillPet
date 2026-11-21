import {
  sb, el, hasPerm, q, todas, acao, modal, tabela, campo, input, select, botao, toast, brl, num, dataBR,
  recarregar, buscarProdutos, exportarCSV, exportarPDF, dataHoraBR, hojeISO,
} from '../core.js';

export const paginas = [
  { id: 'estoque', titulo: 'Produtos e estoque', grupo: 'Estoque', perm: 'estoque', render: renderEstoque },
  { id: 'entrada', titulo: 'Entradas e ajustes', grupo: 'Estoque', perm: 'entrada', render: renderEntrada },
];

const CLASSE_SITUACAO = {
  VENCIDO: 'vencido', 'VENCE HOJE': 'vencido', VENCENDO: 'atencao', OK: 'ok', 'SEM VALIDADE': 'neutro',
};

// ============================================================
// PRODUTOS E ESTOQUE
// ============================================================
async function renderEstoque(root) {
  const [produtos, categorias] = await Promise.all([
    todas(() => sb.from('produtos_estoque').select('*').order('nome')),
    q(sb.from('categorias').select('id,nome').order('nome')),
  ]);
  const $busca = input({ placeholder: 'Buscar por código, código de barras ou nome' });
  const $cat = select([{ value: '', label: 'Todas as categorias' }, ...categorias.map(c => ({ value: c.id, label: c.nome }))]);
  const $sit = select([
    { value: '', label: 'Todas as situações' },
    { value: 'VENCIDO', label: 'Vencidos / vencem hoje' },
    { value: 'VENCENDO', label: 'Vencendo em 30 dias' },
    { value: 'BAIXO', label: 'Estoque baixo' },
    { value: 'ZERADO', label: 'Sem estoque' },
    { value: 'INATIVO', label: 'Inativos' },
  ]);
  const $saida = el('div');

  function filtrar() {
    const t = $busca.value.trim().toLowerCase();
    return produtos.filter(p => {
      if (t && !(`${p.codigo} ${p.codigo_barras || ''} ${p.nome}`.toLowerCase().includes(t))) return false;
      if ($cat.value && String(p.categoria_id) !== $cat.value) return false;
      switch ($sit.value) {
        case 'VENCIDO': return p.situacao_validade === 'VENCIDO' || p.situacao_validade === 'VENCE HOJE';
        case 'VENCENDO': return p.situacao_validade === 'VENCENDO';
        case 'BAIXO': return p.estoque_minimo > 0 && p.estoque <= p.estoque_minimo;
        case 'ZERADO': return p.estoque <= 0;
        case 'INATIVO': return !p.ativo;
        default: return p.ativo || $sit.value === '';
      }
    });
  }

  function desenhar() {
    const lista = filtrar();
    const colunas = [{ h: 'Código' }, { h: 'Cód. barras' }, { h: 'Produto' }, { h: 'Categoria' }, { h: 'Validade' },
      { h: 'Situação' }, { h: 'Custo', num: true }, { h: 'Venda', num: true }, { h: 'Estoque', num: true },
      { h: 'Valor custo', num: true }, { h: 'Valor venda', num: true }, { h: '' }];
    const linhas = lista.map(p => {
      const baixo = p.estoque_minimo > 0 && p.estoque <= p.estoque_minimo;
      return {
        classe: !p.ativo ? 'inativo' : '',
        cells: [
          p.codigo, p.codigo_barras || '', p.nome, p.categoria || '—', p.validade ? dataBR(p.validade) : '',
          el('span', { class: `badge ${CLASSE_SITUACAO[p.situacao_validade] || 'neutro'}` }, p.situacao_validade),
          brl(p.custo), brl(p.preco),
          el('span', { class: baixo || p.estoque <= 0 ? 'texto-alerta' : '' }, num(p.estoque)),
          brl(p.valor_custo), brl(p.valor_venda),
          el('div', { class: 'acoes-linha' },
            hasPerm('estoque') ? botao('Editar', () => formProduto(p), 'btn pequeno') : null,
            hasPerm('estoque') ? botao(p.ativo ? 'Desativar' : 'Ativar', acao(() => alternarAtivo(p)), 'btn pequeno') : null),
        ],
      };
    });
    const ativos = lista.filter(p => p.ativo);
    const somaCusto = ativos.reduce((s, p) => s + Number(p.valor_custo), 0);
    const somaVenda = ativos.reduce((s, p) => s + Number(p.valor_venda), 0);
    const rodape = { classe: 'totalizador', cells: ['', '', el('b', {}, `${ativos.length} produto(s) ativo(s)`), '', '', '', '', '', '', el('b', {}, brl(somaCusto)), el('b', {}, brl(somaVenda)), ''] };
    $saida.replaceChildren(tabela(colunas, [...linhas, rodape], { vazio: 'Nenhum produto encontrado.' }));
  }

  async function alternarAtivo(p) {
    await q(sb.from('produtos').update({ ativo: !p.ativo }).eq('id', p.id));
    toast(p.ativo ? 'Produto desativado.' : 'Produto reativado.');
    recarregar();
  }

  function formProduto(p = null) {
    const novo = !p;
    const $codigo = input({ value: p?.codigo || '', required: true, disabled: !novo });
    const $eanBarras = input({ value: p?.codigo_barras || '' });
    const $nome = input({ value: p?.nome || '', required: true });
    const $cat = select([{ value: '', label: '— sem categoria —' }, ...categorias.map(c => ({ value: c.id, label: c.nome }))]);
    $cat.value = p?.categoria_id ? String(p.categoria_id) : '';
    const $validade = input({ type: 'date', value: p?.validade || '' });
    const $custo = input({ type: 'number', step: '0.01', min: '0', value: p?.custo ?? '' });
    const $preco = input({ type: 'number', step: '0.01', min: '0', value: p?.preco ?? '' });
    const $min = input({ type: 'number', step: '1', min: '0', value: p?.estoque_minimo ?? 0 });
    const $qtd = input({ type: 'number', step: '1', min: '0', value: '0', placeholder: 'opcional' });
    const $ativo = input({ type: 'checkbox', checked: p ? p.ativo : true });

    modal(novo ? 'Novo produto' : `Editar ${p.nome}`, el('div', { class: 'grid-form' },
      campo('Código (usado no caixa)', $codigo, novo ? 'Não pode repetir.' : 'O código não é alterado.'),
      campo('Código de barras', $eanBarras),
      campo('Produto', $nome),
      campo('Categoria', $cat),
      campo('Validade', $validade),
      campo('Custo (R$)', $custo),
      campo('Venda (R$)', $preco),
      campo('Estoque mínimo', $min, 'Gera alerta quando o estoque chegar a este valor.'),
      novo ? campo('Quantidade inicial', $qtd, 'Cria uma entrada de estoque.') : null,
      el('label', { class: 'campo check' }, $ativo, el('span', {}, 'Produto ativo'))),
      [{ label: 'Salvar', classe: 'btn primario', acao: acao(async () => {
        const dados = {
          nome: $nome.value.trim(),
          codigo_barras: $eanBarras.value.trim() || null,
          categoria_id: $cat.value ? Number($cat.value) : null,
          validade: $validade.value || null,
          custo: Number($custo.value) || 0,
          preco: Number($preco.value) || 0,
          estoque_minimo: parseInt($min.value, 10) || 0,
          ativo: $ativo.checked,
        };
        if (!dados.nome) throw new Error('Informe o nome do produto.');
        if (novo) {
          if (!$codigo.value.trim()) throw new Error('Informe o código.');
          const criado = await q(sb.from('produtos').insert({ ...dados, codigo: $codigo.value.trim() }).select('id').single());
          const qtd = parseInt($qtd.value, 10) || 0;
          if (qtd > 0) await q(sb.from('entradas').insert({ produto_id: criado.id, quantidade: qtd, custo_unit: dados.custo, motivo: 'Estoque inicial' }));
          toast('Produto cadastrado.');
        } else {
          await q(sb.from('produtos').update(dados).eq('id', p.id));
          toast('Produto atualizado.');
        }
        recarregar();
      }) }]);
  }

  const exportar = tipo => () => {
    const lista = filtrar();
    const colunas = [{ h: 'Código' }, { h: 'Produto' }, { h: 'Categoria' }, { h: 'Validade' }, { h: 'Situação' }, { h: 'Estoque' }, { h: 'Custo' }, { h: 'Venda' }, { h: 'Valor custo' }, { h: 'Valor venda' }];
    const linhas = lista.map(p => ({ cells: [p.codigo, p.nome, p.categoria || '', p.validade ? dataBR(p.validade) : '', p.situacao_validade, num(p.estoque), brl(p.custo), brl(p.preco), brl(p.valor_custo), brl(p.valor_venda)] }));
    if (tipo === 'csv') exportarCSV('estoque', colunas, linhas);
    else exportarPDF('estoque', 'Estoque atual', `Gerado em ${dataHoraBR(new Date())}`, colunas, linhas);
  };

  root.append(
    el('div', { class: 'cabecalho-tela' }, el('h2', {}, 'Produtos e estoque'),
      el('div', {}, hasPerm('estoque') ? botao('+ Novo produto', () => formProduto(), 'btn primario') : null)),
    el('div', { class: 'filtros' }, campo('Busca', $busca), campo('Categoria', $cat), campo('Situação', $sit),
      botao('CSV', acao(exportar('csv')), 'btn'), botao('PDF', acao(exportar('pdf')), 'btn')),
    $saida,
  );
  [$busca, $cat, $sit].forEach(c => c.addEventListener('input', desenhar));
  desenhar();
}

// ============================================================
// ENTRADAS E AJUSTES
// ============================================================
async function renderEntrada(root) {
  const [fornecedores, historico] = await Promise.all([
    q(sb.from('fornecedores').select('id,empresa').order('empresa')),
    q(sb.from('entradas').select('*, produtos(codigo,nome), fornecedores(empresa)').order('data', { ascending: false }).limit(200)),
  ]);
  let produtoEscolhido = null;

  const $prodBusca = input({ placeholder: 'Código, código de barras ou nome — Enter busca', autocomplete: 'off', autofocus: true });
  const $prodInfo = el('p', { class: 'muted' }, 'Nenhum produto selecionado.');
  const $res = el('div', { class: 'resultados' });
  const $tipo = select(['ENTRADA', 'AJUSTE']);
  const $qtd = input({ type: 'number', step: '1', min: '1', placeholder: 'Ex.: 10 (ajuste aceita negativo)' });
  const $custo = input({ type: 'number', step: '0.01', min: '0', placeholder: 'Custo unitário' });
  const $forn = select([{ value: '', label: '— opcional —' }, ...fornecedores.map(f => ({ value: f.id, label: f.empresa }))]);
  const $nota = input({ placeholder: 'Número da nota' });
  const $validade = input({ type: 'date' });
  const $motivo = input({ placeholder: 'Motivo do ajuste (obrigatório em AJUSTE)' });
  const $saida = el('div');

  async function escolher(p) {
    produtoEscolhido = p;
    $prodInfo.replaceChildren(el('b', {}, p.nome), ` · código ${p.codigo} · estoque atual ${num(p.estoque)} · custo ${brl(p.custo)}`);
    $res.replaceChildren();
    $prodBusca.value = '';
    $custo.value = p.custo || '';
    $qtd.focus();
  }

  async function pesquisar(termo, direto) {
    const lista = await buscarProdutos(termo);
    const exato = lista.find(p => p.codigo === termo.trim() || p.codigo_barras === termo.trim());
    if (direto && (exato || lista.length === 1)) return escolher(exato || lista[0]);
    $res.replaceChildren(...lista.map(p => el('button', { class: 'resultado', type: 'button', onclick: () => escolher(p) },
      el('b', {}, p.nome), el('span', {}, ` · ${p.codigo} · estoque ${num(p.estoque)}`))));
    if (!lista.length) toast('Produto não encontrado.', 'erro');
  }
  $prodBusca.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); acao(() => pesquisar($prodBusca.value, true))(); } });

  async function salvar() {
    if (!produtoEscolhido) throw new Error('Escolha um produto.');
    const qtd = parseInt($qtd.value, 10);
    if (!qtd) throw new Error('Informe a quantidade.');
    if ($tipo.value === 'ENTRADA' && qtd < 0) throw new Error('Entrada precisa ser positiva. Use AJUSTE para baixar estoque.');
    if ($tipo.value === 'AJUSTE' && !$motivo.value.trim()) throw new Error('Informe o motivo do ajuste.');
    await q(sb.from('entradas').insert({
      produto_id: produtoEscolhido.id,
      tipo: $tipo.value,
      quantidade: qtd,
      custo_unit: $custo.value === '' ? null : Number($custo.value),
      fornecedor_id: $forn.value ? Number($forn.value) : null,
      nota: $nota.value.trim() || null,
      validade: $validade.value || null,
      motivo: $motivo.value.trim() || null,
    }));
    const atualiza = {};
    if ($validade.value) atualiza.validade = $validade.value;
    if ($tipo.value === 'ENTRADA' && $custo.value !== '') atualiza.custo = Number($custo.value);
    if (Object.keys(atualiza).length) await q(sb.from('produtos').update(atualiza).eq('id', produtoEscolhido.id));
    toast('Movimentação registrada.');
    recarregar();
  }

  const colunas = [{ h: 'Data' }, { h: 'Tipo' }, { h: 'Código' }, { h: 'Produto' }, { h: 'Quantidade', num: true }, { h: 'Custo', num: true }, { h: 'Fornecedor' }, { h: 'Nota / motivo' }];
  const linhas = historico.map(h => ({ cells: [dataHoraBR(h.data), h.tipo, h.produtos?.codigo || '', h.produtos?.nome || '',
    num(h.quantidade), h.custo_unit != null ? brl(h.custo_unit) : '', h.fornecedores?.empresa || '', h.nota || h.motivo || ''] }));

  root.append(
    el('h2', {}, 'Entradas e ajustes de estoque'),
    el('div', { class: 'grid-duas' },
      el('div', { class: 'painel' },
        el('h3', {}, 'Registrar'),
        el('div', { class: 'busca-linha' }, $prodBusca, botao('Buscar', acao(() => pesquisar($prodBusca.value, true)), 'btn')),
        $res, $prodInfo,
        el('div', { class: 'grid-form' },
          campo('Tipo', $tipo, 'ENTRADA soma ao estoque. AJUSTE corrige contagem (aceita negativo).'),
          campo('Quantidade', $qtd),
          campo('Custo unitário (R$)', $custo, 'Atualiza o custo do produto.'),
          campo('Fornecedor', $forn),
          campo('Nota fiscal', $nota),
          campo('Nova validade', $validade, 'Opcional: atualiza a validade do produto.'),
          campo('Motivo', $motivo)),
        el('div', { class: 'acoes' }, botao('Registrar', acao(salvar), 'btn primario grande'))),
      el('div', { class: 'painel' }, el('h3', {}, 'Últimas movimentações'), tabela(colunas, linhas, { vazio: 'Sem movimentações.' }))),
  );
  $saida.remove();
}
