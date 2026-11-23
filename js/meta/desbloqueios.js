/**
 * Desbloqueios permanentes de Clubes iniciais, Técnicos, Pacotes de conteúdo,
 * Níveis de dificuldade (0 a 5), Registro de Troféus e 5 Conquistas.
 */

import {
  CLUBES_INICIAIS,
  CONQUISTAS_DEFINICOES,
  DIFICULDADE_MAX,
  PACOTES_CONTEUDO,
  TECNICOS_CLUBE,
} from './constantes.js';

export function clubeEstaDesbloqueado(meta, clubeId) {
  const clube = CLUBES_INICIAIS[clubeId];
  if (!clube) return false;
  if (clube.gratuito) return true;
  return Array.isArray(meta?.clubesDesbloqueados) && meta.clubesDesbloqueados.includes(clubeId);
}

export function tecnicoEstaDesbloqueado(meta, tecnicoId) {
  const tec = TECNICOS_CLUBE[tecnicoId];
  if (!tec) return false;
  if (tec.gratuito) return true;
  return Array.isArray(meta?.tecnicosDesbloqueados) && meta.tecnicosDesbloqueados.includes(tecnicoId);
}

export function pacoteEstaDesbloqueado(meta, pacoteId) {
  const pac = PACOTES_CONTEUDO[pacoteId];
  if (!pac) return false;
  return Array.isArray(meta?.pacotesDesbloqueados) && meta.pacotesDesbloqueados.includes(pacoteId);
}

export function comprarDesbloqueioClube(meta, clubeId) {
  const clube = CLUBES_INICIAIS[clubeId];
  if (!clube || !meta) {
    return { valido: false, motivo: 'Clube inválido.' };
  }
  if (clubeEstaDesbloqueado(meta, clubeId)) {
    meta.clubeSelecionadoPadrao = clubeId;
    return {
      valido: true,
      acao: 'selecionado',
      clube,
      resumo: `Clube ${clube.nome} selecionado como padrão.`,
    };
  }
  if ((meta.pontosLegado || 0) < clube.custo) {
    return {
      valido: false,
      motivo: `Pontos insuficientes para ${clube.rotuloEstilo} (precisa de ${clube.custo} pts).`,
    };
  }

  meta.pontosLegado -= clube.custo;
  if (!Array.isArray(meta.clubesDesbloqueados)) meta.clubesDesbloqueados = ['equilibrado'];
  meta.clubesDesbloqueados.push(clubeId);
  meta.clubeSelecionadoPadrao = clubeId;

  return {
    valido: true,
    acao: 'comprado',
    clube,
    custo: clube.custo,
    resumo: `Clube ${clube.nome} (${clube.rotuloEstilo}) desbloqueado (−${clube.custo} pts)!`,
  };
}

export function comprarDesbloqueioTecnico(meta, tecnicoId) {
  const tec = TECNICOS_CLUBE[tecnicoId];
  if (!tec || !meta) {
    return { valido: false, motivo: 'Técnico inválido.' };
  }
  if (tecnicoEstaDesbloqueado(meta, tecnicoId)) {
    meta.tecnicoSelecionadoPadrao = tecnicoId;
    return {
      valido: true,
      acao: 'selecionado',
      tecnico: tec,
      resumo: `Técnico ${tec.nome} selecionado como padrão.`,
    };
  }
  if ((meta.pontosLegado || 0) < tec.custo) {
    return {
      valido: false,
      motivo: `Pontos insuficientes para ${tec.nome} (precisa de ${tec.custo} pts).`,
    };
  }

  meta.pontosLegado -= tec.custo;
  if (!Array.isArray(meta.tecnicosDesbloqueados)) meta.tecnicosDesbloqueados = ['padrao'];
  meta.tecnicosDesbloqueados.push(tecnicoId);
  meta.tecnicoSelecionadoPadrao = tecnicoId;

  return {
    valido: true,
    acao: 'comprado',
    tecnico: tec,
    custo: tec.custo,
    resumo: `Técnico ${tec.nome} contratado para o clube (−${tec.custo} pts)!`,
  };
}

export function comprarPacoteConteudo(meta, pacoteId) {
  const pac = PACOTES_CONTEUDO[pacoteId];
  if (!pac || !meta) {
    return { valido: false, motivo: 'Pacote inválido.' };
  }
  if (pacoteEstaDesbloqueado(meta, pacoteId)) {
    return { valido: false, motivo: `${pac.nome} já foi desbloqueado.` };
  }
  if ((meta.pontosLegado || 0) < pac.custo) {
    return {
      valido: false,
      motivo: `Pontos insuficientes para ${pac.nome} (precisa de ${pac.custo} pts).`,
    };
  }

  meta.pontosLegado -= pac.custo;
  if (!Array.isArray(meta.pacotesDesbloqueados)) meta.pacotesDesbloqueados = [];
  meta.pacotesDesbloqueados.push(pacoteId);

  return {
    valido: true,
    pacote: pac,
    custo: pac.custo,
    resumo: `${pac.nome} desbloqueado (−${pac.custo} pts)! Novo conteúdo ativo nas campanhas.`,
  };
}

/**
 * Avalia conquistas desbloqueadas ao final de uma campanha.
 */
export function avaliarConquistasCampanha(resumo) {
  const ganhas = [];
  const venceu = resumo.status === 'vitoria';
  const placar = resumo.placarChefao || null;

  if (venceu && (resumo.derrotas || 0) === 0) {
    ganhas.push('sem_derrota');
  }
  if (venceu && placar && (placar.meuTime - placar.rival) >= 3) {
    ganhas.push('goleada_chefao');
  }
  if ((resumo.dinheiro || 0) > 1000) {
    ganhas.push('rico_1000');
  }
  if (venceu && resumo.clubeId === 'retranca') {
    ganhas.push('vencer_retranca');
  }
  if (venceu && (resumo.dificuldade || 0) >= 3) {
    ganhas.push('vencer_nivel_3');
  }

  return ganhas;
}

/**
 * Atualiza dificuldade máxima desbloqueada, lista de troféus (em vitória)
 * e conquistas alcançadas no estado meta.
 */
export function registrarResultadoCampanhaNosDesbloqueios(meta, resumo) {
  if (!meta || !resumo) {
    return { desbloqueouDificuldade: null, trofeu: null, novasConquistas: [] };
  }

  let desbloqueouDificuldade = null;
  let trofeu = null;

  const dif = Math.max(0, Math.min(DIFICULDADE_MAX, Number(resumo.dificuldade) || 0));

  if (resumo.status === 'vitoria') {
    if (dif >= (meta.dificuldadeMaxDesbloqueada || 0) && dif < DIFICULDADE_MAX) {
      meta.dificuldadeMaxDesbloqueada = dif + 1;
      desbloqueouDificuldade = meta.dificuldadeMaxDesbloqueada;
    }

    const clube = CLUBES_INICIAIS[resumo.clubeId] || CLUBES_INICIAIS.equilibrado;
    const tecnico = TECNICOS_CLUBE[resumo.tecnicoId] || TECNICOS_CLUBE.padrao;
    trofeu = {
      id: `trf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      clubeId: clube.id,
      clubeNome: clube.nome,
      clubeEstilo: clube.rotuloEstilo,
      tecnicoId: tecnico.id,
      tecnicoNome: tecnico.nome,
      dificuldade: dif,
      seed: resumo.seed || 'SEM-SEED',
      placarChefao: resumo.placarChefao
        ? `${resumo.placarChefao.meuTime} × ${resumo.placarChefao.rival}`
        : 'Vitória',
      rivalChefaoNome: resumo.rivalChefaoNome || 'Imperador FC',
      dataIso: new Date().toISOString().slice(0, 10),
    };

    if (!Array.isArray(meta.trofeus)) meta.trofeus = [];
    meta.trofeus.unshift(trofeu);
  }

  const elegiveis = avaliarConquistasCampanha(resumo);
  if (!Array.isArray(meta.conquistasDesbloqueadas)) meta.conquistasDesbloqueadas = [];
  const novasConquistas = [];

  for (const id of elegiveis) {
    if (!meta.conquistasDesbloqueadas.includes(id)) {
      meta.conquistasDesbloqueadas.push(id);
      const def = CONQUISTAS_DEFINICOES.find((c) => c.id === id);
      if (def) novasConquistas.push(def);
    }
  }

  return {
    desbloqueouDificuldade,
    trofeu,
    novasConquistas,
  };
}
