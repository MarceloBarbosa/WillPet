// Entrada da aplicação: login, carregamento de perfil, menu e roteamento por hash (#/pagina).
import { sb, state, el, hasPerm, toast } from './core.js';
import { paginas as inicio } from './pages/inicio.js';
import { paginas as vendas } from './pages/vendas.js';
import { paginas as estoque } from './pages/estoque.js';
import { paginas as cadastros } from './pages/cadastros.js';
import { paginas as financeiro } from './pages/financeiro.js';
import { paginas as relatorios } from './pages/relatorios.js';

const PAGINAS = [...inicio, ...vendas, ...estoque, ...financeiro, ...relatorios, ...cadastros];
const GRUPOS = ['Início', 'Vendas', 'Estoque', 'Financeiro', 'Relatórios', 'Cadastros'];

const $login = document.getElementById('login');
const $app = document.getElementById('app');
const $menu = document.getElementById('menu');
const $conteudo = document.getElementById('conteudo');

function mostrar(secao) {
  $login.classList.toggle('hidden', secao !== 'login');
  $app.classList.toggle('hidden', secao !== 'app');
}

function mostrarLogin(msg = '') {
  mostrar('login');
  document.getElementById('login-msg').textContent = msg;
}

async function iniciarSessao() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return mostrarLogin();
  const { data: perfil, error } = await sb.from('perfis').select('*').eq('user_id', user.id).maybeSingle();
  if (error || !perfil || !perfil.ativo) {
    await sb.auth.signOut();
    return mostrarLogin('Seu usuário não tem acesso. Peça ao administrador para liberar o cadastro.');
  }
  state.user = user;
  state.perfil = perfil;
  montarMenu();
  mostrar('app');
  roteia();
}

function paginasPermitidas() {
  return PAGINAS.filter(p => !p.perm || hasPerm(p.perm));
}

function montarMenu() {
  const permitidas = paginasPermitidas();
  $menu.replaceChildren(
    el('div', { class: 'marca' }, 'Estoque Web'),
    el('div', { class: 'usuario' }, state.perfil.nome, state.perfil.is_admin ? el('small', {}, ' (admin)') : null),
    ...GRUPOS.map(grupo => {
      const itens = permitidas.filter(p => p.grupo === grupo);
      if (!itens.length) return null;
      return el('nav', {}, el('h4', {}, grupo),
        itens.map(p => el('a', { href: `#/${p.id}`, 'data-id': p.id }, p.titulo)));
    }),
    el('button', { class: 'btn ghost sair', type: 'button', onclick: sair }, 'Sair'),
  );
}

async function sair() {
  await sb.auth.signOut();
  location.hash = '';
  mostrarLogin();
}

async function roteia() {
  if (state.perfil === null) return;
  const permitidas = paginasPermitidas();
  const id = location.hash.replace(/^#\/?/, '') || permitidas[0]?.id;
  const pagina = PAGINAS.find(p => p.id === id);
  document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('ativo', a.dataset.id === id));
  if (!pagina) { location.hash = `#/${permitidas[0]?.id || ''}`; return; }
  if (pagina.perm && !hasPerm(pagina.perm)) {
    $conteudo.replaceChildren(el('div', { class: 'aviso' }, 'Você não tem permissão para esta tela.'));
    return;
  }
  document.title = `${pagina.titulo} · Estoque Web`;
  $conteudo.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
  try {
    const conteudo = el('div', { class: 'pagina' });
    $conteudo.replaceChildren(conteudo);
    await pagina.render(conteudo);
  } catch (e) {
    $conteudo.replaceChildren(el('div', { class: 'aviso erro' }, `Erro ao carregar: ${e.message}`));
  }
}

// ----- eventos -----
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) return toast('E-mail ou senha inválidos.', 'erro');
  await iniciarSessao();
});

window.addEventListener('hashchange', roteia);

iniciarSessao();
