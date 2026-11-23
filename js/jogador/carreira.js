/**
 * Ciclo Completo de Carreira dos Jogadores.
 *
 * Responsabilidades centralizadas e configuráveis:
 * - Validação estrita de idade (16..45) e envelhecimento anual por temporada.
 * - 7 faixas de carreira (formação, jovem, desenvolvimento, auge, veterano, declínio, fim de carreira).
 * - Longevidade individual oculta (variação de início/ritmo de declínio e aposentadoria por atleta).
 * - Experiência acumulada por partidas, jogos decisivos e temporadas (impacto moderado em consistência/mental).
 * - Desenvolvimento sazonal direcionado por faixa etária + potencial + atividade + estagnação realista,
 *   NUNCA ultrapassando o teto de potencial individual e NUNCA aplicando "+1 plano em tudo".
 * - Declínio gradual focado em físicos (velocidade primeiro), preservando mentais e técnico-táticos.
 * - Probabilidade progressiva e configurável de aposentadoria + geração de registro histórico (Hall da Fama).
 */

import {
  calcularAvaliacaoPosicional,
  normalizarChavePosicao,
  PESOS_AVALIACAO_POSICIONAL,
} from './identidade.js';

// ============================================================================
// Constantes Configuráveis do Ciclo de Carreira
// ============================================================================

export const IDADE_MINIMA_JOGADOR = 16;
export const IDADE_MAXIMA_JOGADOR = 45;

export const FAIXAS_CARREIRA = Object.freeze([
  Object.freeze({
    id: 'formacao',
    rotulo: 'Formação',
    min: 16,
    max: 18,
    fatorTreino: 1.24,
    fatorEvolucaoTemporada: 1.25,
    chanceBaseEstagnacao: 0.14,
    pesoPotencialMercado: 2.35,
    fatorIdadeMercado: 1.04,
  }),
  Object.freeze({
    id: 'jovem',
    rotulo: 'Jovem',
    min: 19,
    max: 21,
    fatorTreino: 1.18,
    fatorEvolucaoTemporada: 1.15,
    chanceBaseEstagnacao: 0.16,
    pesoPotencialMercado: 2.15,
    fatorIdadeMercado: 1.08,
  }),
  Object.freeze({
    id: 'desenvolvimento',
    rotulo: 'Desenvolvimento',
    min: 22,
    max: 25,
    fatorTreino: 1.0,
    fatorEvolucaoTemporada: 0.92,
    chanceBaseEstagnacao: 0.22,
    pesoPotencialMercado: 1.15,
    fatorIdadeMercado: 1.06,
  }),
  Object.freeze({
    id: 'auge',
    rotulo: 'Auge',
    min: 26,
    max: 29,
    fatorTreino: 0.78,
    fatorEvolucaoTemporada: 0.45,
    chanceBaseEstagnacao: 0.35,
    pesoPotencialMercado: 0.35,
    fatorIdadeMercado: 1.0,
  }),
  Object.freeze({
    id: 'veterano',
    rotulo: 'Veterano',
    min: 30,
    max: 32,
    fatorTreino: 0.56,
    fatorEvolucaoTemporada: 0.2,
    chanceBaseEstagnacao: 0.58,
    pesoPotencialMercado: 0.08,
    fatorIdadeMercado: 0.82,
  }),
  Object.freeze({
    id: 'declinio',
    rotulo: 'Declínio',
    min: 33,
    max: 35,
    fatorTreino: 0.42,
    fatorEvolucaoTemporada: 0.08,
    chanceBaseEstagnacao: 0.78,
    pesoPotencialMercado: 0.0,
    fatorIdadeMercado: 0.66,
  }),
  Object.freeze({
    id: 'fim_carreira',
    rotulo: 'Veterano em fim de carreira',
    min: 36,
    max: 99,
    fatorTreino: 0.32,
    fatorEvolucaoTemporada: 0.04,
    chanceBaseEstagnacao: 0.9,
    pesoPotencialMercado: 0.0,
    fatorIdadeMercado: 0.5,
  }),
]);

export const CARREIRA_CONFIG = Object.freeze({
  idadeMin: IDADE_MINIMA_JOGADOR,
  idadeMax: IDADE_MAXIMA_JOGADOR,
  // Categorias de atributos para declínio diferenciado (físicos caem antes; mentais/técnicos resistem)
  atributosFisicosPrincipais: Object.freeze(['velocidade']),
  atributosFisicosSecundarios: Object.freeze(['dibre', 'desarme']),
  atributosMentais: Object.freeze(['concentracao']),
  atributosTecnicosTaticos: Object.freeze([
    'passe',
    'dominio',
    'posicionamento',
    'tecnica',
    'interceptacao',
    'finalizacao',
    'marcacao',
    'defesa',
  ]),
  // Longevidade individual oculta (multiplicador em torno de 1.0)
  longevidadeMin: 0.76,
  longevidadeMax: 1.28,
  bonusLongevidadeGoleiro: 0.1,
  // Experiência (0..100, crescimento limitado para evitar inflação infinita)
  experienciaMax: 100,
  experienciaPorPartida: 1.5,
  experienciaBonusPartidaRelevante: 1.5,
  experienciaBonusTitulo: 5,
  experienciaPorTemporada: 4,
  // Aposentadoria configurável por idade efetiva (após ajuste de longevidade/goleiro)
  idadeMinimaAvaliacaoAposentadoria: 35,
  probabilidadeAposentadoriaBase: Object.freeze({
    35: 0.04,
    36: 0.14,
    37: 0.24,
    38: 0.38,
    39: 0.52,
    40: 0.68,
    41: 0.82,
    42: 0.91,
    43: 0.96,
    44: 0.99,
    45: 1.0,
  }),
});

// ============================================================================
// Helpers Determinísticos & Normalização de Idade
// ============================================================================

function hashCarreira(texto) {
  let h = 2166136261 >>> 0;
  const s = String(texto || 'carreira');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Valida e normaliza qualquer valor de idade para a faixa realista [16..45].
 * Nunca aceita idade negativa, zero, NaN ou valores absurdos.
 */
export function normalizarIdade(idade, fallback = 24) {
  const fb =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? Math.max(IDADE_MINIMA_JOGADOR, Math.min(IDADE_MAXIMA_JOGADOR, Math.round(fallback)))
      : 24;
  if (typeof idade !== 'number' || !Number.isFinite(idade) || idade <= 0) {
    return fb;
  }
  return Math.max(IDADE_MINIMA_JOGADOR, Math.min(IDADE_MAXIMA_JOGADOR, Math.round(idade)));
}

/**
 * Retorna a faixa de carreira correspondente à idade informada.
 */
export function obterFaixaCarreira(idade) {
  const idadeValida = normalizarIdade(idade, 24);
  return (
    FAIXAS_CARREIRA.find((f) => idadeValida >= f.min && idadeValida <= f.max) ||
    FAIXAS_CARREIRA[FAIXAS_CARREIRA.length - 1]
  );
}

/**
 * Deduz um fator oculto de longevidade individual (0.76..1.28, goleiros +0.10)
 * para garantir que cada jogador tenha início e ritmo de declínio próprios.
 */
export function deduzirLongevidadePadrao(jogador) {
  const h = hashCarreira(`long|${jogador?.id || ''}|${jogador?.nome || ''}`);
  const normalizado = (h % 1000) / 1000; // 0..0.999
  const base =
    CARREIRA_CONFIG.longevidadeMin +
    normalizado * (CARREIRA_CONFIG.longevidadeMax - CARREIRA_CONFIG.longevidadeMin);
  const bonusGol = jogador?.ehGoleiro ? CARREIRA_CONFIG.bonusLongevidadeGoleiro : 0;
  return Math.round(Math.min(1.36, base + bonusGol) * 100) / 100;
}

/**
 * Deduz uma experiência inicial coerente com a idade (jovens têm baixa; veteranos têm alta).
 */
export function deduzirExperienciaInicial(idade) {
  const id = normalizarIdade(idade, 24);
  if (id <= 18) return 4 + (id - 16) * 3;
  if (id <= 21) return 12 + (id - 19) * 6;
  if (id <= 25) return 28 + (id - 22) * 7;
  if (id <= 29) return 54 + (id - 26) * 5;
  if (id <= 32) return 72 + (id - 30) * 4;
  return Math.min(94, 82 + (id - 33) * 2);
}

/**
 * Deduz uma propensão individual sutil à estagnação (0.75..1.20) para criar
 * trajetórias realistas (nem toda promessa de alto potencial atinge 100% do teto).
 */
function deduzirFatorConsistenciaEvolucao(jogador) {
  const h = hashCarreira(`cons|${jogador?.id || ''}|${jogador?.nome || ''}`);
  const frac = (h % 1000) / 1000;
  return Math.round((0.75 + frac * 0.45) * 100) / 100;
}

/**
 * Garante que todos os campos do ciclo de carreira existam no jogador
 * sem sobrescrever valores válidos já salvos.
 */
export function garantirCarreiraJogador(jogador) {
  if (!jogador || typeof jogador !== 'object') return jogador;

  const fallbackIdade = jogador.ehJovem ? 18 : 24;
  jogador.idade = normalizarIdade(jogador.idade, fallbackIdade);

  if (
    typeof jogador.longevidade !== 'number' ||
    !Number.isFinite(jogador.longevidade) ||
    jogador.longevidade < 0.5 ||
    jogador.longevidade > 1.6
  ) {
    jogador.longevidade = deduzirLongevidadePadrao(jogador);
  }

  if (
    typeof jogador.experiencia !== 'number' ||
    !Number.isFinite(jogador.experiencia)
  ) {
    jogador.experiencia = deduzirExperienciaInicial(jogador.idade);
  } else {
    jogador.experiencia = Math.max(
      0,
      Math.min(CARREIRA_CONFIG.experienciaMax, Math.round(jogador.experiencia * 10) / 10),
    );
  }

  if (
    typeof jogador.fatorConsistenciaEvolucao !== 'number' ||
    !Number.isFinite(jogador.fatorConsistenciaEvolucao)
  ) {
    jogador.fatorConsistenciaEvolucao = deduzirFatorConsistenciaEvolucao(jogador);
  }

  if (typeof jogador.temporadasJogadas !== 'number' || jogador.temporadasJogadas < 0) {
    jogador.temporadasJogadas = Math.max(0, jogador.idade - 17);
  }

  if (typeof jogador.partidasNaTemporada !== 'number' || jogador.partidasNaTemporada < 0) {
    jogador.partidasNaTemporada = 0;
  }

  const stats = jogador.estatisticasCarreira || {};
  jogador.estatisticasCarreira = {
    partidas: Math.max(0, Math.round(Number(stats.partidas) || 0)),
    gols: Math.max(0, Math.round(Number(stats.gols) || 0)),
    assistencias: Math.max(0, Math.round(Number(stats.assistencias) || 0)),
    titulos: Math.max(0, Math.round(Number(stats.titulos) || 0)),
  };

  if (typeof jogador.aposentado !== 'boolean') {
    jogador.aposentado = false;
  }

  return jogador;
}

/**
 * Envelhece o jogador em +1 ano (chamado exclusivamente na virada de temporada).
 */
export function envelhecerJogador(jogador, anos = 1) {
  garantirCarreiraJogador(jogador);
  const delta = Math.max(0, Math.round(anos));
  const antes = jogador.idade;
  jogador.idade = normalizarIdade(antes + delta, antes);
  if (delta > 0) {
    jogador.temporadasJogadas = (jogador.temporadasJogadas || 0) + delta;
  }
  return {
    idadeAntes: antes,
    idadeDepois: jogador.idade,
    faixaCarreira: obterFaixaCarreira(jogador.idade),
  };
}

// ============================================================================
// Experiência Acumulada (partidas, jogos decisivos e temporadas)
// ============================================================================

/**
 * Registra a participação do atleta em uma partida (estatísticas + experiência).
 * NUNCA altera a idade do jogador.
 */
export function registrarParticipacaoPartidaCarreira(
  jogador,
  { gols = 0, assistencias = 0, relevante = false, titulo = false } = {},
) {
  garantirCarreiraJogador(jogador);
  const stats = jogador.estatisticasCarreira;
  stats.partidas += 1;
  stats.gols += Math.max(0, Math.round(gols));
  stats.assistencias += Math.max(0, Math.round(assistencias));
  if (titulo) stats.titulos += 1;

  jogador.partidasNaTemporada = (jogador.partidasNaTemporada || 0) + 1;

  // Experiência cresce com retorno decrescente perto de 100 (sem inflação infinita)
  const expAtual = jogador.experiencia;
  const fatorRetorno = Math.max(0.25, 1 - expAtual / 130);
  const ganhoBruto =
    CARREIRA_CONFIG.experienciaPorPartida +
    (relevante ? CARREIRA_CONFIG.experienciaBonusPartidaRelevante : 0) +
    (titulo ? CARREIRA_CONFIG.experienciaBonusTitulo : 0);
  const ganhoExp = Math.round(ganhoBruto * fatorRetorno * 10) / 10;

  jogador.experiencia = Math.min(
    CARREIRA_CONFIG.experienciaMax,
    Math.round((expAtual + ganhoExp) * 10) / 10,
  );

  return {
    ganhoExperiencia: Math.round((jogador.experiencia - expAtual) * 10) / 10,
    experienciaAtual: jogador.experiencia,
    estatisticasCarreira: { ...stats },
  };
}

// ============================================================================
// Desenvolvimento Sazonal Direcionado (respeitando potencial como teto real)
// ============================================================================

function aplicarMudancaAtributoSegura(jogador, chave, delta, origem, tetoMaximo = 100) {
  if (!jogador?.atributos || typeof jogador.atributos[chave] !== 'number') {
    return null;
  }
  const antes = jogador.atributos[chave];
  const alvo = Math.round(antes + delta);
  const depois =
    delta >= 0
      ? Math.min(tetoMaximo, Math.max(antes, alvo))
      : Math.max(15, Math.min(antes, alvo));
  const deltaReal = depois - antes;
  if (deltaReal === 0) return null;

  jogador.atributos[chave] = depois;
  if (chave === 'concentracao') {
    if (!jogador.mental) jogador.mental = {};
    jogador.mental.concentracao = depois;
  }

  if (!Array.isArray(jogador.historicoEvolucao)) {
    jogador.historicoEvolucao = [];
  }
  jogador.historicoEvolucao.push({
    origem,
    atributo: chave,
    antes,
    depois,
    delta: deltaReal,
  });
  if (jogador.historicoEvolucao.length > 30) {
    jogador.historicoEvolucao.shift();
  }

  return { atributo: chave, antes, depois, delta: deltaReal };
}

/**
 * Calcula o teto máximo permitido de um atributo respeitando estritamente o potencial individual.
 */
export function calcularTetoEstritoAtributo(jogador, chaveAtributo) {
  const potencial = Math.min(95, Math.round(jogador?.potencial ?? calcularAvaliacaoPosicional(jogador)));
  const posChave = normalizarChavePosicao(jogador);
  const pesos = PESOS_AVALIACAO_POSICIONAL[posChave] || PESOS_AVALIACAO_POSICIONAL.MEI;
  const peso = pesos[chaveAtributo] || 0;

  let reducao = 12;
  if (peso >= 0.18 || chaveAtributo === 'concentracao') {
    reducao = 0;
  } else if (peso >= 0.1) {
    reducao = 3;
  } else if (peso > 0) {
    reducao = 6;
  }

  return Math.max(25, Math.min(potencial, potencial - reducao));
}

/**
 * Aplica evolução sazonal orientada pela faixa etária, potencial, atividade na temporada,
 * curva de desenvolvimento e experiência.
 *
 * Garantias:
 * - Seleciona apenas 1 a 3 atributos elegíveis da posição (NUNCA +1 plano em todos).
 * - Nunca ultrapassa o potencial individual do atleta (nem no atributo nem na avaliação funcional).
 * - Permite estagnação realista (um jovem de potencial alto pode estagnar em certas temporadas).
 * - No auge (26–29), reduz o ganho físico e mantém refinamentos táticos/mentais suaves sem muro brusco.
 */
export function aplicarDesenvolvimentoTemporada(
  jogador,
  rng = Math.random,
  { partidasNaTemporada = null } = {},
) {
  garantirCarreiraJogador(jogador);

  const faixa = obterFaixaCarreira(jogador.idade);
  const potencial = Math.min(95, Math.round(jogador.potencial ?? calcularAvaliacaoPosicional(jogador)));
  const atual = calcularAvaliacaoPosicional(jogador);
  const margemPotencial = Math.max(0, potencial - atual);

  // Ganho de experiência pela temporada concluída (sempre limitado)
  const partidas =
    typeof partidasNaTemporada === 'number'
      ? Math.max(0, partidasNaTemporada)
      : jogador.partidasNaTemporada || 0;
  const ganhoExpTemp =
    partidas > 0
      ? CARREIRA_CONFIG.experienciaPorTemporada * Math.min(1.2, 0.5 + partidas / 8)
      : CARREIRA_CONFIG.experienciaPorTemporada * 0.25;
  jogador.experiencia = Math.min(
    CARREIRA_CONFIG.experienciaMax,
    Math.round((jogador.experiencia + ganhoExpTemp) * 10) / 10,
  );

  // Veteranos em declínio/fim de carreira só podem ter eventual lapidação mental muito rara
  if (faixa.id === 'declinio' || faixa.id === 'fim_carreira') {
    const tetoConc = calcularTetoEstritoAtributo(jogador, 'concentracao');
    const concAtual = jogador.atributos?.concentracao ?? 45;
    if (
      partidas >= 3 &&
      jogador.experiencia >= 65 &&
      concAtual < tetoConc &&
      atual + 0.5 <= potencial &&
      rng() < 0.22
    ) {
      const alt = aplicarMudancaAtributoSegura(
        jogador,
        'concentracao',
        1,
        'experiencia_temporada',
        tetoConc,
      );
      return {
        evoluiu: Boolean(alt),
        estagnou: !alt,
        faixaCarreira: faixa.id,
        alteracoes: alt ? [alt] : [],
      };
    }
    return { evoluiu: false, estagnou: false, faixaCarreira: faixa.id, alteracoes: [] };
  }

  // Já atingiu o teto individual: potencial não pode ser ultrapassado
  if (margemPotencial < 0.5) {
    return { evoluiu: false, estagnou: true, faixaCarreira: faixa.id, alteracoes: [] };
  }

  // Estagnação realista: depende da faixa, atividade (jogou ou ficou encostado) e consistência individual
  const fatorAtividade = partidas >= 6 ? 1.15 : partidas >= 3 ? 1.0 : partidas >= 1 ? 0.78 : 0.45;
  const chanceEstagnar = Math.min(
    0.88,
    Math.max(
      0.08,
      faixa.chanceBaseEstagnacao +
        (partidas === 0 ? 0.26 : partidas < 3 ? 0.1 : -0.05) +
        (1 - jogador.fatorConsistenciaEvolucao) * 0.25,
    ),
  );

  if (rng() < chanceEstagnar) {
    return {
      evoluiu: false,
      estagnou: true,
      faixaCarreira: faixa.id,
      alteracoes: [],
    };
  }

  const posChave = normalizarChavePosicao(jogador);
  const pesos = PESOS_AVALIACAO_POSICIONAL[posChave] || PESOS_AVALIACAO_POSICIONAL.MEI;

  // Lista apenas atributos elegíveis (abaixo do seu teto estrito <= potencial)
  const candidatos = Object.keys(pesos)
    .filter((attr) => {
      // No auge/veterano, prioriza mentais/técnicos/táticos em vez de ganho físico de velocidade
      if ((faixa.id === 'auge' || faixa.id === 'veterano') && attr === 'velocidade') {
        return false;
      }
      const val = jogador.atributos?.[attr] ?? 45;
      const teto = calcularTetoEstritoAtributo(jogador, attr);
      return val < teto;
    })
    .map((attr) => ({
      attr,
      peso: (pesos[attr] || 0.08) + (attr === 'concentracao' && jogador.experiencia >= 45 ? 0.08 : 0),
      teto: calcularTetoEstritoAtributo(jogador, attr),
    }));

  if (candidatos.length === 0) {
    return { evoluiu: false, estagnou: true, faixaCarreira: faixa.id, alteracoes: [] };
  }

  // Quantidade direcionada de atributos a evoluir (1..3 em formação/jovem, 1..2 em desenvolvimento, 1 no auge/veterano)
  let qtdAlvos = 1;
  if (faixa.id === 'formacao' || faixa.id === 'jovem') {
    qtdAlvos = margemPotencial >= 14 ? (rng() < 0.55 ? 3 : 2) : rng() < 0.5 ? 2 : 1;
  } else if (faixa.id === 'desenvolvimento') {
    qtdAlvos = margemPotencial >= 10 && rng() < 0.55 ? 2 : 1;
  } else {
    qtdAlvos = 1;
  }
  qtdAlvos = Math.min(qtdAlvos, candidatos.length);

  // Curva individual influencia o ritmo em faixas jovens vs tardias
  const curvaId = jogador.curvaDesenvolvimento || 'equilibrada';
  let fatorCurva = 1.0;
  if (curvaId === 'precoce') {
    fatorCurva = jogador.idade <= 22 ? 1.2 : jogador.idade >= 26 ? 0.8 : 1.0;
  } else if (curvaId === 'tardia') {
    fatorCurva = jogador.idade <= 20 ? 0.85 : jogador.idade >= 23 && jogador.idade <= 29 ? 1.2 : 1.0;
  }

  const alteracoes = [];
  const pool = [...candidatos];

  for (let i = 0; i < qtdAlvos && pool.length > 0; i += 1) {
    const somaPesos = pool.reduce((acc, item) => acc + item.peso, 0);
    let roleta = rng() * somaPesos;
    let escolhidoIdx = 0;
    for (let k = 0; k < pool.length; k += 1) {
      roleta -= pool[k].peso;
      if (roleta <= 0) {
        escolhidoIdx = k;
        break;
      }
    }
    const escolhido = pool.splice(escolhidoIdx, 1)[0];
    const valorAtual = jogador.atributos[escolhido.attr];
    const gapAttr = Math.max(0, escolhido.teto - valorAtual);
    if (gapAttr <= 0) continue;

    // Retorno decrescente: maior salto longe do teto, +1 perto do teto ou no auge
    let ganhoBase = 1;
    if (faixa.id === 'formacao' || faixa.id === 'jovem') {
      ganhoBase = gapAttr >= 18 ? 2.6 : gapAttr >= 10 ? 1.8 : 1.1;
    } else if (faixa.id === 'desenvolvimento') {
      ganhoBase = gapAttr >= 14 ? 1.8 : 1.1;
    } else {
      ganhoBase = 1.0;
    }

    let ganho = Math.max(
      1,
      Math.min(
        3,
        gapAttr,
        Math.round(ganhoBase * faixa.fatorEvolucaoTemporada * fatorAtividade * fatorCurva),
      ),
    );

    // Garantia estrita: nunca permitir que a avaliação funcional ultrapasse o potencial
    while (ganho > 0) {
      const backup = jogador.atributos[escolhido.attr];
      jogador.atributos[escolhido.attr] = Math.min(escolhido.teto, backup + ganho);
      const novaAval = calcularAvaliacaoPosicional(jogador);
      jogador.atributos[escolhido.attr] = backup;
      if (novaAval <= potencial) break;
      ganho -= 1;
    }

    if (ganho <= 0) continue;

    const alt = aplicarMudancaAtributoSegura(
      jogador,
      escolhido.attr,
      ganho,
      'temporada',
      escolhido.teto,
    );
    if (alt) alteracoes.push(alt);
  }

  return {
    evoluiu: alteracoes.length > 0,
    estagnou: alteracoes.length === 0,
    faixaCarreira: faixa.id,
    alteracoes,
  };
}

// ============================================================================
// Declínio Gradual Individualizado (físico primeiro, técnico/mental resistente)
// ============================================================================

/**
 * Calcula a idade individual em que o jogador começa a sentir declínio físico,
 * influenciada por longevidade oculta e posição (goleiros duram mais).
 */
export function calcularIdadeInicioDeclinio(jogador) {
  garantirCarreiraJogador(jogador);
  const desvioLongevidade = (jogador.longevidade - 1.0) * 8; // aprox -1.9 a +2.2 anos
  const bonusGoleiro = jogador.ehGoleiro ? 2.5 : 0;
  return Math.round((31 + desvioLongevidade + bonusGoleiro) * 10) / 10;
}

/**
 * Aplica declínio gradual de fim de temporada respeitando a longevidade individual:
 * - Começa a agir ao redor dos 30–32+ anos (varia por atleta).
 * - Físicos (velocidade) caem primeiro e com maior intensidade.
 * - Físicos secundários (dibre, desarme) só caem mais tarde e suavemente.
 * - Mentais (concentracao) e técnicos/táticos (passe, dominio, posicionamento, tecnica,
 *   interceptacao) são altamente resistentes, permitindo veteranos muito úteis.
 */
export function aplicarDeclinioTemporada(jogador, rng = Math.random) {
  garantirCarreiraJogador(jogador);

  const idadeInicio = calcularIdadeInicioDeclinio(jogador);
  const anosEmDeclinio = jogador.idade - idadeInicio;
  if (anosEmDeclinio < 0) {
    return { declinou: false, idadeInicioDeclinio: idadeInicio, alteracoes: [] };
  }

  const alteracoes = [];
  // Intensidade cresce suavemente com os anos além do início individual e diminui com longevidade
  const fatorRitmo = Math.max(0.6, Math.min(1.45, 1 / jogador.longevidade));

  // 1) Físico principal: Velocidade (primeiro a cair e maior impacto)
  if (typeof jogador.atributos?.velocidade === 'number') {
    const chanceVel = Math.min(0.95, 0.45 + anosEmDeclinio * 0.14);
    if (rng() < chanceVel) {
      const quedaBase =
        anosEmDeclinio >= 5
          ? 2 + (rng() < 0.6 ? 1 : 0)
          : anosEmDeclinio >= 2
            ? 1 + (rng() < 0.55 ? 1 : 0)
            : 1;
      const quedaVel = Math.max(1, Math.min(4, Math.round(quedaBase * fatorRitmo)));
      const alt = aplicarMudancaAtributoSegura(
        jogador,
        'velocidade',
        -quedaVel,
        'declinio_fisico',
      );
      if (alt) alteracoes.push(alt);
    }
  }

  // 2) Físicos secundários / explosão (dibre, desarme): apenas a partir de 2+ anos de declínio
  if (!jogador.ehGoleiro && anosEmDeclinio >= 2) {
    for (const attr of CARREIRA_CONFIG.atributosFisicosSecundarios) {
      if (typeof jogador.atributos?.[attr] !== 'number') continue;
      const chanceSec = Math.min(0.65, 0.15 + (anosEmDeclinio - 2) * 0.1);
      if (rng() < chanceSec) {
        const queda = anosEmDeclinio >= 6 && rng() < 0.35 ? 2 : 1;
        const alt = aplicarMudancaAtributoSegura(jogador, attr, -queda, 'declinio_fisico');
        if (alt) alteracoes.push(alt);
      }
    }
  }

  // 3) Técnicos / táticos: altamente resistentes (só têm pequena chance de -1 bem tarde, 4.5+ anos de declínio)
  if (anosEmDeclinio >= 4.5) {
    const poolTec = jogador.ehGoleiro
      ? ['defesa']
      : ['marcacao', 'finalizacao', 'dominio'];
    const chanceTec = Math.min(0.45, 0.1 + (anosEmDeclinio - 4.5) * 0.08);
    if (rng() < chanceTec) {
      const escolhido = poolTec[Math.floor(rng() * poolTec.length)];
      const alt = aplicarMudancaAtributoSegura(jogador, escolhido, -1, 'declinio_tardio');
      if (alt) alteracoes.push(alt);
    }
  }

  // 4) Mental (Concentração): extremamente resistente — pode inclusive ganhar +1 pela experiência
  //    se o jogador ainda estiver abaixo do potencial e com alta experiência
  if (anosEmDeclinio <= 5 && jogador.experiencia >= 75) {
    const tetoConc = calcularTetoEstritoAtributo(jogador, 'concentracao');
    const concAtual = jogador.atributos?.concentracao ?? 50;
    const avalAtual = calcularAvaliacaoPosicional(jogador);
    const potencial = Math.min(95, Math.round(jogador.potencial ?? avalAtual));
    if (concAtual < tetoConc && avalAtual + 0.5 <= potencial && rng() < 0.2) {
      const alt = aplicarMudancaAtributoSegura(
        jogador,
        'concentracao',
        1,
        'experiencia_veterano',
        tetoConc,
      );
      if (alt) alteracoes.push(alt);
    }
  }

  return {
    declinou: alteracoes.some((a) => a.delta < 0),
    idadeInicioDeclinio: idadeInicio,
    alteracoes,
  };
}

// ============================================================================
// Aposentadoria Progressiva & Histórico Permanente (Hall da Fama)
// ============================================================================

/**
 * Calcula a probabilidade configurável (0..1) de aposentadoria ao fim de uma temporada.
 * - Não é automática aos 36 anos.
 * - Cresce progressivamente com a idade (36–37 baixa, 38–39 moderada, 40+ alta).
 * - Modulada pela longevidade individual, função (goleiros duram mais) e relevância técnica.
 */
export function calcularProbabilidadeAposentadoria(jogador) {
  garantirCarreiraJogador(jogador);

  const idade = jogador.idade;
  if (idade < CARREIRA_CONFIG.idadeMinimaAvaliacaoAposentadoria) {
    return 0;
  }
  if (idade >= IDADE_MAXIMA_JOGADOR) {
    return 1;
  }

  // Ajuste de idade efetiva por longevidade e goleiro
  const ajusteLongevidade = (jogador.longevidade - 1.0) * 4.5; // -1.1 a +1.3 anos
  const ajusteGoleiro = jogador.ehGoleiro ? 2.0 : 0;
  const aval = calcularAvaliacaoPosicional(jogador);
  // Jogadores ainda muito relevantes (acima de 60) seguram a aposentadoria um pouco mais;
  // jogadores muito desgastados (< 42) têm tendência um pouco maior.
  const ajusteNivel = aval >= 62 ? 0.8 : aval <= 42 ? -0.7 : 0;

  const idadeEfetiva = idade - ajusteLongevidade - ajusteGoleiro - ajusteNivel;
  if (idadeEfetiva < CARREIRA_CONFIG.idadeMinimaAvaliacaoAposentadoria) {
    return 0;
  }

  const tabela = CARREIRA_CONFIG.probabilidadeAposentadoriaBase;
  const piso = Math.floor(idadeEfetiva);
  const teto = Math.ceil(idadeEfetiva);
  const frac = idadeEfetiva - piso;

  const pPiso = tabela[Math.min(45, Math.max(35, piso))] ?? (piso >= 45 ? 1 : 0);
  const pTeto = tabela[Math.min(45, Math.max(35, teto))] ?? (teto >= 45 ? 1 : 0);
  const prob = pPiso + (pTeto - pPiso) * frac;

  return Math.max(0, Math.min(1, Math.round(prob * 1000) / 1000));
}

/**
 * Avalia se o jogador se aposenta nesta virada de temporada.
 */
export function avaliarAposentadoriaJogador(jogador, rng = Math.random) {
  const probabilidade = calcularProbabilidadeAposentadoria(jogador);
  if (probabilidade <= 0) {
    return { aposentou: false, probabilidade: 0 };
  }
  const rolagem = rng();
  const aposentou = rolagem < probabilidade;
  return {
    aposentou,
    probabilidade,
    rolagem,
  };
}

/**
 * Cria um registro imutável de aposentadoria pronto para Hall da Fama e estatísticas históricas.
 */
export function criarRegistroAposentadoria(
  jogador,
  { clube = 'Atlético Brisa', temporada = 1 } = {},
) {
  garantirCarreiraJogador(jogador);
  const stats = jogador.estatisticasCarreira || {};
  return {
    id: jogador.id,
    nome: jogador.nome,
    nomeCurto: jogador.nomeCurto || jogador.nome,
    idadeAposentadoria: jogador.idade,
    clube,
    posicao: jogador.posicao,
    setor: jogador.setor || null,
    atributosFinais: structuredClone(jogador.atributos || {}),
    avaliacaoFinal: calcularAvaliacaoPosicional(jogador),
    partidas: stats.partidas || 0,
    gols: stats.gols || 0,
    assistencias: stats.assistencias || 0,
    titulos: stats.titulos || 0,
    experienciaFinal: jogador.experiencia || 0,
    temporadaAposentadoria: temporada,
    habilidades: (jogador.extras?.habilidades || []).map((h) =>
      typeof h === 'string' ? h : h.nome || h.id,
    ),
  };
}
