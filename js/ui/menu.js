/**
 * Renderização do Menu Inicial:
 * - Continuar campanha ativa
 * - Configurar Nova Campanha (Clube inicial, Técnico, Dificuldade 0..5 e Seed)
 * - Acessos para Clube, Sala de Troféus, Partida Avulsa e Ferramenta de Equilíbrio
 */

import {
  BONUS_RIVAL_POR_DIFICULDADE,
  DIFICULDADE_MAX,
  DIFICULDADE_MIN,
  LISTA_CLUBES_INICIAIS,
  LISTA_TECNICOS_CLUBE,
} from '../meta/constantes.js';
import {
  clubeEstaDesbloqueado,
  tecnicoEstaDesbloqueado,
} from '../meta/desbloqueios.js';

function el(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

export function renderizarMenuInicial({
  meta,
  campanhaSalva,
  selecao,
  onAlterarSelecao,
  onSortearSeed,
  onContinuarCampanha,
  onIniciarCampanha,
  onAbrirClube,
  onAbrirTrofeus,
  onPartidaAvulsa,
  onAbrirSimulacao,
  onToggleRelogio,
}) {
  const elContinuar = document.getElementById('btn-continuar-campanha');
  const elClubes = document.getElementById('menu-opcoes-clube');
  const elTecnicos = document.getElementById('menu-opcoes-tecnico');
  const elDificuldades = document.getElementById('menu-opcoes-dificuldade');
  const elDificuldadeResumo = document.getElementById('menu-dificuldade-resumo');
  const elInputSeed = document.getElementById('input-seed-titulo');
  const elPontosBadge = document.getElementById('menu-pontos-legado');
  const elTrofeusBadge = document.getElementById('menu-trofeus-contagem');
  const elBtnToggleRelogio = document.getElementById('btn-toggle-relogio');
  const elRelogioDesc = document.getElementById('menu-relogio-desc');
  const elRelogioBadge = document.getElementById('menu-relogio-badge');

  if (elPontosBadge) {
    elPontosBadge.textContent = `${meta.pontosLegado} pts`;
  }
  if (elTrofeusBadge) {
    elTrofeusBadge.textContent = `${(meta.trofeus || []).length} troféu(s) · ${(meta.conquistasDesbloqueadas || []).length}/5`;
  }

  if (elContinuar) {
    const ativa = Boolean(campanhaSalva && campanhaSalva.status === 'em_andamento');
    elContinuar.hidden = !ativa;
    if (ativa) {
      const dif = campanhaSalva.dificuldade || 0;
      const nomeClube = campanhaSalva.clubeNome || 'Atlético Brisa';
      elContinuar.textContent = `Continuar Campanha (${nomeClube} · Nív. ${dif} · F${campanhaSalva.camadaAtual || 1} · ${campanhaSalva.seed})`;
    }
  }

  if (elInputSeed && selecao.seed && elInputSeed.value !== selecao.seed) {
    elInputSeed.value = selecao.seed;
  }

  // Clubes iniciais
  if (elClubes) {
    elClubes.innerHTML = '';
    for (const clube of LISTA_CLUBES_INICIAIS) {
      const desb = clubeEstaDesbloqueado(meta, clube.id);
      const ativo = selecao.clubeId === clube.id && desb;
      const btn = el('button', `menu-chip-opcao${ativo ? ' selecionado' : ''}`);
      btn.type = 'button';
      btn.disabled = !desb;
      btn.dataset.menuClube = clube.id;
      btn.title = clube.descricao;

      const nome = el('strong', 'menu-chip-titulo', clube.rotuloEstilo);
      const desc = el(
        'span',
        'menu-chip-sub',
        desb ? clube.descricao : `Bloqueado (${clube.custo} pts no Clube)`,
      );
      btn.append(nome, desc);

      btn.addEventListener('click', () => {
        if (desb) onAlterarSelecao?.({ clubeId: clube.id });
      });
      elClubes.appendChild(btn);
    }
  }

  // Técnicos
  if (elTecnicos) {
    elTecnicos.innerHTML = '';
    for (const tec of LISTA_TECNICOS_CLUBE) {
      const desb = tecnicoEstaDesbloqueado(meta, tec.id);
      const ativo = selecao.tecnicoId === tec.id && desb;
      const btn = el('button', `menu-chip-opcao${ativo ? ' selecionado' : ''}`);
      btn.type = 'button';
      btn.disabled = !desb;
      btn.dataset.menuTecnico = tec.id;
      btn.title = tec.descricao;

      const nome = el('strong', 'menu-chip-titulo', tec.nome);
      const desc = el(
        'span',
        'menu-chip-sub',
        desb ? tec.descricao : `Bloqueado (${tec.custo} pts no Clube)`,
      );
      btn.append(nome, desc);

      btn.addEventListener('click', () => {
        if (desb) onAlterarSelecao?.({ tecnicoId: tec.id });
      });
      elTecnicos.appendChild(btn);
    }
  }

  // Níveis de dificuldade (0..5)
  if (elDificuldades) {
    elDificuldades.innerHTML = '';
    const difMax = meta.dificuldadeMaxDesbloqueada || 0;
    for (let d = DIFICULDADE_MIN; d <= DIFICULDADE_MAX; d += 1) {
      const desb = d <= difMax;
      const ativo = selecao.dificuldade === d && desb;
      const btn = el('button', `menu-dif-btn${ativo ? ' selecionado' : ''}`);
      btn.type = 'button';
      btn.disabled = !desb;
      btn.dataset.menuDificuldade = String(d);
      btn.textContent = desb ? `Nív. ${d}` : `Nív. ${d} 🔒`;
      btn.title = desb
        ? `Força rival +${d * BONUS_RIVAL_POR_DIFICULDADE}`
        : `Vença a campanha no nível ${d - 1} para desbloquear`;
      btn.addEventListener('click', () => {
        if (desb) onAlterarSelecao?.({ dificuldade: d });
      });
      elDificuldades.appendChild(btn);
    }

    if (elDificuldadeResumo) {
      const dAtual = Math.min(selecao.dificuldade || 0, difMax);
      elDificuldadeResumo.textContent =
        dAtual === 0
          ? 'Padrão (+0 força rival) · Desbloqueado até nível ' + difMax
          : `Nível ${dAtual}: +${dAtual * BONUS_RIVAL_POR_DIFICULDADE} na força dos rivais (+${dAtual * 5} pts de legado)`;
    }
  }

  if (elBtnToggleRelogio) {
    const desligado = Boolean(meta?.opcoes?.relogioDesligado);
    elBtnToggleRelogio.setAttribute('aria-checked', String(!desligado));
    elBtnToggleRelogio.classList.toggle('ligado', !desligado);
    if (elRelogioBadge) {
      elRelogioBadge.textContent = desligado ? 'Desligado' : 'Ligado';
    }
    if (elRelogioDesc) {
      elRelogioDesc.textContent = desligado
        ? 'Desligado: sem limite de tempo em nenhuma dificuldade.'
        : 'Ligado: 30s (Nív. 1–2), 20s (Nív. 3–4), 12s (Nív. 5)';
    }
  }

  // Listeners estáticos vinculados uma única vez via dataset guard
  const bindOnce = (id, handler) => {
    const node = document.getElementById(id);
    if (node && !node.dataset.boundMenu) {
      node.dataset.boundMenu = '1';
      node.addEventListener('click', handler);
    }
  };

  bindOnce('btn-sortear-seed', () => onSortearSeed?.());
  bindOnce('btn-continuar-campanha', () => onContinuarCampanha?.());
  bindOnce('btn-iniciar', () => onIniciarCampanha?.());
  bindOnce('btn-abrir-clube', () => onAbrirClube?.());
  bindOnce('btn-abrir-trofeus', () => onAbrirTrofeus?.());
  bindOnce('btn-partida-rapida', () => onPartidaAvulsa?.());
  bindOnce('btn-abrir-simulacao', () => onAbrirSimulacao?.());
  bindOnce('btn-toggle-relogio', () => onToggleRelogio?.());

  if (elInputSeed && !elInputSeed.dataset.boundMenu) {
    elInputSeed.dataset.boundMenu = '1';
    elInputSeed.addEventListener('input', () => {
      onAlterarSelecao?.({ seed: elInputSeed.value });
    });
  }
}
