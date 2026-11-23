/**
 * Painel de escolha de Formação (4-3-3, 4-4-2, 3-5-2, 4-2-3-1),
 * Postura Tática (Defensiva, Equilibrada, Ofensiva)
 * e Mapa de Calor da Pressão na Linha de Passe do meu time por fase.
 */

import {
  aplicarMovimentoDeTurno,
  atualizarStatusPosicaoJogador,
  FORMACOES,
  IDS_FORMACOES,
  obterFormacao,
} from '../dados/formacoes.js';
import { IDS_ZONAS_GRADE, ZONAS } from '../dados/zonas.js';
import { calcularMapaPressao } from '../regras/calculo.js';
import {
  obterConfigPostura,
  obterMultiplicadorPressaoLinhaPostura,
  ORDEM_POSTURAS,
} from '../regras/postura.js';
import { avaliarFamiliaridadePosicao } from '../jogador/identidade.js';
import { classificarPressaoQualitativa } from './apresentacao.js';

const FASES_HEATMAP = Object.freeze([
  { id: 'atras', rotulo: 'Atrás', zonaRef: 'Z1-C' },
  { id: 'meio', rotulo: 'Meio', zonaRef: 'Z3-C' },
  { id: 'frente', rotulo: 'Frente', zonaRef: 'Z5-C' },
]);

function el(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

function corCalorPressao(valor) {
  const t = Math.max(0, Math.min(1, valor / 100));
  if (t <= 0) return 'rgba(15, 32, 22, 0.72)';
  const alpha = (0.14 + Math.pow(t, 1.35) * 0.72).toFixed(3);
  return `rgba(220, 38, 38, ${alpha})`;
}

/**
 * Monta uma prévia leve dos 11 titulares posicionados na formação/postura/fase
 * para calcular o mapa de pressão na linha de passe do próprio time.
 */
function calcularPreviaHeatmapMeuTime({
  elenco,
  titularesPorPapel,
  formacaoId,
  posturaId,
  faseId,
  moral = 0,
  bonusAtributosPartida = 0,
}) {
  const formacao = obterFormacao(formacaoId);
  const mapaElenco = new Map((elenco || []).map((j) => [j.id, j]));
  const faseInfo = FASES_HEATMAP.find((f) => f.id === faseId) || FASES_HEATMAP[1];
  const bonusExtra = (moral || 0) + (bonusAtributosPartida || 0);

  const jogadoresSim = [];
  const foraPosicaoLista = [];

  for (const papel of formacao.papeis) {
    const jId = titularesPorPapel?.[papel];
    const orig = mapaElenco.get(jId);
    if (!orig) continue;

    const copia = structuredClone(orig);
    copia.papel = papel;
    if (bonusExtra !== 0 && copia.atributos) {
      for (const chave of Object.keys(copia.atributos)) {
        copia.atributos[chave] = Math.max(
          1,
          Math.min(100, (copia.atributos[chave] ?? 50) + bonusExtra),
        );
      }
    }
    const fora = atualizarStatusPosicaoJogador(copia);
    if (fora) {
      const fam = avaliarFamiliaridadePosicao(copia, papel);
      foraPosicaoLista.push(`${copia.nomeCurto} (${fam.rotulo})`);
    }
    jogadoresSim.push(copia);
  }

  const timeSim = {
    id: 'meuTime',
    formacao: formacao.id,
    jogadores: jogadoresSim,
  };

  aplicarMovimentoDeTurno(
    timeSim,
    'meuTime',
    faseInfo.zonaRef,
    null,
    formacao.id,
    0,
    {
      cobrarDeslocamento: false,
      posturaId,
    },
  );

  const multLinha = obterMultiplicadorPressaoLinhaPostura(posturaId);
  const mapa = calcularMapaPressao(jogadoresSim, null, {
    multiplicadorLinhaGeral: multLinha,
  });

  const porZona = {};
  for (const j of jogadoresSim) {
    if (!j.zona) continue;
    if (!porZona[j.zona]) porZona[j.zona] = [];
    porZona[j.zona].push(j);
  }

  let somaCampo = 0;
  for (const zId of IDS_ZONAS_GRADE) {
    somaCampo += mapa[zId]?.pressaoLinha || 0;
  }
  const mediaLinhaCampo = Math.round(somaCampo / IDS_ZONAS_GRADE.length);

  return {
    mapa,
    porZona,
    mediaLinhaCampo,
    foraPosicaoLista,
    faseInfo,
  };
}

export function renderizarPainelFormacaoHeatmap(
  container,
  {
    elenco,
    titularesPorPapel,
    formacaoId,
    posturaId,
    faseSelecionada = 'meio',
    moral = 0,
    bonusAtributosPartida = 0,
    onAlterarFormacao,
    onAlterarPostura,
    onAlterarFase,
  },
) {
  if (!container) return;
  container.innerHTML = '';

  const formacaoAtual = obterFormacao(formacaoId);
  const posturaAtual = obterConfigPostura(posturaId);

  // Bloco 1: Seletor de Formação
  const blocoForm = el('div', 'tatica-secao');
  blocoForm.appendChild(el('h3', 'escalacao-col-titulo', 'Formação Tática'));
  const gradeForm = el('div', 'seletor-formacao-grid');

  for (const id of IDS_FORMACOES) {
    const f = FORMACOES[id];
    const ativo = f.id === formacaoAtual.id;
    const btn = el('button', `btn-tatica-opcao${ativo ? ' selecionado' : ''}`);
    btn.type = 'button';
    btn.dataset.formacaoOpcao = f.id;
    btn.setAttribute('aria-pressed', String(ativo));
    btn.append(
      el('strong', 'tatica-op-titulo', f.nomeCurto),
      el('span', 'tatica-op-sub', f.descricao),
    );
    btn.addEventListener('click', () => {
      if (f.id !== formacaoAtual.id) {
        onAlterarFormacao?.(f.id);
      }
    });
    gradeForm.appendChild(btn);
  }
  blocoForm.appendChild(gradeForm);

  // Bloco 2: Seletor de Postura Inicial
  const blocoPostura = el('div', 'tatica-secao');
  blocoPostura.appendChild(el('h3', 'escalacao-col-titulo', 'Postura Inicial da Partida'));
  const gradePost = el('div', 'seletor-postura-grid');

  for (const pId of ORDEM_POSTURAS) {
    const p = obterConfigPostura(pId);
    const ativo = p.id === posturaAtual.id;
    const btn = el('button', `btn-tatica-opcao${ativo ? ' selecionado' : ''}`);
    btn.type = 'button';
    btn.dataset.posturaOpcao = p.id;
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = p.resumo;
    btn.append(
      el('strong', 'tatica-op-titulo', p.nome),
      el('span', 'tatica-op-sub', p.resumo),
    );
    btn.addEventListener('click', () => {
      if (p.id !== posturaAtual.id) {
        onAlterarPostura?.(p.id);
      }
    });
    gradePost.appendChild(btn);
  }
  blocoPostura.appendChild(gradePost);

  // Bloco 3: Mapa de Calor da Pressão na Linha de Passe
  const previa = calcularPreviaHeatmapMeuTime({
    elenco,
    titularesPorPapel,
    formacaoId: formacaoAtual.id,
    posturaId: posturaAtual.id,
    faseId: faseSelecionada,
    moral,
    bonusAtributosPartida,
  });

  const blocoHeat = el('div', 'tatica-secao heatmap-painel');
  const cabHeat = el('div', 'heatmap-cabecalho');
  cabHeat.appendChild(
    el('h3', 'escalacao-col-titulo', 'Mapa de Calor · Pressão na Linha (Seu Time)'),
  );

  const seletorFases = el('div', 'heatmap-fases-tabs');
  seletorFases.setAttribute('role', 'tablist');
  seletorFases.setAttribute('aria-label', 'Fase da bola para o mapa de calor');

  for (const fase of FASES_HEATMAP) {
    const ativo = fase.id === previa.faseInfo.id;
    const btn = el('button', `btn-fase-heatmap${ativo ? ' selecionado' : ''}`, fase.rotulo);
    btn.type = 'button';
    btn.role = 'tab';
    btn.dataset.heatmapFase = fase.id;
    btn.setAttribute('aria-selected', String(ativo));
    btn.addEventListener('click', () => {
      if (fase.id !== previa.faseInfo.id) {
        onAlterarFase?.(fase.id);
      }
    });
    seletorFases.appendChild(btn);
  }
  cabHeat.appendChild(seletorFases);
  blocoHeat.appendChild(cabHeat);

  // Métricas rápidas do mapa (leitura qualitativa)
  const resumoMet = el('div', 'heatmap-metricas');
  const mediaQual = classificarPressaoQualitativa(previa.mediaLinhaCampo);
  resumoMet.append(
    el('span', 'heatmap-pill', `Cobertura: ${mediaQual.rotulo}`),
    el(
      'span',
      `heatmap-pill${previa.foraPosicaoLista.length > 0 ? ' alerta' : ''}`,
      previa.foraPosicaoLista.length > 0
        ? `Improvisados: ${previa.foraPosicaoLista.length}`
        : 'Todos naturais/adaptados',
    ),
  );
  blocoHeat.appendChild(resumoMet);

  if (previa.foraPosicaoLista.length > 0) {
    blocoHeat.appendChild(
      el(
        'p',
        'heatmap-aviso-fora',
        `Atletas fora da função natural: ${previa.foraPosicaoLista.join(' · ')}`,
      ),
    );
  }

  // Mini campo vertical: GKR, 5x3 (Z5..Z1), GK
  const campoMini = el('div', 'heatmap-campo');
  campoMini.dataset.testid = 'heatmap-pressao';

  const criarCelulaHeatmap = (zId, ehGol = false) => {
    const pLinha = previa.mapa[zId]?.pressaoLinha ?? 0;
    const pQual = classificarPressaoQualitativa(pLinha);
    const jogadoresZona = previa.porZona[zId] || [];
    const cel = el('div', `heatmap-celula${ehGol ? ' eh-gol' : ''}`);
    cel.dataset.heatmapZona = zId;
    cel.dataset.pressaoLinha = String(pLinha);
    cel.style.backgroundColor = corCalorPressao(pLinha);
    cel.title = `${ZONAS[zId]?.nome || zId}: ${pQual.rotulo}`;

    const topo = el('div', 'heatmap-cel-topo');
    topo.append(
      el('span', 'heatmap-cel-id', ZONAS[zId]?.nome || zId),
      el('strong', 'heatmap-cel-val', pQual.curto),
    );
    cel.appendChild(topo);

    if (jogadoresZona.length > 0) {
      const lista = el('div', 'heatmap-cel-jogadores');
      for (const j of jogadoresZona) {
        const famJ = avaliarFamiliaridadePosicao(j, j.papel);
        const tag = el(
          'span',
          `heatmap-jog-tag${j.foraDePosicao ? ' fora' : ''}`,
          j.nomeCurto,
        );
        tag.title = `${j.nome} (${j.posicao} em ${j.papel} · ${famJ.rotulo})`;
        lista.appendChild(tag);
      }
      cel.appendChild(lista);
    }

    return cel;
  };

  campoMini.appendChild(criarCelulaHeatmap('GKR', true));

  const grade15 = el('div', 'heatmap-grade-15');
  const ordemZonas = [
    'Z5-E', 'Z5-C', 'Z5-D',
    'Z4-E', 'Z4-C', 'Z4-D',
    'Z3-E', 'Z3-C', 'Z3-D',
    'Z2-E', 'Z2-C', 'Z2-D',
    'Z1-E', 'Z1-C', 'Z1-D',
  ];
  for (const zId of ordemZonas) {
    grade15.appendChild(criarCelulaHeatmap(zId, false));
  }
  campoMini.appendChild(grade15);
  campoMini.appendChild(criarCelulaHeatmap('GK', true));

  blocoHeat.appendChild(campoMini);
  blocoHeat.appendChild(
    el(
      'p',
      'texto-legenda',
      'Tons mais intensos mostram maior pressão na linha de passe do seu time na fase selecionada, considerando familiaridade posicional e postura.',
    ),
  );

  container.append(blocoForm, blocoPostura, blocoHeat);
}
