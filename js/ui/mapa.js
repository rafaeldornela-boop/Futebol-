/**
 * Renderização do Mapa de Campanha vertical em 12 camadas estilo Slay the Spire.
 * Camada 1 na base, Camada 12 (Chefão) no topo, com arestas SVG sem cruzamento.
 */

import { METADADOS_NO, TIPOS_NO } from '../campanha/constantes.js';
import {
  encontrarNoMapa,
  obterNosAlcancaveisIds,
  obterNosDisponiveisIds,
} from '../campanha/mapa.js';

function criarElemento(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined && texto !== null) el.textContent = String(texto);
  return el;
}

function criarSvgEdge(x1, y1, x2, y2, estadoAresta) {
  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  path.setAttribute('d', d);
  path.setAttribute('class', `aresta-mapa aresta-${estadoAresta}`);
  return path;
}

export function renderizarHudCampanha(estado) {
  const elSeed = document.getElementById('camp-hud-seed');
  const elClube = document.getElementById('camp-hud-clube');
  const elTituloElenco = document.getElementById('titulo-modal-elenco');
  const elDinheiro = document.getElementById('camp-hud-dinheiro');
  const elElenco = document.getElementById('camp-hud-elenco');
  const elDerrotas = document.getElementById('camp-hud-derrotas');
  const elExtras = document.getElementById('camp-hud-extras');

  if (!estado) return;

  const nomeClube = estado.clubeNome || 'Atlético Brisa';
  const dif = estado.dificuldade || 0;
  const nomeTec = estado.tecnicoNome || 'Clássico';
  if (elClube) {
    elClube.textContent = `${nomeClube} · Nív. ${dif} · Téc. ${nomeTec}`;
  }
  if (elTituloElenco) {
    elTituloElenco.textContent = `Elenco — ${nomeClube}`;
  }
  if (elSeed) elSeed.textContent = estado.seed;
  if (elDinheiro) elDinheiro.textContent = `$${estado.dinheiro}`;

  const totalElenco = estado.elenco.length;
  const lesionados = estado.elenco.filter((j) => j.lesionado).length;
  const somaEst = estado.elenco.reduce(
    (acc, j) => acc + (typeof j.extras?.estamina === 'number' ? j.extras.estamina : 100),
    0,
  );
  const mediaEst = totalElenco > 0 ? Math.round(somaEst / totalElenco) : 0;

  if (elElenco) {
    elElenco.textContent =
      lesionados > 0
        ? `${totalElenco}/18 · Est. ${mediaEst}% · ${lesionados} les.`
        : `${totalElenco}/18 · Est. ${mediaEst}%`;
  }

  if (elDerrotas) {
    elDerrotas.textContent = `Derrotas seg.: ${estado.derrotasSeguidas}/3`;
    elDerrotas.dataset.perigo = estado.derrotasSeguidas >= 2 ? 'true' : 'false';
  }

  if (elExtras) {
    const partes = [];
    if (estado.moral !== 0) {
      partes.push(`Moral ${estado.moral > 0 ? `+${estado.moral}` : estado.moral} próx. jogo`);
    }
    const contratos = estado.contratosPatrocinio || [];
    if (contratos.length > 0) {
      const somaPorJogo = contratos.reduce((acc, c) => acc + c.valorPorPartida, 0);
      const maxJogos = Math.max(...contratos.map((c) => c.partidasRestantes));
      partes.push(`Patrocínio +$${somaPorJogo}/jogo (${maxJogos})`);
    }
    elExtras.textContent = partes.length > 0 ? partes.join(' · ') : 'Sem bônus ativos';
  }
}

export function renderizarMapaCampanha(estado, { onSelecionarNo } = {}) {
  renderizarHudCampanha(estado);

  const elTrilha = document.getElementById('mapa-camadas-lista');
  const elSvg = document.getElementById('mapa-camadas-svg');
  const elHistorico = document.getElementById('camp-historico-lista');
  const elLegenda = document.getElementById('camp-legenda-nos');

  if (!elTrilha || !elSvg || !estado?.mapa) return;

  const disponiveisSet = new Set(obterNosDisponiveisIds(estado.mapa, estado.noAtualId));
  const alcancaveisSet = obterNosAlcancaveisIds(estado.mapa, estado.noAtualId);
  const visitadosSet = new Set(estado.nosVisitados || []);
  const noAtual = encontrarNoMapa(estado.mapa, estado.noAtualId);

  elTrilha.innerHTML = '';
  elSvg.innerHTML = '';

  // Renderiza de cima (camada 12 Chefão) para baixo (camada 1 início)
  const camadasDesc = [...estado.mapa.camadas].sort((a, b) => b.numero - a.numero);

  for (const camada of camadasDesc) {
    const linha = criarElemento('div', 'camada-mapa');
    linha.dataset.camada = String(camada.numero);

    const rotuloCamada = criarElemento('div', 'camada-rotulo num-tabular');
    rotuloCamada.textContent = camada.numero === 12 ? 'FINAL' : `F${camada.numero}`;

    const pistaNos = criarElemento('div', 'camada-nos-pista');

    for (const no of camada.nos) {
      const ehAtual = estado.noAtualId === no.id;
      const ehVisitado = visitadosSet.has(no.id);
      const ehDisponivel =
        estado.status === 'em_andamento' && disponiveisSet.has(no.id);
      const ehAlcancavel = alcancaveisSet.has(no.id);

      let estadoVisual = 'inacessivel';
      if (ehAtual) estadoVisual = 'atual';
      else if (ehVisitado) estadoVisual = 'visitado';
      else if (ehDisponivel) estadoVisual = 'disponivel';
      else if (ehAlcancavel) estadoVisual = 'futuro';

      const btn = criarElemento(
        'button',
        `no-mapa no-tipo-${no.tipo} no-estado-${estadoVisual}`,
      );
      btn.type = 'button';
      btn.style.left = `${no.xPct}%`;
      btn.dataset.noId = no.id;
      btn.dataset.tipo = no.tipo;
      btn.dataset.estado = estadoVisual;
      btn.disabled = !ehDisponivel;

      const meta = METADADOS_NO[no.tipo] || METADADOS_NO.partida;
      const icone = criarElemento('span', 'no-mapa-icone', meta.simbolo);
      icone.setAttribute('aria-hidden', 'true');

      const info = criarElemento('span', 'no-mapa-info');
      const titulo = criarElemento('strong', 'no-mapa-titulo', meta.nome);
      info.appendChild(titulo);

      if (no.tipo === TIPOS_NO.PARTIDA || no.tipo === TIPOS_NO.CHEFAO) {
        const subtexto =
          no.tipo === TIPOS_NO.CHEFAO
            ? 'Força: Chefão'
            : `Rival: ${no.rivalClassificacao || 'Médio'}`;
        const sub = criarElemento(
          'span',
          `no-mapa-sub forca-${(no.rivalClassificacao || 'medio').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`,
          subtexto,
        );
        info.appendChild(sub);
      } else if (ehVisitado || ehAtual) {
        info.appendChild(criarElemento('span', 'no-mapa-sub', 'Concluído'));
      }

      btn.append(icone, info);

      if (ehDisponivel && typeof onSelecionarNo === 'function') {
        btn.addEventListener('click', () => onSelecionarNo(no));
      }

      pistaNos.appendChild(btn);
    }

    linha.append(rotuloCamada, pistaNos);
    elTrilha.appendChild(linha);
  }

  // Renderiza legenda compacta
  if (elLegenda && elLegenda.childElementCount === 0) {
    const ordemLegenda = [
      TIPOS_NO.PARTIDA,
      TIPOS_NO.TREINO,
      TIPOS_NO.MERCADO,
      TIPOS_NO.PATROCINIO,
      TIPOS_NO.FISIOTERAPIA,
      TIPOS_NO.TORCIDA,
      TIPOS_NO.DESCANSO,
      TIPOS_NO.EVENTO,
      TIPOS_NO.MISTERIOSO,
      TIPOS_NO.CHEFAO,
    ];
    for (const tipo of ordemLegenda) {
      const m = METADADOS_NO[tipo];
      const item = criarElemento('div', 'legenda-no-item');
      item.append(
        criarElemento('span', `legenda-no-simbolo no-tipo-${tipo}`, m.simbolo),
        criarElemento('span', 'legenda-no-nome', m.nome),
      );
      elLegenda.appendChild(item);
    }
  }

  // Renderiza histórico recente
  if (elHistorico) {
    elHistorico.innerHTML = '';
    if (!estado.historico || estado.historico.length === 0) {
      elHistorico.appendChild(
        criarElemento(
          'p',
          'texto-suave',
          'Escolha uma partida da Camada 1 na base do mapa para iniciar a campanha.',
        ),
      );
    } else {
      for (const h of estado.historico.slice(0, 8)) {
        const card = criarElemento('div', 'camp-historico-item');
        const topo = criarElemento(
          'div',
          'camp-historico-topo',
          `F${h.camada} · ${METADADOS_NO[h.tipo]?.nome || h.tipo}`,
        );
        const desc = criarElemento('div', 'camp-historico-desc', h.resumo || '');
        card.append(topo, desc);
        elHistorico.appendChild(card);
      }
    }
  }

  // Desenha arestas SVG alinhadas aos centros reais dos botões
  const desenharArestas = () => {
    elSvg.innerHTML = '';
    const containerRect = elTrilha.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) return;

    elSvg.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);
    elSvg.style.width = `${containerRect.width}px`;
    elSvg.style.height = `${containerRect.height}px`;

    const botoesPorId = new Map();
    for (const btn of elTrilha.querySelectorAll('.no-mapa')) {
      const r = btn.getBoundingClientRect();
      botoesPorId.set(btn.dataset.noId, {
        cx: r.left - containerRect.left + r.width / 2,
        cy: r.top - containerRect.top + r.height / 2,
      });
    }

    for (const camada of estado.mapa.camadas) {
      for (const no of camada.nos) {
        const posOrig = botoesPorId.get(no.id);
        if (!posOrig) continue;

        for (const destId of no.conexoes || []) {
          const posDest = botoesPorId.get(destId);
          if (!posDest) continue;

          let estadoAresta = 'apagada';
          if (noAtual && no.id === noAtual.id && disponiveisSet.has(destId)) {
            estadoAresta = 'ativa';
          } else if (visitadosSet.has(no.id) && visitadosSet.has(destId)) {
            estadoAresta = 'visitada';
          } else if (
            (!noAtual && camada.numero === 1) ||
            (alcancaveisSet.has(no.id) && alcancaveisSet.has(destId))
          ) {
            estadoAresta = 'disponivel';
          }

          elSvg.appendChild(
            criarSvgEdge(posOrig.cx, posOrig.cy, posDest.cx, posDest.cy, estadoAresta),
          );
        }
      }
    }
  };

  if (typeof ResizeObserver === 'function') {
    if (elTrilha._mapaResizeObserver) {
      elTrilha._mapaResizeObserver.disconnect();
    }
    const ro = new ResizeObserver(() => desenharArestas());
    ro.observe(elTrilha);
    elTrilha._mapaResizeObserver = ro;
  }

  requestAnimationFrame(() => {
    desenharArestas();
    // Garante que o nó disponível fique visível no scroll
    const primeiroDisp = elTrilha.querySelector('.no-estado-disponivel');
    if (primeiroDisp && typeof primeiroDisp.scrollIntoView === 'function') {
      primeiroDisp.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  });
}
