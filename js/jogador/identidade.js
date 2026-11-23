/**
 * Identidade individual do jogador, avaliação posicional ponderada,
 * familiaridade posicional granular, pé dominante e camada mental (Concentração + extensível).
 *
 * Totalmente retrocompatível: jogadores antigos sem esses campos recebem defaults
 * determinísticos e coerentes sem quebrar saves, testes ou sistemas existentes.
 */

import { obterCorredor, obterFaixa } from '../dados/zonas.js';

// ============================================================================
// Constantes e Tabelas de Referência (calibráveis em um único lugar)
// ============================================================================

export const PES_DOMINANTES = Object.freeze({
  DIREITO: 'direito',
  ESQUERDO: 'esquerdo',
  AMBIDESTRO: 'ambidestro',
});

export const ROTULOS_PE_DOMINANTE = Object.freeze({
  direito: 'Destro',
  esquerdo: 'Canhoto',
  ambidestro: 'Ambidestro',
});

/**
 * Níveis de familiaridade posicional (substitui penalidade fixa única de -8%).
 * Mantém uma penalidade suave em posições próximas e mais sentida fora de setor.
 */
export const NIVEIS_FAMILIARIDADE = Object.freeze({
  natural: Object.freeze({
    id: 'natural',
    rotulo: 'Natural',
    fatorAtributo: 1.0,
    nivelMin: 90,
  }),
  adaptado: Object.freeze({
    id: 'adaptado',
    rotulo: 'Adaptado',
    fatorAtributo: 0.96,
    nivelMin: 72,
  }),
  improvisado_leve: Object.freeze({
    id: 'improvisado_leve',
    rotulo: 'Improvisado',
    fatorAtributo: 0.91,
    nivelMin: 52,
  }),
  improvisado_forte: Object.freeze({
    id: 'improvisado_forte',
    rotulo: 'Fora de função',
    fatorAtributo: 0.85,
    nivelMin: 30,
  }),
  fora_setor: Object.freeze({
    id: 'fora_setor',
    rotulo: 'Deslocado',
    fatorAtributo: 0.78,
    nivelMin: 0,
  }),
});

/**
 * Pesos funcionais por posição/setor para avaliação posicional (Overall funcional).
 * Evita que um volante marcador seja penalizado por finalização baixa ou um ponta
 * veloz seja derrubado por marcação/desarme baixos.
 */
export const PESOS_AVALIACAO_POSICIONAL = Object.freeze({
  GOL: Object.freeze({
    defesa: 0.44,
    posicionamento: 0.24,
    concentracao: 0.14,
    passe: 0.1,
    dominio: 0.08,
  }),
  ZAG: Object.freeze({
    marcacao: 0.24,
    desarme: 0.22,
    posicionamento: 0.18,
    interceptacao: 0.14,
    concentracao: 0.1,
    passe: 0.06,
    velocidade: 0.06,
  }),
  LAT: Object.freeze({
    velocidade: 0.18,
    marcacao: 0.16,
    desarme: 0.14,
    passe: 0.14,
    posicionamento: 0.12,
    interceptacao: 0.1,
    dominio: 0.08,
    concentracao: 0.08,
  }),
  VOL: Object.freeze({
    desarme: 0.19,
    interceptacao: 0.18,
    marcacao: 0.16,
    posicionamento: 0.15,
    passe: 0.14,
    concentracao: 0.1,
    dominio: 0.08,
  }),
  MEI: Object.freeze({
    passe: 0.23,
    dominio: 0.18,
    tecnica: 0.15,
    posicionamento: 0.13,
    concentracao: 0.1,
    dibre: 0.09,
    velocidade: 0.06,
    interceptacao: 0.06,
  }),
  PONTA: Object.freeze({
    velocidade: 0.22,
    dibre: 0.2,
    tecnica: 0.15,
    dominio: 0.13,
    passe: 0.11,
    finalizacao: 0.11,
    concentracao: 0.08,
  }),
  CA: Object.freeze({
    finalizacao: 0.3,
    posicionamento: 0.2,
    dominio: 0.15,
    tecnica: 0.11,
    velocidade: 0.09,
    concentracao: 0.09,
    dibre: 0.06,
  }),
});

/**
 * Mapa de afinidade tática entre posição natural do atleta e papel ocupado na formação (0..100).
 */
const MATRIZ_AFINIDADE_POSICAO = Object.freeze({
  GOL: Object.freeze({ GOL: 100 }),
  ZAG: Object.freeze({
    ZAG1: 100,
    ZAG2: 100,
    ZAG3: 100,
    VOL: 76,
    VOL1: 76,
    VOL2: 76,
    LAT_E: 68,
    LAT_D: 68,
    ALA_E: 56,
    ALA_D: 56,
    MEI_E: 46,
    MEI_C: 48,
    MEI_D: 46,
    PONTA_E: 30,
    PONTA_D: 30,
    CA: 34,
    ATA1: 32,
    ATA2: 32,
    ATA_E: 32,
    ATA_D: 32,
  }),
  LAT: Object.freeze({
    LAT_E: 100,
    LAT_D: 100,
    ALA_E: 100,
    ALA_D: 100,
    ZAG1: 72,
    ZAG2: 72,
    ZAG3: 72,
    VOL: 74,
    VOL1: 74,
    VOL2: 74,
    MEI_E: 78,
    MEI_D: 78,
    MEI_C: 62,
    PONTA_E: 74,
    PONTA_D: 74,
    CA: 40,
    ATA1: 48,
    ATA2: 48,
    ATA_E: 48,
    ATA_D: 48,
  }),
  VOL: Object.freeze({
    VOL: 100,
    VOL1: 100,
    VOL2: 100,
    MEI_C: 84,
    MEI_E: 78,
    MEI_D: 78,
    ZAG1: 78,
    ZAG2: 78,
    ZAG3: 78,
    LAT_E: 68,
    LAT_D: 68,
    ALA_E: 66,
    ALA_D: 66,
    PONTA_E: 50,
    PONTA_D: 50,
    CA: 46,
    ATA1: 48,
    ATA2: 48,
    ATA_E: 48,
    ATA_D: 48,
  }),
  MEI: Object.freeze({
    MEI_E: 100,
    MEI_C: 100,
    MEI_D: 100,
    VOL: 80,
    VOL1: 80,
    VOL2: 80,
    PONTA_E: 82,
    PONTA_D: 82,
    ATA1: 70,
    ATA2: 70,
    ATA_E: 70,
    ATA_D: 70,
    CA: 66,
    LAT_E: 64,
    LAT_D: 64,
    ALA_E: 70,
    ALA_D: 70,
    ZAG1: 42,
    ZAG2: 42,
    ZAG3: 42,
  }),
  PONTA: Object.freeze({
    PONTA_E: 100,
    PONTA_D: 100,
    ATA1: 94,
    ATA2: 94,
    ATA_E: 94,
    ATA_D: 94,
    MEI_E: 82,
    MEI_D: 82,
    CA: 78,
    MEI_C: 72,
    LAT_E: 64,
    LAT_D: 64,
    ALA_E: 72,
    ALA_D: 72,
    VOL: 44,
    VOL1: 44,
    VOL2: 44,
    ZAG1: 28,
    ZAG2: 28,
    ZAG3: 28,
  }),
  CA: Object.freeze({
    CA: 100,
    ATA1: 96,
    ATA2: 96,
    ATA_E: 96,
    ATA_D: 96,
    PONTA_E: 76,
    PONTA_D: 76,
    MEI_C: 68,
    MEI_E: 60,
    MEI_D: 60,
    VOL: 38,
    VOL1: 38,
    VOL2: 38,
    LAT_E: 34,
    LAT_D: 34,
    ALA_E: 34,
    ALA_D: 34,
    ZAG1: 26,
    ZAG2: 26,
    ZAG3: 26,
  }),
});

export const CONCENTRACAO_CONFIG = Object.freeze({
  referencia: 50,
  // Bônus/penalidade sutil de estabilidade contextual (nunca um +10% fixo)
  pesoPressaoAlta: 0.14,
  pesoFadigaTardia: 0.16,
  pesoMomentoCritico: 0.12,
  pesoDominioSobPressao: 0.11,
  pesoReacaoDefensiva: 0.08,
  limiteAjusteMin: -6,
  limiteAjusteMax: 6,
});

export const PE_DOMINANTE_CONFIG = Object.freeze({
  // Penalidade máxima de pé fraco (qualidade 1/5) em contexto desfavorável: -4.5 pts
  // Bônus máximo quando alinhado perfeitamente com o pé dominante: +2.0 pts
  bonusPeNatural: 1.8,
  penalidadeMaxPeFraco: 4.5,
});

// ============================================================================
// Helpers determinísticos para retrocompatibilidade
// ============================================================================

function hashTextoDeterministico(texto) {
  let h = 2166136261 >>> 0;
  const str = String(texto || 'jogador');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function normalizarChavePosicao(jogador) {
  if (!jogador) return 'MEI';
  if (jogador.ehGoleiro) return 'GOL';
  const pos = String(jogador.posicao || '').toUpperCase().trim();
  if (pos === 'GOL') return 'GOL';
  if (pos === 'ZAG') return 'ZAG';
  if (pos === 'LAT' || pos === 'ALA' || pos === 'LE' || pos === 'LD') return 'LAT';
  if (pos === 'VOL') return 'VOL';
  if (pos === 'MEI' || pos === 'ME' || pos === 'MD') return 'MEI';
  if (pos === 'PONTA' || pos === 'PE' || pos === 'PD') return 'PONTA';
  if (pos === 'CA' || pos === 'ATA') return 'CA';

  const papel = String(jogador.papel || '').toUpperCase();
  if (papel.startsWith('ZAG')) return 'ZAG';
  if (papel.startsWith('LAT') || papel.startsWith('ALA')) return 'LAT';
  if (papel.startsWith('VOL')) return 'VOL';
  if (papel.startsWith('MEI')) return 'MEI';
  if (papel.startsWith('PONTA')) return 'PONTA';
  if (papel === 'CA' || papel.startsWith('ATA')) return 'CA';
  return 'MEI';
}

export function deduzirPeDominantePadrao(jogador) {
  const pos = String(jogador?.posicao || '').toUpperCase();
  const papel = String(jogador?.papel || '').toUpperCase();
  const h = hashTextoDeterministico(`${jogador?.id || ''}|${jogador?.nome || ''}`);
  if (pos === 'LE' || papel === 'LAT_E' || papel === 'ALA_E') return 'esquerdo';
  if (pos === 'LD' || papel === 'LAT_D' || papel === 'ALA_D') return 'direito';
  if (pos === 'PE' || papel === 'PONTA_E') return h % 10 < 7 ? 'direito' : 'esquerdo';
  if (pos === 'PD' || papel === 'PONTA_D') return h % 10 < 5 ? 'esquerdo' : 'direito';
  if (h % 14 === 0) return 'ambidestro';
  if (h % 4 === 0) return 'esquerdo';
  return 'direito';
}

export function deduzirQualidadePeFracoPadrao(jogador, peDominante) {
  if (peDominante === 'ambidestro') return 5;
  const h = hashTextoDeterministico(`pf|${jogador?.id || ''}|${jogador?.nome || ''}`);
  const tec = jogador?.atributos?.tecnica ?? 45;
  const base = tec >= 62 ? 3 : 2;
  return Math.max(1, Math.min(5, base + (h % 3) - 1));
}

export function deduzirConcentracaoPadrao(jogador) {
  const a = jogador?.atributos || {};
  const pos = a.posicionamento ?? 45;
  const dom = a.dominio ?? 45;
  const intc = a.interceptacao ?? 45;
  const h = hashTextoDeterministico(`conc|${jogador?.id || ''}|${jogador?.nome || ''}`);
  const variacao = (h % 11) - 5; // -5..+5
  const base = jogador?.ehGoleiro
    ? Math.round((a.defesa ?? 48) * 0.45 + pos * 0.55)
    : Math.round(pos * 0.45 + dom * 0.3 + intc * 0.25);
  return Math.max(20, Math.min(92, base + variacao));
}

export function deduzirIdadePadrao(jogador) {
  if (
    typeof jogador?.idade === 'number' &&
    Number.isFinite(jogador.idade) &&
    jogador.idade > 0
  ) {
    return Math.max(16, Math.min(45, Math.round(jogador.idade)));
  }
  if (jogador?.ehJovem) return 18;
  const h = hashTextoDeterministico(`idade|${jogador?.id || ''}|${jogador?.nome || ''}`);
  return 20 + (h % 12); // 20..31
}

/**
 * Monta um mapa inicial de familiaridade posicional (0..100 por papel/chave)
 * coerente com a posição primária e lado natural do atleta.
 */
export function criarFamiliaridadePadrao(jogador) {
  const posChave = normalizarChavePosicao(jogador);
  const matriz = MATRIZ_AFINIDADE_POSICAO[posChave] || MATRIZ_AFINIDADE_POSICAO.MEI;
  const mapa = { ...matriz };

  const pos = String(jogador?.posicao || '').toUpperCase();
  const papel = String(jogador?.papel || '').toUpperCase();
  if (pos === 'LE' || papel === 'LAT_E' || papel === 'ALA_E') {
    mapa.LAT_E = 100;
    mapa.ALA_E = 100;
    mapa.LAT_D = Math.min(mapa.LAT_D ?? 82, 82);
    mapa.ALA_D = Math.min(mapa.ALA_D ?? 80, 80);
  } else if (pos === 'LD' || papel === 'LAT_D' || papel === 'ALA_D') {
    mapa.LAT_D = 100;
    mapa.ALA_D = 100;
    mapa.LAT_E = Math.min(mapa.LAT_E ?? 82, 82);
    mapa.ALA_E = Math.min(mapa.ALA_E ?? 80, 80);
  } else if (pos === 'ME') {
    mapa.MEI_E = 100;
    mapa.MEI_C = 96;
    mapa.MEI_D = 84;
  } else if (pos === 'MD') {
    mapa.MEI_D = 100;
    mapa.MEI_C = 96;
    mapa.MEI_E = 84;
  } else if (pos === 'PE' || papel === 'PONTA_E') {
    mapa.PONTA_E = 100;
    mapa.PONTA_D = Math.min(mapa.PONTA_D ?? 84, 84);
  } else if (pos === 'PD' || papel === 'PONTA_D') {
    mapa.PONTA_D = 100;
    mapa.PONTA_E = Math.min(mapa.PONTA_E ?? 84, 84);
  }
  return mapa;
}

/**
 * Garante que um jogador (inclusive saves antigos ou objetos mínimos de testes)
 * possua toda a estrutura de identidade preenchida de maneira determinística e segura.
 */
export function garantirIdentidadeJogador(jogador) {
  if (!jogador || typeof jogador !== 'object') return jogador;

  if (!jogador.atributos || typeof jogador.atributos !== 'object') {
    jogador.atributos = {};
  }

  // Garante dibre caso objeto legado só tenha técnica
  if (typeof jogador.atributos.dibre !== 'number') {
    jogador.atributos.dibre = jogador.atributos.tecnica ?? 45;
  }

  // Camada mental: começa com Concentração, mas já estruturada para futuros atributos mentais
  const concentracaoInicial =
    typeof jogador.atributos.concentracao === 'number'
      ? jogador.atributos.concentracao
      : typeof jogador.mental?.concentracao === 'number'
        ? jogador.mental.concentracao
        : deduzirConcentracaoPadrao(jogador);

  const concLimpa = Math.max(15, Math.min(100, Math.round(concentracaoInicial)));
  jogador.atributos.concentracao = concLimpa;
  jogador.mental = {
    ...(jogador.mental || {}),
    concentracao: concLimpa,
    // Ganchos opcionais prontos para futuras expansões sem refatoração:
    decisao: jogador.mental?.decisao ?? null,
    compostura: jogador.mental?.compostura ?? null,
    inteligenciaTatica: jogador.mental?.inteligenciaTatica ?? null,
    consistencia: jogador.mental?.consistencia ?? null,
    profissionalismo: jogador.mental?.profissionalismo ?? null,
  };

  // Pé dominante + qualidade do pé fraco (1..5)
  const peValido = Object.values(PES_DOMINANTES).includes(jogador.peDominante);
  jogador.peDominante = peValido
    ? jogador.peDominante
    : deduzirPeDominantePadrao(jogador);

  const pfValido =
    typeof jogador.qualidadePeFraco === 'number' &&
    Number.isFinite(jogador.qualidadePeFraco);
  jogador.qualidadePeFraco = pfValido
    ? Math.max(1, Math.min(5, Math.round(jogador.qualidadePeFraco)))
    : deduzirQualidadePeFracoPadrao(jogador, jogador.peDominante);

  if (jogador.peDominante === 'ambidestro') {
    jogador.qualidadePeFraco = 5;
  }

  // Idade e perfil individual
  jogador.idade = deduzirIdadePadrao(jogador);
  if (!jogador.posicaoPrimaria) {
    jogador.posicaoPrimaria = normalizarChavePosicao(jogador);
  }

  // Familiaridade posicional granular
  if (!jogador.familiaridade || typeof jogador.familiaridade !== 'object') {
    jogador.familiaridade = criarFamiliaridadePadrao(jogador);
  }

  // Condição física / histórico
  if (!jogador.extras || typeof jogador.extras !== 'object') {
    jogador.extras = {
      estamina: 100,
      cartoes: { amarelos: 0, vermelho: false },
      habilidades: [],
    };
  }
  if (!Array.isArray(jogador.caracteristicas)) {
    jogador.caracteristicas = [];
  }
  if (!Array.isArray(jogador.historicoEvolucao)) {
    jogador.historicoEvolucao = [];
  }

  return jogador;
}

// ============================================================================
// Avaliação Posicional Funcional (substitui média simples injusta)
// ============================================================================

/**
 * Calcula a avaliação funcional (0..100) do jogador considerando os atributos
 * realmente importantes para a posição dele (ou papel informado).
 */
export function calcularAvaliacaoPosicional(jogador, papelOpcional = null) {
  if (!jogador || !jogador.atributos) return 45;
  const posChave = papelOpcional
    ? normalizarChavePosicao({ ehGoleiro: papelOpcional === 'GOL', papel: papelOpcional })
    : normalizarChavePosicao(jogador);
  const pesos = PESOS_AVALIACAO_POSICIONAL[posChave] || PESOS_AVALIACAO_POSICIONAL.MEI;
  const a = jogador.atributos;

  let soma = 0;
  let pesoTotal = 0;
  for (const [attr, peso] of Object.entries(pesos)) {
    let valor = a[attr];
    if (typeof valor !== 'number') {
      if (attr === 'concentracao') {
        valor = jogador.mental?.concentracao ?? deduzirConcentracaoPadrao(jogador);
      } else if (attr === 'dibre') {
        valor = a.tecnica ?? 45;
      } else {
        valor = 45;
      }
    }
    soma += valor * peso;
    pesoTotal += peso;
  }

  if (pesoTotal <= 0) return 45;
  return Math.round((soma / pesoTotal) * 10) / 10;
}

// ============================================================================
// Familiaridade Posicional Granular
// ============================================================================

/**
 * Avalia o nível de familiaridade (0..100) e o multiplicador efetivo de atributo
 * do jogador atuando no papel atual (ou informado).
 */
export function avaliarFamiliaridadePosicao(jogador, papelAlvo = null) {
  if (!jogador) {
    return {
      nota: 100,
      ...NIVEIS_FAMILIARIDADE.natural,
      foraDePosicao: false,
    };
  }

  const papel = papelAlvo || jogador.papel;
  if (!papel) {
    return {
      nota: 100,
      ...NIVEIS_FAMILIARIDADE.natural,
      foraDePosicao: false,
    };
  }

  if (jogador.ehGoleiro) {
    const ehGol = papel === 'GOL';
    const nivel = ehGol ? NIVEIS_FAMILIARIDADE.natural : NIVEIS_FAMILIARIDADE.fora_setor;
    return {
      nota: ehGol ? 100 : 15,
      ...nivel,
      foraDePosicao: !ehGol,
    };
  }

  if (papel === 'GOL') {
    return {
      nota: 15,
      ...NIVEIS_FAMILIARIDADE.fora_setor,
      foraDePosicao: true,
    };
  }

  // Se objeto legado tem apenas `foraDePosicao = true` sem papel explícito mapeado
  const posChave = normalizarChavePosicao(jogador);
  const tabelaBase = MATRIZ_AFINIDADE_POSICAO[posChave] || MATRIZ_AFINIDADE_POSICAO.MEI;
  let nota =
    typeof jogador.familiaridade?.[papel] === 'number'
      ? jogador.familiaridade[papel]
      : tabelaBase[papel] ?? 50;

  // Ajuste fino para lado trocado (ex.: destro jogando na ala esquerda de lateral/ponta)
  if (
    (papel === 'LAT_E' || papel === 'LAT_D') &&
    posChave === 'LAT' &&
    jogador.familiaridade?.[papel] === undefined
  ) {
    const pe = jogador.peDominante || deduzirPeDominantePadrao(jogador);
    if ((papel === 'LAT_E' && pe === 'direito') || (papel === 'LAT_D' && pe === 'esquerdo')) {
      nota = Math.min(nota, 84);
    }
  }

  nota = Math.max(0, Math.min(100, Math.round(nota)));

  let nivel = NIVEIS_FAMILIARIDADE.fora_setor;
  if (nota >= NIVEIS_FAMILIARIDADE.natural.nivelMin) {
    nivel = NIVEIS_FAMILIARIDADE.natural;
  } else if (nota >= NIVEIS_FAMILIARIDADE.adaptado.nivelMin) {
    nivel = NIVEIS_FAMILIARIDADE.adaptado;
  } else if (nota >= NIVEIS_FAMILIARIDADE.improvisado_leve.nivelMin) {
    nivel = NIVEIS_FAMILIARIDADE.improvisado_leve;
  } else if (nota >= NIVEIS_FAMILIARIDADE.improvisado_forte.nivelMin) {
    nivel = NIVEIS_FAMILIARIDADE.improvisado_forte;
  }

  return {
    nota,
    ...nivel,
    foraDePosicao: nivel.id !== 'natural',
  };
}

/**
 * Retorna apenas o multiplicador numérico (0.78..1.00) de familiaridade posicional.
 * Respeita retrocompatibilidade quando um objeto mínimo define apenas `foraDePosicao: true` sem `papel`.
 */
export function obterFatorFamiliaridadePosicao(jogador, papelAlvo = null) {
  if (!jogador) return 1;
  const papel = papelAlvo || jogador.papel;
  if (!papel) {
    return jogador.foraDePosicao ? 0.92 : 1;
  }
  return avaliarFamiliaridadePosicao(jogador, papel).fatorAtributo;
}

// ============================================================================
// Pé Dominante & Qualidade do Pé Fraco em Contexto de Jogo
// ============================================================================

/**
 * Avalia o impacto contextual do pé dominante em passes, cruzamentos e finalizações.
 * O efeito é sutil e realista (nunca quebra um lance sozinho, mas favorece quem está no lado certo
 * e exige mais técnica/pé fraco em ângulos trocados).
 */
export function avaliarContextoPeDominante({
  jogador,
  acao,
  zonaOrigem,
  zonaDestino = null,
  timeId = 'meuTime',
  pressaoOrigem = 0,
}) {
  if (!jogador || !zonaOrigem) {
    return {
      ajusteChance: 0,
      peUsado: 'natural',
      rotuloAjuste: null,
      detalhe: 'Neutro',
    };
  }

  const pe = jogador.peDominante || deduzirPeDominantePadrao(jogador);
  const qualidadePF =
    typeof jogador.qualidadePeFraco === 'number'
      ? Math.max(1, Math.min(5, jogador.qualidadePeFraco))
      : deduzirQualidadePeFracoPadrao(jogador, pe);

  if (pe === 'ambidestro') {
    const bonusAmbi = acao === 'finalizar' || acao === 'cruzar' ? 1.5 : 0.8;
    return {
      ajusteChance: Math.round(bonusAmbi * 10) / 10,
      peUsado: 'ambidestro',
      rotuloAjuste: 'Ambidestro',
      detalhe: 'Confortável com os dois pés',
    };
  }

  const corrOrig = obterCorredor(zonaOrigem, timeId);
  const corrDest = zonaDestino ? obterCorredor(zonaDestino, timeId) : corrOrig;
  const faixaOrig = obterFaixa(zonaOrigem, timeId);
  const faixaDest = zonaDestino ? obterFaixa(zonaDestino, timeId) : faixaOrig;

  // Penalidade proporcional ao pé fraco: qualidade 1 => 100%, 2 => 75%, 3 => 50%, 4 => 25%, 5 => 0%
  const fatorPenalidadePF = (5 - qualidadePF) / 4;
  const maxPen = PE_DOMINANTE_CONFIG.penalidadeMaxPeFraco;
  const bonusNat = PE_DOMINANTE_CONFIG.bonusPeNatural;

  // 1) Cruzamento da linha de fundo ou ala: pé do mesmo lado do corredor facilita cruzar aberto
  if (acao === 'cruzar') {
    const ladoFavoravel =
      (corrOrig === 'D' && pe === 'direito') ||
      (corrOrig === 'E' && pe === 'esquerdo');
    if (ladoFavoravel) {
      return {
        ajusteChance: bonusNat,
        peUsado: 'dominante',
        rotuloAjuste: 'Cruzamento no pé natural',
        detalhe: `${ROTULOS_PE_DOMINANTE[pe]} cruzando pelo corredor natural`,
      };
    }
    const pen = -(maxPen * fatorPenalidadePF * 0.85);
    return {
      ajusteChance: Math.round(pen * 10) / 10,
      peUsado: 'fraco',
      rotuloAjuste: pen <= -1 ? 'Cruzamento no pé trocado' : null,
      detalhe: `Cruzamento com pé fraco (${qualidadePF}/5)`,
    };
  }

  // 2) Finalização em ângulo diagonal (Z5-E ou Z5-D):
  // Ponta invertido (destro em Z5-E / canhoto em Z5-D) consegue chapar colocado no canto oposto (+1.5);
  // Pé natural no corredor aberto chuta cruzado sem penalidade.
  if (acao === 'finalizar') {
    if (corrOrig === 'E' || corrOrig === 'D') {
      const invertidoParaDentro =
        (corrOrig === 'E' && pe === 'direito') ||
        (corrOrig === 'D' && pe === 'esquerdo');
      if (invertidoParaDentro) {
        return {
          ajusteChance: 1.5,
          peUsado: 'dominante',
          rotuloAjuste: 'Ângulo favorável ao pé dominante',
          detalhe: 'Cortou para o pé bom em diagonal',
        };
      }
      // Chute fechado no corredor natural depende um pouco de ângulo/pé fraco se pressionado
      if (pressaoOrigem >= 45 && qualidadePF <= 2) {
        const pen = -(maxPen * fatorPenalidadePF * 0.55);
        return {
          ajusteChance: Math.round(pen * 10) / 10,
          peUsado: 'fraco',
          rotuloAjuste: pen <= -1 ? 'Ângulo fechado (pé fraco)' : null,
          detalhe: `Pressionado no ângulo do pé fraco (${qualidadePF}/5)`,
        };
      }
    }
    return {
      ajusteChance: 0,
      peUsado: 'dominante',
      rotuloAjuste: null,
      detalhe: 'Finalização frontal equilibrada',
    };
  }

  // 3) Passe progressivo/invertido sob pressão a partir do flanco oposto
  if (acao === 'passe') {
    const progressivoOuLongo = faixaDest > faixaOrig || corrOrig !== corrDest;
    const flancoOposto =
      (corrOrig === 'E' && pe === 'direito' && corrDest === 'E') ||
      (corrOrig === 'D' && pe === 'esquerdo' && corrDest === 'D');

    if (progressivoOuLongo && flancoOposto && pressaoOrigem >= 35) {
      const pen = -(maxPen * fatorPenalidadePF * 0.65);
      return {
        ajusteChance: Math.round(pen * 10) / 10,
        peUsado: 'fraco',
        rotuloAjuste: pen <= -1 ? 'Passe sob pressão no pé fraco' : null,
        detalhe: `Saída apertada pelo lado contrário (${qualidadePF}/5)`,
      };
    }

    const inversaoNatural =
      ((corrOrig === 'D' && corrDest === 'E' && pe === 'direito') ||
        (corrOrig === 'E' && corrDest === 'D' && pe === 'esquerdo')) &&
      pressaoOrigem < 55;
    if (inversaoNatural) {
      return {
        ajusteChance: 1.2,
        peUsado: 'dominante',
        rotuloAjuste: 'Abertura com pé dominante',
        detalhe: 'Boa abertura de corpo para virada de jogo',
      };
    }
  }

  return {
    ajusteChance: 0,
    peUsado: 'dominante',
    rotuloAjuste: null,
    detalhe: 'Execução neutra quanto ao pé',
  };
}

// ============================================================================
// Camada Mental — Concentração (contextual, não bônus fixo)
// ============================================================================

/**
 * Obtém o valor (0..100) de um atributo mental do jogador (ex.: 'concentracao').
 */
export function obterAtributoMental(jogador, chave = 'concentracao') {
  if (!jogador) return 50;
  if (typeof jogador.mental?.[chave] === 'number') {
    return jogador.mental[chave];
  }
  if (typeof jogador.atributos?.[chave] === 'number') {
    return jogador.atributos[chave];
  }
  if (chave === 'concentracao') {
    return deduzirConcentracaoPadrao(jogador);
  }
  return 50;
}

/**
 * Calcula o impacto contextual da Concentração no lance.
 * Concentração NÃO dá um bônus fixo cego: ela atua quando há pressão, fadiga acumulada,
 * dificuldade elevada de execução ou momento crítico (terço final, bola parada, disputa).
 *
 * Retorna:
 * - ajusteChance (em pontos percentuais, tipicamente -6 a +6)
 * - fatorEstabilidade (0.85 a 1.15: reduz chance de erro grotesco/bola escapando)
 * - fatorReacaoDefensiva (0.93 a 1.07: afeta leitura defensiva sob pressão/fadiga)
 * - motivo (string curta para painel debug)
 */
export function avaliarImpactoConcentracao({
  jogador,
  receptor = null,
  pressao = 0,
  estamina = 100,
  dificuldadeLance = 0.4, // 0 (muito simples) a 1 (muito complexo/crítico)
  momentoCritico = false,
}) {
  const concPrincipal = obterAtributoMental(jogador, 'concentracao');
  const concReceptor = receptor ? obterAtributoMental(receptor, 'concentracao') : null;
  const concEfetiva =
    concReceptor !== null ? concPrincipal * 0.65 + concReceptor * 0.35 : concPrincipal;

  const delta = concEfetiva - CONCENTRACAO_CONFIG.referencia; // ex.: 70 -> +20, 30 -> -20
  const intensidadePressao = Math.max(0, Math.min(1, pressao / 75));
  const intensidadeFadiga =
    estamina >= 70 ? 0 : estamina >= 40 ? 0.45 : estamina >= 20 ? 0.8 : 1.0;
  const intensidadeCritico = momentoCritico ? 1 : Math.max(0, Math.min(1, dificuldadeLance));

  // Quanto maior o estresse (pressão + fadiga + momento crítico), mais a concentração separa atletas
  const pesoContextual =
    intensidadePressao * CONCENTRACAO_CONFIG.pesoPressaoAlta +
    intensidadeFadiga * CONCENTRACAO_CONFIG.pesoFadigaTardia +
    intensidadeCritico * CONCENTRACAO_CONFIG.pesoMomentoCritico;

  const ajusteBruto = delta * pesoContextual;
  const ajusteChance =
    Math.round(
      Math.max(
        CONCENTRACAO_CONFIG.limiteAjusteMin,
        Math.min(CONCENTRACAO_CONFIG.limiteAjusteMax, ajusteBruto),
      ) * 10,
    ) / 10;

  // Estabilidade de execução: concentração alta reduz erro bobo e melhora domínio sob pressão
  const fatorEstabilidade =
    Math.round(Math.max(0.84, Math.min(1.16, 1 + (delta / 100) * 0.35)) * 100) / 100;

  // Reação defensiva (interceptação / desarme / segunda bola)
  const fatorReacaoDefensiva =
    Math.round(
      Math.max(
        0.92,
        Math.min(1.08, 1 + (delta / 100) * CONCENTRACAO_CONFIG.pesoReacaoDefensiva * 2),
      ) * 1000,
    ) / 1000;

  let motivo = 'Concentração neutra';
  if (ajusteChance >= 1.5) {
    motivo =
      intensidadeFadiga >= 0.45
        ? 'Frieza e foco apesar do desgaste'
        : intensidadePressao >= 0.5
          ? 'Lucidez sob marcação apertada'
          : 'Alta concentração no momento decisivo';
  } else if (ajusteChance <= -1.5) {
    motivo =
      intensidadeFadiga >= 0.45
        ? 'Oscilação mental com a fadiga'
        : intensidadePressao >= 0.5
          ? 'Sentiu a pressão na decisão'
          : 'Falta de foco no lance';
  }

  return {
    concentracaoPrincipal: Math.round(concPrincipal),
    concentracaoReceptor: concReceptor !== null ? Math.round(concReceptor) : null,
    concentracaoEfetiva: Math.round(concEfetiva),
    ajusteChance,
    fatorEstabilidade,
    fatorReacaoDefensiva,
    motivo,
  };
}

/**
 * Identifica os 2 pontos fortes e 1–2 pontos fracos mais marcantes do atleta,
 * reforçando a identidade individual na UI sem expor números crus.
 */
export function extrairDestaquesIndividuais(jogador) {
  if (!jogador?.atributos) {
    return { fortes: [], fracos: [] };
  }
  const chaves = jogador.ehGoleiro
    ? ['defesa', 'posicionamento', 'passe', 'dominio', 'concentracao']
    : [
        'passe',
        'dominio',
        'posicionamento',
        'marcacao',
        'interceptacao',
        'desarme',
        'velocidade',
        'tecnica',
        'dibre',
        'finalizacao',
        'concentracao',
      ];

  const pares = chaves
    .map((c) => ({
      chave: c,
      valor:
        c === 'concentracao'
          ? obterAtributoMental(jogador, 'concentracao')
          : jogador.atributos[c] ?? 45,
    }))
    .sort((a, b) => b.valor - a.valor);

  const fortes = pares.filter((p) => p.valor >= 52).slice(0, 2);
  if (fortes.length === 0 && pares.length > 0) fortes.push(pares[0]);

  const fracos = [...pares]
    .reverse()
    .filter((p) => p.valor <= 40 && !fortes.some((f) => f.chave === p.chave))
    .slice(0, 2);

  return { fortes, fracos };
}
