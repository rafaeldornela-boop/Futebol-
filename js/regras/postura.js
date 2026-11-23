/**
 * Módulo de Postura Tática por partida e por time:
 * - Equilibrada (padrão): comportamento base da formação.
 * - Ofensiva: nas fases meio e frente, jogadores de linha (exceto ZAG1) avançam +1 faixa (até 5);
 *   passes para frente e longo +4%; contra-ataque do adversário ganha +10% adicional;
 *   custo de deslocamento ×1,5.
 * - Defensiva: nas fases meio e frente, jogadores de linha (exceto CA/ATA) recuam -1 faixa (até 1);
 *   passe para frente -4%; pressão na linha de passe ×1,10; próprio contra-ataque ganha +5%.
 * - Troca em partida: até 2 vezes por partida, apenas no início do turno de ataque, sem gastar turno.
 * - IA do rival: nos últimos 3 turnos dele, ajusta conforme o placar (perdendo -> ofensiva, ganhando -> defensiva).
 *
 * TODAS as constantes de calibração ficam centralizadas no topo deste arquivo.
 */

// ============================================================================
// Constantes de Calibração (centralizadas no topo)
// ============================================================================

export const POSTURA_PADRAO = 'equilibrada';
export const MAX_TROCAS_POSTURA_PARTIDA = 2;
export const TURNOS_FINAIS_POSTURA_RIVAL = 3;

export const ORDEM_POSTURAS = Object.freeze([
  'defensiva',
  'equilibrada',
  'ofensiva',
]);

export const POSTURAS_CONFIG = Object.freeze({
  defensiva: {
    id: 'defensiva',
    nome: 'Defensiva',
    nomeCurto: 'Defensiva',
    deslocamentoMeioFrente: -1,
    ajustePasseFrente: -4,
    ajustePasseLongo: 0,
    multiplicadorPressaoLinha: 1.1,
    bonusContraAtaqueProprio: 5,
    bonusExtraContraAtaqueAdversario: 0,
    multiplicadorDeslocamento: 1.0,
    resumo:
      'Meio/frente: linha recua 1 faixa (exceto atacantes); passe p/ frente −4%; pressão linha ×1,10; seu contra-ataque +5%.',
  },
  equilibrada: {
    id: 'equilibrada',
    nome: 'Equilibrada',
    nomeCurto: 'Equilibrada',
    deslocamentoMeioFrente: 0,
    ajustePasseFrente: 0,
    ajustePasseLongo: 0,
    multiplicadorPressaoLinha: 1.0,
    bonusContraAtaqueProprio: 0,
    bonusExtraContraAtaqueAdversario: 0,
    multiplicadorDeslocamento: 1.0,
    resumo: 'Linhas padrão da formação por fase, sem bônus ou penalidades extras.',
  },
  ofensiva: {
    id: 'ofensiva',
    nome: 'Ofensiva',
    nomeCurto: 'Ofensiva',
    deslocamentoMeioFrente: 1,
    ajustePasseFrente: 4,
    ajustePasseLongo: 4,
    multiplicadorPressaoLinha: 1.0,
    bonusContraAtaqueProprio: 0,
    bonusExtraContraAtaqueAdversario: 10,
    multiplicadorDeslocamento: 1.5,
    resumo:
      'Meio/frente: linha avança 1 faixa (exceto ZAG1); passe p/ frente e longo +4%; contra-ataque rival +10% extra; desloc. ×1,5.',
  },
});

const PAPEIS_ATACANTE_CENTRO = new Set(['CA', 'ATA1', 'ATA2']);

// ============================================================================
// Funções Puras de Postura Tática
// ============================================================================

export function normalizarPosturaId(posturaId) {
  return POSTURAS_CONFIG[posturaId] ? posturaId : POSTURA_PADRAO;
}

export function obterConfigPostura(posturaId) {
  return POSTURAS_CONFIG[normalizarPosturaId(posturaId)];
}

/**
 * Deslocamento vertical de faixa imposto pela postura na fase informada.
 * - Ofensiva: +1 nas fases meio/frente para linha exceto ZAG1.
 * - Defensiva: -1 nas fases meio/frente para linha exceto CA/ATA1/ATA2.
 */
export function obterDeslocamentoPosturaJogador(posturaId, papel, fase) {
  if (fase !== 'meio' && fase !== 'frente') return 0;
  if (!papel || papel === 'GOL') return 0;

  const id = normalizarPosturaId(posturaId);
  if (id === 'ofensiva') {
    return papel === 'ZAG1' ? 0 : POSTURAS_CONFIG.ofensiva.deslocamentoMeioFrente;
  }
  if (id === 'defensiva') {
    return PAPEIS_ATACANTE_CENTRO.has(papel)
      ? 0
      : POSTURAS_CONFIG.defensiva.deslocamentoMeioFrente;
  }
  return 0;
}

export function obterMultiplicadorDeslocamentoPostura(posturaId) {
  return obterConfigPostura(posturaId).multiplicadorDeslocamento;
}

export function obterMultiplicadorPressaoLinhaPostura(posturaId) {
  return obterConfigPostura(posturaId).multiplicadorPressaoLinha;
}

/**
 * Ajustes diretos na chance (%) de passe causados pela postura ofensiva/defensiva.
 */
export function obterAjustesChancePostura(posturaId, acao, tipoPasseId = null) {
  if (acao !== 'passe') return [];
  const cfg = obterConfigPostura(posturaId);
  const ajustes = [];

  if (tipoPasseId === 'frente' && cfg.ajustePasseFrente !== 0) {
    ajustes.push({
      rotulo: `Postura ${cfg.nome} (frente)`,
      valor: cfg.ajustePasseFrente,
    });
  } else if (tipoPasseId === 'longo' && cfg.ajustePasseLongo !== 0) {
    ajustes.push({
      rotulo: `Postura ${cfg.nome} (longo)`,
      valor: cfg.ajustePasseLongo,
    });
  }

  return ajustes;
}

/**
 * Soma adicional de contra-ataque em função da postura de quem recuperou e de quem perdeu a bola.
 */
export function obterBonusContraAtaquePostura({
  posturaRecuperador = POSTURA_PADRAO,
  posturaPerdedor = POSTURA_PADRAO,
} = {}) {
  const cfgRec = obterConfigPostura(posturaRecuperador);
  const cfgPerd = obterConfigPostura(posturaPerdedor);
  return (
    (cfgRec.bonusContraAtaqueProprio || 0) +
    (cfgPerd.bonusExtraContraAtaqueAdversario || 0)
  );
}

/**
 * Decide a postura do rival nos últimos 3 turnos dele conforme o placar:
 * - Perdendo -> ofensiva
 * - Ganhando -> defensiva
 * - Empatado -> equilibrada
 */
export function decidirPosturaDinamicaRival({
  turnosRestantesRival = 10,
  golsRival = 0,
  golsMeu = 0,
  posturaAtual = POSTURA_PADRAO,
} = {}) {
  if (turnosRestantesRival > TURNOS_FINAIS_POSTURA_RIVAL || turnosRestantesRival <= 0) {
    return normalizarPosturaId(posturaAtual);
  }
  if (golsRival < golsMeu) return 'ofensiva';
  if (golsRival > golsMeu) return 'defensiva';
  return 'equilibrada';
}

export function obterTrocasPosturaRestantes(estado, timeId = 'meuTime') {
  const usadas = estado?.trocasPostura?.[timeId] ?? 0;
  return Math.max(0, MAX_TROCAS_POSTURA_PARTIDA - usadas);
}

/**
 * Verifica se o time pode alterar a postura na partida:
 * - Máximo 2 trocas por partida
 * - Apenas no início do próprio turno de ataque (sem já ter trocado no turno)
 */
export function podeTrocarPosturaPartida(estado, timeId = 'meuTime', novaPostura = null) {
  if (!estado || estado.encerrada) {
    return {
      permitido: false,
      motivo: 'Partida encerrada.',
      restantes: 0,
    };
  }

  const restantes = obterTrocasPosturaRestantes(estado, timeId);
  if (estado.timeComBola !== timeId) {
    return {
      permitido: false,
      motivo: 'Postura só pode ser alterada no início do seu turno de ataque.',
      restantes,
    };
  }

  if (estado.posturaTrocadaNoTurno?.[timeId]) {
    return {
      permitido: false,
      motivo: 'Você já ajustou a postura neste turno.',
      restantes,
    };
  }

  if (restantes <= 0) {
    return {
      permitido: false,
      motivo: `Limite de ${MAX_TROCAS_POSTURA_PARTIDA} trocas de postura na partida atingido.`,
      restantes: 0,
    };
  }

  const atual = normalizarPosturaId(estado.posturas?.[timeId]);
  if (novaPostura && normalizarPosturaId(novaPostura) === atual) {
    return {
      permitido: false,
      motivo: 'Essa postura já está ativa.',
      restantes,
    };
  }

  return {
    permitido: true,
    motivo: '',
    restantes,
  };
}
