import {
  sb, el, hasPerm, q, acao, modal, tabela, campo, input, select, botao, toast, recarregar, PERMISSOES, CREDITOS,
} from '../core.js';

export const paginas = [
  { id: 'categorias', titulo: 'Categorias', grupo: 'Cadastros', perm: 'categoria', render: renderCategorias },
  { id: 'fornecedores', titulo: 'Fornecedores', grupo: 'Cadastros', perm: 'fornecedor', render: renderFornecedores },
  { id: 'cartoes', titulo: 'Máquinas e taxas', grupo: 'Cadastros', perm: 'cartao', render: renderCartoes },
  { id: 'acessos', titulo: 'Acessos e permissões', grupo: 'Cadastros', perm: 'privilegio', render: renderAcessos },
];

// ---------- CATEGORIAS ----------
async function renderCategorias(root) {
  const cats = await q(sb.from('categorias').select('*').order('nome'));
  const $nome = input({ placeholder: 'Nova categoria' });
  const salvar = acao(async () => {
    const nome = $nome.value.trim().toUpperCase();
    if (!nome) throw new Error('Informe o nome.');
    await q(sb.from('categorias').insert({ nome }));
    toast('Categoria criada.');
    recarregar();
  });
  const editar = c => {
    const $e = input({ value: c.nome });
    modal('Renomear categoria', campo('Nome', $e), [{ label: 'Salvar', classe: 'btn primario', acao: acao(async () => {
      await q(sb.from('categorias').update({ nome: $e.value.trim().toUpperCase() }).eq('id', c.id));
      recarregar();
    }) }]);
  };
  const excluir = c => modal(`Excluir ${c.nome}?`, el('p', {}, 'Os produtos desta categoria ficarão sem categoria.'),
    [{ label: 'Excluir', classe: 'btn perigo', acao: acao(async () => { await q(sb.from('categorias').delete().eq('id', c.id)); recarregar(); }) }]);

  root.append(el('h2', {}, 'Categorias'),
    hasPerm('categoria') ? el('div', { class: 'filtros' }, campo('Nova', $nome), botao('Adicionar', salvar, 'btn primario')) : null,
    tabela([{ h: 'Nome' }, { h: '' }], cats.map(c => ({ cells: [c.nome, el('div', { class: 'acoes-linha' },
      botao('Renomear', () => editar(c), 'btn pequeno'), botao('Excluir', () => excluir(c), 'btn pequeno perigo'))] }))));
}

// ---------- FORNECEDORES ----------
async function renderFornecedores(root) {
  const lista = await q(sb.from('fornecedores').select('*').order('empresa'));
  const form = f => {
    const $emp = input({ value: f?.empresa || '' });
    const $cnpj = input({ value: f?.cnpj || '' });
    const $vend = input({ value: f?.vendedor || '' });
    const $cont = input({ value: f?.contato || '' });
    modal(f ? `Editar ${f.empresa}` : 'Novo fornecedor', el('div', { class: 'grid-form' },
      campo('Empresa', $emp), campo('CNPJ', $cnpj), campo('Vendedor', $vend), campo('Contato', $cont)),
      [{ label: 'Salvar', classe: 'btn primario', acao: acao(async () => {
        if (!$emp.value.trim()) throw new Error('Informe a empresa.');
        const dados = { empresa: $emp.value.trim(), cnpj: $cnpj.value.trim() || null, vendedor: $vend.value.trim() || null, contato: $cont.value.trim() || null };
        if (f) await q(sb.from('fornecedores').update(dados).eq('id', f.id));
        else await q(sb.from('fornecedores').insert(dados));
        recarregar();
      }) }]);
  };
  root.append(el('div', { class: 'cabecalho-tela' }, el('h2', {}, 'Fornecedores'), botao('+ Novo', () => form(), 'btn primario')),
    tabela([{ h: 'Empresa' }, { h: 'CNPJ' }, { h: 'Vendedor' }, { h: 'Contato' }, { h: '' }],
      lista.map(f => ({ cells: [f.empresa, f.cnpj || '', f.vendedor || '', f.contato || '',
        botao('Editar', () => form(f), 'btn pequeno')] }))));
}

// ---------- MÁQUINAS E TAXAS ----------
async function renderCartoes(root) {
  const lista = await q(sb.from('cartao_maquinas').select('*').order('maquina').order('bandeira'));
  const pctTxt = v => (Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

  const form = c => {
    const $maq = input({ value: c?.maquina || '' });
    const $band = input({ value: c?.bandeira || '' });
    const $deb = input({ type: 'number', step: '0.0001', min: '0', value: c ? pctTxt(c.debito) : '' });
    const creditos = CREDITOS.map((_, i) => input({ type: 'number', step: '0.0001', min: '0', value: c ? pctTxt(c.credito[i]) : '' }));
    const $ativo = input({ type: 'checkbox', checked: c ? c.ativo : true });
    modal(c ? `Editar ${c.maquina} · ${c.bandeira}` : 'Nova máquina / bandeira', el('div', { class: 'form-col' },
      el('div', { class: 'grid-form' }, campo('Máquina', $maq), campo('Bandeira', $band), campo('Débito (%)', $deb),
        el('label', { class: 'campo check' }, $ativo, el('span', {}, 'Ativa'))),
      el('h4', {}, 'Taxas de crédito (%)'),
      el('div', { class: 'grid-form grid-4' }, CREDITOS.map((rot, i) => campo(rot.replace('CREDITO ', ''), creditos[i])))),
      [{ label: 'Salvar', classe: 'btn primario', acao: acao(async () => {
        if (!$maq.value.trim() || !$band.value.trim()) throw new Error('Informe máquina e bandeira.');
        const dados = {
          maquina: $maq.value.trim(), bandeira: $band.value.trim(),
          debito: (Number($deb.value) || 0) / 100,
          credito: creditos.map(i => (Number(i.value) || 0) / 100),
          ativo: $ativo.checked,
        };
        if (c) await q(sb.from('cartao_maquinas').update(dados).eq('id', c.id));
        else await q(sb.from('cartao_maquinas').insert(dados));
        recarregar();
      }) }]);
  };

  const colunas = [{ h: 'Máquina' }, { h: 'Bandeira' }, { h: 'Débito', num: true }, ...CREDITOS.map(c => ({ h: c.replace('CREDITO ', ''), num: true })), { h: 'Ativa' }, { h: '' }];
  root.append(el('div', { class: 'cabecalho-tela' }, el('h2', {}, 'Máquinas e taxas'), botao('+ Nova', () => form(), 'btn primario')),
    el('p', { class: 'muted' }, 'Taxas em percentual. O sistema usa a taxa da máquina e bandeira escolhidas na venda.'),
    tabela(colunas, lista.map(c => ({ cells: [c.maquina, c.bandeira, `${pctTxt(c.debito)}%`,
      ...c.credito.map(v => `${pctTxt(v)}%`), c.ativo ? 'Sim' : 'Não', botao('Editar', () => form(c), 'btn pequeno')] }))));
}

// ---------- ACESSOS ----------
async function renderAcessos(root) {
  const lista = await q(sb.from('perfis').select('*').order('nome'));

  const form = p => {
    const $uid = input({ value: p?.user_id || '', disabled: !!p, placeholder: 'UUID copiado do Supabase (Authentication > Users)' });
    const $login = input({ value: p?.login || '' });
    const $nome = input({ value: p?.nome || '' });
    const $admin = input({ type: 'checkbox', checked: !!p?.is_admin });
    const $ativo = input({ type: 'checkbox', checked: p ? p.ativo : true });
    const marcados = new Map(PERMISSOES.map(([k]) => [k, input({ type: 'checkbox', checked: p?.permissoes?.[k] === true })]));
    modal(p ? `Acesso de ${p.nome}` : 'Novo acesso', el('div', { class: 'form-col' },
      p ? null : el('p', { class: 'muted' }, 'Crie primeiro o usuário em Supabase › Authentication › Users (e-mail e senha) e cole aqui o UUID.'),
      el('div', { class: 'grid-form' }, campo('Usuário (UUID)', $uid), campo('Login', $login), campo('Nome', $nome),
        el('label', { class: 'campo check' }, $admin, el('span', {}, 'Administrador (acesso total)')),
        el('label', { class: 'campo check' }, $ativo, el('span', {}, 'Ativo'))),
      el('h4', {}, 'Permissões'),
      el('div', { class: 'grid-checks' }, PERMISSOES.map(([k, rotulo]) =>
        el('label', { class: 'campo check' }, marcados.get(k), el('span', {}, rotulo))))),
      [{ label: 'Salvar', classe: 'btn primario', acao: acao(async () => {
        if (!$uid.value.trim() || !$login.value.trim() || !$nome.value.trim()) throw new Error('Preencha UUID, login e nome.');
        const permissoes = Object.fromEntries([...marcados].map(([k, c]) => [k, c.checked]));
        await q(sb.from('perfis').upsert({
          user_id: $uid.value.trim(), login: $login.value.trim(), nome: $nome.value.trim(),
          is_admin: $admin.checked, ativo: $ativo.checked, permissoes,
        }));
        toast('Acesso salvo.');
        recarregar();
      }) }]);
  };

  root.append(el('div', { class: 'cabecalho-tela' }, el('h2', {}, 'Acessos e permissões'), botao('+ Novo acesso', () => form(), 'btn primario')),
    tabela([{ h: 'Nome' }, { h: 'Login' }, { h: 'Admin' }, { h: 'Ativo' }, { h: 'Permissões', num: true }, { h: '' }],
      lista.map(p => ({ cells: [p.nome, p.login, p.is_admin ? 'Sim' : 'Não', p.ativo ? 'Sim' : 'Não',
        Object.values(p.permissoes || {}).filter(v => v === true).length, botao('Editar', () => form(p), 'btn pequeno')] }))));
}
