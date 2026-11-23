/**
 * Módulo de regras do Relógio de Decisão por turno do usuário (ataque e defesa):
 * - Duração por dificuldade da campanha:
 *   Nível 0: sem relógio (null) | Níveis 1–2: 30s | Níveis 3–4: 20s | Nível 5: 12s
 * - Primeira metade do tempo: 0 penalidade.
 * - Segunda metade: -1% na chance por segundo decorrido além da metade, até -10% no máximo.
 * - Esgotado no ataque: rival rouba a bola por demora (consome turno do usuário).
 * - Esgotado na defesa: aplica automaticamente 'nenhuma' ("Manter marcação").
 *
 * TODAS as constantes de calibração ficam centralizadas no topo deste arquivo.
 */

// ============================================================================
// Constantes de Calibração (centralizadas no topo)
// ============================================================================

export const TEMPO_TURNO_POR_DIFICULDADE = Object.freeze({
  0: null,
  1: 30,
  2: 30,
  3: 20,
  4: 20,
  5: 12,
});

export const RELOGIO_CONFIG = Object.freeze({
  fracaoSemPenalidade: 0.5,
  penalidadePorSegundo: 1,
  penalidadeMaxima: 10,
});

// ============================================================================
// Funções Puras do Relógio de Decisão
// ============================================================================

export function obterTempoTurnoPorDificuldade(
  dificuldade = 0,
  relogioDesligado = false,
) {
  if (relogioDesligado) return null;
  const dif = Math.max(0, Math.min(5, Math.floor(Number(dificuldade) || 0)));
  return TEMPO_TURNO_POR_DIFICULDADE[dif] ?? null;
}

/**
 * Calcula o desconto na chance (0..10 em valor positivo representando -0% a -10%).
 * Primeira metade: 0. Segunda metade: -1% por segundo inteiro após a metade, máx 10%.
 */
export function calcularDescontoRelogio(tempoTotal, tempoRestante) {
  if (typeof tempoTotal !== 'number' || tempoTotal <= 0) return 0;
  const restante = Math.max(0, Math.min(tempoTotal, Number(tempoRestante) || 0));
  const decorrido = tempoTotal - restante;
  const metade = tempoTotal * RELOGIO_CONFIG.fracaoSemPenalidade;

  if (decorrido <= metade) return 0;

  const segundosAposMetade = Math.floor(decorrido - metade + 1e-9);
  if (segundosAposMetade <= 0) return 0;

  return Math.min(
    RELOGIO_CONFIG.penalidadeMaxima,
    segundosAposMetade * RELOGIO_CONFIG.penalidadePorSegundo,
  );
}

/**
 * Identifica de forma única o turno decisório atual do usuário (`ataque` ou `defesa`).
 * Retorna `null` quando a partida está encerrada ou o rival está pensando/executando.
 */
export function obterChaveTurnoRelogio(estado, rivalPensando = false) {
  if (!estado || estado.encerrada || rivalPensando) return null;
  if (estado.timeComBola === 'meuTime') {
    return {
      chave: `ataque:${estado.turnosJogados?.meuTime ?? 0}`,
      faseTipo: 'ataque',
    };
  }
  if (
    estado.timeComBola === 'rival' &&
    estado.defesaTurno?.fase === 'aguardando_ordem'
  ) {
    return {
      chave: `defesa:${estado.turnosJogados?.rival ?? 0}`,
      faseTipo: 'defesa',
    };
  }
  return null;
}

export function criarEstadoRelogio({
  dificuldade = 0,
  relogioDesligado = false,
} = {}) {
  const tempoTotal = obterTempoTurnoPorDificuldade(dificuldade, relogioDesligado);
  return {
    ativo: Boolean(tempoTotal),
    dificuldade: Math.max(0, Math.min(5, Math.floor(Number(dificuldade) || 0))),
    desligadoPorOpcao: Boolean(relogioDesligado),
    tempoTotal: tempoTotal || 0,
    tempoRestante: tempoTotal || 0,
    descontoAtual: 0,
    chaveTurno: null,
    faseTipo: null,
    pausado: false,
    motivosPausa: [],
  };
}

export function reiniciarRelogioParaTurno(relogio, { chaveTurno, faseTipo } = {}) {
  if (!relogio || !relogio.ativo || relogio.tempoTotal <= 0) return relogio;
  relogio.chaveTurno = chaveTurno || null;
  relogio.faseTipo = faseTipo || null;
  relogio.tempoRestante = relogio.tempoTotal;
  relogio.descontoAtual = 0;
  return relogio;
}

export function avancarRelogio(relogio, deltaSegundos) {
  if (!relogio || !relogio.ativo || relogio.pausado || !relogio.chaveTurno) {
    return {
      tempoRestante: relogio?.tempoRestante ?? 0,
      desconto: relogio?.descontoAtual ?? 0,
      mudouDesconto: false,
      esgotado: false,
    };
  }

  const delta = Math.max(0, Number(deltaSegundos) || 0);
  const anteriorDesconto = relogio.descontoAtual;
  relogio.tempoRestante = Math.max(0, relogio.tempoRestante - delta);
  relogio.descontoAtual = calcularDescontoRelogio(
    relogio.tempoTotal,
    relogio.tempoRestante,
  );

  return {
    tempoRestante: relogio.tempoRestante,
    desconto: relogio.descontoAtual,
    mudouDesconto: relogio.descontoAtual !== anteriorDesconto,
    esgotado: relogio.tempoRestante <= 0,
  };
}
