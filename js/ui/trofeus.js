/**
 * Sala de Troféus:
 * - Estatísticas históricas da carreira
 * - 5 Conquistas permanentes (desbloqueadas e bloqueadas)
 * - Galeria de taças das campanhas vencidas (clube, técnico, dificuldade, seed e placar da final)
 */

import { CONQUISTAS_DEFINICOES } from '../meta/constantes.js';

function el(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

export function renderizarSalaTrofeus(container, meta, { onVoltarMenu } = {}) {
  if (!container || !meta) return;
  container.innerHTML = '';

  const cab = el('header', 'meta-cabecalho');
  const esq = el('div', 'meta-cab-esq');
  esq.append(
    el('span', 'no-tipo-etiqueta', 'GALERIA HISTÓRICA'),
    el('h2', 'no-titulo', 'Sala de Troféus'),
  );

  const dir = el('div', 'meta-cab-dir');
  const btnVoltar = el('button', 'btn-secundario', 'Voltar ao Menu');
  btnVoltar.type = 'button';
  btnVoltar.id = 'btn-trofeus-voltar';
  btnVoltar.addEventListener('click', () => onVoltarMenu?.());
  dir.appendChild(btnVoltar);

  cab.append(esq, dir);
  container.appendChild(cab);

  // Resumo geral
  const gradeStats = el('div', 'grade-stats-finais grade-stats-camp');
  const stats = [
    { valor: String(meta.campanhasVencidas || 0), rotulo: 'Títulos' },
    { valor: String(meta.campanhasJogadas || 0), rotulo: 'Campanhas' },
    { valor: `${meta.dificuldadeMaxDesbloqueada || 0}/5`, rotulo: 'Dif. Máxima' },
    { valor: `${(meta.conquistasDesbloqueadas || []).length}/5`, rotulo: 'Conquistas' },
  ];
  for (const s of stats) {
    const item = el('div', 'stat-final-item');
    item.append(
      el('span', 'stat-final-valor num-tabular', s.valor),
      el('span', 'stat-final-rotulo', s.rotulo),
    );
    gradeStats.appendChild(item);
  }
  container.appendChild(gradeStats);

  // Conquistas (5)
  const secConq = el('section', 'meta-secao');
  secConq.appendChild(el('h3', 'escalacao-col-titulo', 'Conquistas (5)'));
  const gradeConq = el('div', 'meta-grade-2');
  const desbSet = new Set(meta.conquistasDesbloqueadas || []);

  for (const conq of CONQUISTAS_DEFINICOES) {
    const ativa = desbSet.has(conq.id);
    const card = el('div', `meta-card conquista-card${ativa ? ' ativa' : ' bloqueada'}`);
    const topo = el('div', 'meta-card-topo');
    topo.append(
      el('strong', 'meta-card-titulo', `${ativa ? '★ ' : ''}${conq.nome}`),
      el('span', 'meta-nivel-badge', ativa ? 'Concluída' : 'Bloqueada'),
    );
    card.append(topo, el('p', 'meta-card-desc', conq.descricao));
    gradeConq.appendChild(card);
  }
  secConq.appendChild(gradeConq);
  container.appendChild(secConq);

  // Troféus de campanhas vencidas
  const secTrofeus = el('section', 'meta-secao');
  const trofeus = meta.trofeus || [];
  secTrofeus.appendChild(
    el('h3', 'escalacao-col-titulo', `Campanhas Vencidas (${trofeus.length})`),
  );

  if (trofeus.length === 0) {
    secTrofeus.appendChild(
      el(
        'p',
        'texto-suave',
        'Nenhuma taça conquistada ainda. Vença o Chefão na Camada 12 para gravar seu primeiro troféu aqui!',
      ),
    );
  } else {
    const lista = el('div', 'trofeus-lista');
    for (const t of trofeus) {
      const card = el('div', 'trofeu-card');
      const topo = el('div', 'meta-card-topo');
      topo.append(
        el('strong', 'meta-card-titulo', `🏆 ${t.clubeNome || 'Atlético Brisa'} · Dificuldade ${t.dificuldade ?? 0}`),
        el('span', 'meta-nivel-badge num-tabular', `Final ${t.placarChefao || ''}`),
      );
      const detalhes = el(
        'div',
        'trofeu-detalhes num-tabular',
        `Técnico: ${t.tecnicoNome || 'Clássico'} · Rival: ${t.rivalChefaoNome || 'Imperador FC'} · Seed: ${t.seed || '—'}${t.dataIso ? ` · ${t.dataIso}` : ''}`,
      );
      card.append(topo, detalhes);
      lista.appendChild(card);
    }
    secTrofeus.appendChild(lista);
  }
  container.appendChild(secTrofeus);
}
