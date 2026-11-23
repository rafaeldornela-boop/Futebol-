/**
 * Módulo de cálculos táticos: cobertura por eficiência, pressão dupla por zona
 * (no portador e na linha de passe), passes, condução, finalização e modificadores
 * defensivos/táticos.
 *
 * TODAS as constantes de calibração ficam centralizadas no topo deste arquivo.
 */

import {
  ehZonaLinhaDeFundo,
  ehZonaTercoFinal,
  IDS_ZONAS,
  obterCorredor,
  obterDistanciaZonas,
  obterFaixa,
  obterZonasIntermediarias,
  podeCruzarNaZona,
  saoZonasVizinhos,
  ZONAS,
  zonaParaPontoDeVista,
} from '../dados/zonas.js';
import {
  obterAtributoEfetivo,
  obterAtributoEfetivoComBonus,
  resumirFadigaJogador,
} from './estamina.js';
import {
  calcularCustoEstaminaComHabilidades,
  coletarModificadoresPassivosTime,
  obterBonusPassivoDefesaGoleiro,
  obterBonusPassivosConducao,
  obterBonusPassivosFinalizacao,
  obterBonusPassivosPasse,
  obterModificadorInterceptacaoJogador,
  obterModificadorPortadorJogador,
  obterReducaoPressaoPortadorPasse,
} from './habilidades.js';

// ============================================================================
// Constantes de Calibração (centralizadas no topo para ajuste rápido)
// ============================================================================

export const CHANCE_MINIMA = 5;
export const CHANCE_MAXIMA = 95;

export const FINALIZACAO_CHANCE_MINIMA = 5;
export const FINALIZACAO_CHANCE_MAXIMA = 82;

export const MARGEM_ERRO_EXECUCAO = 20;

export const TABELA_EFICIENCIA_DISTANCIA = Object.freeze({
  0: 1.0,
  1: 0.7,
  2: 0.4,
  padrao: 0.05,
});

export const EFICIENCIA_CONFIG = Object.freeze({
  baseAlcance: 0.7,
  fatorAlcance: 0.3,
  fatorPressaoIndividual: 0.5,
});

export const PRESSAO_CONFIG = Object.freeze({
  pesoDesarmePortador: 0.6,
  pesoMarcacaoPortador: 0.4,
  pesoInterceptacaoLinha: 0.6,
  pesoMarcacaoLinha: 0.4,
});

export const TIPOS_PASSE = Object.freeze({
  curto: { id: 'curto', rotulo: 'Curto', base: 92, peso: 0.35 },
  tras: { id: 'tras', rotulo: 'Para trás', base: 90, peso: 0.3 },
  lateral: { id: 'lateral', rotulo: 'Lateral', base: 83, peso: 0.5 },
  frente: { id: 'frente', rotulo: 'Para frente', base: 74, peso: 0.7 },
  longo: { id: 'longo', rotulo: 'Longo', base: 60, peso: 0.65 },
  invertido: { id: 'invertido', rotulo: 'Invertido', base: 52, peso: 0.75 },
});

export const PASSE_CONFIG = Object.freeze({
  pesoPassePassador: 0.5,
  pesoDominioReceptor: 0.25,
  pesoPosicionamentoReceptor: 0.25,
  fatorAtaque: 0.3,
  referenciaAtributo: 60,
  fatorPressaoLinha: 0.3,
  fatorPressaoPortador: 0.12,
  fatorZonaIntermediaria: 0.35,
});

export const CONDUCAO_CONFIG = Object.freeze({
  base: 74,
  pesoTecnica: 0.4,
  pesoVelocidade: 0.35,
  pesoDibre: 0.25,
  fatorAtaque: 0.32,
  referenciaAtributo: 60,
  pesoPressao: 1.0,
  fatorPressao: 0.25,
});

export const DIBRE_CONFIG = Object.freeze({
  baseMesmaZona: 74,
  baseAvanco: 70,
  pesoDibre: 0.55,
  pesoTecnica: 0.25,
  pesoVelocidade: 0.2,
  referenciaAtributo: 60,
  fatorAtaque: 0.38,
  fatorPressaoPortador: 0.22,
  bonusDibreProximaJogada: 12,
  reducaoPressaoPosDibre: 0.5,
  margemFaltaSofrida: 14,
  bonusMargemFaltaTercoFinal: 6,
});

export const CRUZAMENTO_CONFIG = Object.freeze({
  baseLinhaDeFundo: 42,
  baseAlaOfensiva: 34,
  bonusPasseLinhaDeFundo: 10,
  bonusRecepcaoCruzamento: 15,
  pesoPasseCruzador: 0.5,
  pesoTecnicaCruzador: 0.3,
  pesoDibreCruzador: 0.2,
  pesoFinalizacaoCabeceador: 0.55,
  pesoPosicionamentoCabeceador: 0.3,
  pesoDominioCabeceador: 0.15,
  referenciaAtributo: 60,
  fatorAtaque: 0.38,
  fatorGoleiro: 0.18,
  fatorPressaoLinha: 0.12,
  fatorPressaoPortador: 0.08,
  margemEscanteioDefesa: 14,
});

export const FINALIZACAO_CONFIG = Object.freeze({
  baseFaixa5Centro: 52,
  baseFaixa5Lado: 36,
  baseZ4Centro: 25,
  basePenalti: 78,
  baseFaltaDireta: 32,
  bonusPotenciaChuteDeFora: 15,
  bonusChuteColocado: 6,
  ajusteChuteBomba: -2,
  bonusReboteArea: 16,
  pesoFinalizacao: 0.6,
  pesoTecnica: 0.25,
  pesoDibre: 0.15,
  referenciaAtributo: 60,
  fatorAtaque: 0.44,
  fatorGoleiro: 0.2,
  fatorPressaoPortador: 0.08,
  defesaGoleiroPadrao: 75,
  margemEscanteioDefesa: 16,
  margemReboteDefesa: 14,
});

export const DEFESA_CONFIG = Object.freeze({
  limiarTrocaJogadaRival: 35,
  multiplicadorPressionarPortador: 1.5,
  bonusRivalAposPressionar: 10,
  multiplicadorFecharLinhaAlvo: 1.5,
  multiplicadorFecharLinhaOutras: 0.8,
  ajusteRecuarFrenteOuLongo: -10,
  ajusteRecuarTrasOuLateral: 5,
  bonusBolaParadaFalta: 10,
  divisorAgressividadeAmarelo: 2,
  bonusContraAtaque: 10,
  bonusInfiltracaoTercoFinal: 6,
  bonusPorNivelImpeto: 3,
  maxNivelImpeto: 3,
  bonusEscanteioCruzamento: 12,
  bonusEscanteioCurto: 15,
  bonusFaltaOfensivaPasse: 12,
});

// ============================================================================
// Funções Auxiliares Puras
// ============================================================================

export function limitar(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

export function arredondar1(valor) {
  return Math.round(valor * 10) / 10;
}

/**
 * Alcance do jogador = (posicionamento + velocidade) / 2, já com multiplicador de fadiga
 * e eventuais bônus passivos de time (ex.: Liderança).
 */
export function calcularAlcance(jogador, bonusAtributos = null) {
  return (
    (obterAtributoEfetivoComBonus(jogador, 'posicionamento', bonusAtributos) +
      obterAtributoEfetivoComBonus(jogador, 'velocidade', bonusAtributos)) /
    2
  );
}

/**
 * Força no portador = desarme × 0,6 + marcação × 0,4, já com multiplicador de fadiga.
 */
export function calcularForcaNoPortador(jogador) {
  return (
    obterAtributoEfetivo(jogador, 'desarme') * PRESSAO_CONFIG.pesoDesarmePortador +
    obterAtributoEfetivo(jogador, 'marcacao') * PRESSAO_CONFIG.pesoMarcacaoPortador
  );
}

/**
 * Força na linha de passe = interceptação × 0,6 + marcação × 0,4, já com multiplicador de fadiga.
 */
export function calcularForcaNaLinha(jogador) {
  return (
    obterAtributoEfetivo(jogador, 'interceptacao') *
      PRESSAO_CONFIG.pesoInterceptacaoLinha +
    obterAtributoEfetivo(jogador, 'marcacao') * PRESSAO_CONFIG.pesoMarcacaoLinha
  );
}

/**
 * Eficiência do jogador numa zona (0 a 1):
 * tabela(distância da zona-base) × (0,7 + 0,3 × alcance / 100).
 */
export function calcularEficienciaNaZona(jogador, zonaAlvo, bonusAtributos = null) {
  if (jogador.extras?.cartoes?.vermelho) return 0;
  const zonaBase = jogador.zonaBase || jogador.zona;
  if (!zonaBase) return 0;

  const dist = obterDistanciaZonas(zonaBase, zonaAlvo);
  const fatorDist =
    TABELA_EFICIENCIA_DISTANCIA[dist] ?? TABELA_EFICIENCIA_DISTANCIA.padrao;
  const alcance = calcularAlcance(jogador, bonusAtributos);
  const fatorAlcance =
    EFICIENCIA_CONFIG.baseAlcance +
    EFICIENCIA_CONFIG.fatorAlcance * (alcance / 100);
  return fatorDist * fatorAlcance;
}

/**
 * Calcula as duas pressões (0 a 100) de um time sobre uma zona:
 * - pressaoPortador (força = desarme × 0,6 + marcação × 0,4)
 * - pressaoLinha (força = interceptação × 0,6 + marcação × 0,4)
 * Consulta modificadores passivos (ex.: Liderança, Leitura de jogo) e ativos (ex.: Carrinho cirúrgico).
 */
export function calcularPressaoZona(
  jogadoresDefensores,
  zonaId,
  marcacaoIndividual = null,
  modificadoresPressao = null,
) {
  let produtoPortador = 1;
  let produtoLinha = 1;
  const contribuicoesPortador = [];
  const contribuicoesLinha = [];

  const { bonusAtributosLinha, habilidadesAura } =
    coletarModificadoresPassivosTime(jogadoresDefensores);

  const habilidadesPortadorZona = [];
  const habilidadesLinhaZona = [];

  for (const aura of habilidadesAura) {
    const label = `${aura.nome} (${aura.jogador}: ${aura.detalhe})`;
    habilidadesPortadorZona.push(label);
    habilidadesLinhaZona.push(label);
  }

  for (const defensor of jogadoresDefensores) {
    if (defensor.ehGoleiro || defensor.extras?.cartoes?.vermelho) continue;

    let eficiencia = calcularEficienciaNaZona(defensor, zonaId, bonusAtributosLinha);
    let forcaPortador = calcularForcaNoPortador(defensor);
    let forcaLinha = calcularForcaNaLinha(defensor);

    const modInterceptacao = obterModificadorInterceptacaoJogador(defensor);
    if (modInterceptacao.multiplicador !== 1) {
      forcaLinha *= modInterceptacao.multiplicador;
      for (const h of modInterceptacao.habilidades) {
        habilidadesLinhaZona.push(`${h.nome} (${h.jogador}: ${h.detalhe})`);
      }
    }

    const modPortadorPassivo = obterModificadorPortadorJogador(defensor);
    if (modPortadorPassivo.multiplicador !== 1) {
      forcaPortador *= modPortadorPassivo.multiplicador;
      for (const h of modPortadorPassivo.habilidades) {
        habilidadesPortadorZona.push(`${h.nome} (${h.jogador}: ${h.detalhe})`);
      }
    }

    // Gancho preparado para futura camada de marcação individual
    const regraInd = marcacaoIndividual?.porJogador?.[defensor.id];
    if (regraInd) {
      if (regraInd.zonaAlvo === zonaId && regraInd.bonusEficiencia) {
        eficiencia = limitar(eficiencia + regraInd.bonusEficiencia, 0, 1);
      }
      if (regraInd.bonusForca) {
        forcaPortador = limitar(forcaPortador + regraInd.bonusForca, 1, 100);
        forcaLinha = limitar(forcaLinha + regraInd.bonusForca, 1, 100);
      }
    }

    const multJogadorPortador =
      modificadoresPressao?.multiplicadorPortadorPorJogador?.[defensor.id] || 1;
    if (multJogadorPortador !== 1) {
      const habInfo = (modificadoresPressao?.habilidadesDefesa || []).find(
        (h) => h.jogadorId === defensor.id,
      );
      if (habInfo) {
        habilidadesPortadorZona.push(
          `${habInfo.nome} (${habInfo.jogadorNome}: pressão ×${multJogadorPortador})`,
        );
      }
    }

    const impPortador =
      EFICIENCIA_CONFIG.fatorPressaoIndividual *
      eficiencia *
      (forcaPortador / 100) *
      multJogadorPortador;
    const impLinha =
      EFICIENCIA_CONFIG.fatorPressaoIndividual * eficiencia * (forcaLinha / 100);

    produtoPortador *= 1 - limitar(impPortador, 0, 0.95);
    produtoLinha *= 1 - limitar(impLinha, 0, 0.95);

    contribuicoesPortador.push({
      jogador: defensor,
      eficiencia: arredondar1(eficiencia * 100),
      forca: Math.round(forcaPortador),
      impacto: arredondar1(limitar(impPortador, 0, 0.95) * 100),
      multiplicador: multJogadorPortador,
    });
    contribuicoesLinha.push({
      jogador: defensor,
      eficiencia: arredondar1(eficiencia * 100),
      forca: Math.round(forcaLinha),
      impacto: arredondar1(limitar(impLinha, 0, 0.95) * 100),
    });
  }

  const bonusZona = marcacaoIndividual?.porZona?.[zonaId] || 0;
  let brutaPortador = 100 * (1 - produtoPortador) + bonusZona;
  let brutaLinha = 100 * (1 - produtoLinha) + bonusZona;

  // Modificadores de ordem defensiva do turno
  if (modificadoresPressao?.multiplicadorPortadorPorZona?.[zonaId]) {
    brutaPortador *= modificadoresPressao.multiplicadorPortadorPorZona[zonaId];
  }
  if (modificadoresPressao?.fecharLinha) {
    const { zonaAlvo, multAlvo, multOutras } = modificadoresPressao.fecharLinha;
    brutaLinha *= zonaId === zonaAlvo ? multAlvo : multOutras;
  }
  if (
    modificadoresPressao?.multiplicadorLinhaGeral &&
    modificadoresPressao.multiplicadorLinhaGeral !== 1
  ) {
    brutaLinha *= modificadoresPressao.multiplicadorLinhaGeral;
  }

  const pressaoPortador = limitar(Math.round(brutaPortador), 0, 100);
  const pressaoLinha = limitar(Math.round(brutaLinha), 0, 100);

  return {
    zonaId,
    pressaoPortador,
    pressaoLinha,
    pressao: pressaoLinha,
    contribuicoesPortador: contribuicoesPortador.sort((a, b) => b.impacto - a.impacto),
    contribuicoesLinha: contribuicoesLinha.sort((a, b) => b.impacto - a.impacto),
    habilidadesPortadorZona: [...new Set(habilidadesPortadorZona)],
    habilidadesLinhaZona: [...new Set(habilidadesLinhaZona)],
  };
}

/**
 * Calcula o mapa completo das duas pressões (0 a 100) para todas as 17 zonas.
 */
export function calcularMapaPressao(
  jogadoresDefensores,
  marcacaoIndividual = null,
  modificadoresPressao = null,
) {
  const mapa = {};
  for (const zonaId of IDS_ZONAS) {
    mapa[zonaId] = calcularPressaoZona(
      jogadoresDefensores,
      zonaId,
      marcacaoIndividual,
      modificadoresPressao,
    );
  }
  return mapa;
}

// ============================================================================
// Classificação e Cálculo de Passes
// ============================================================================

/**
 * Classifica o tipo do passe com base em origem, destino e ponto de vista do time:
 * - Curto: mesma zona
 * - Invertido: E <-> D em qualquer faixa (sempre o mais difícil)
 * - Para trás: faixa menor
 * - Lateral: mesma faixa, corredor vizinho
 * - Para frente: +1 faixa
 * - Longo: +2 faixas ou mais
 */
export function classificarTipoPasse(zonaOrigem, zonaDestino, timeId) {
  if (zonaOrigem === zonaDestino) {
    return TIPOS_PASSE.curto;
  }

  const corrOrigem = obterCorredor(zonaOrigem, timeId);
  const corrDestino = obterCorredor(zonaDestino, timeId);

  if (
    (corrOrigem === 'E' && corrDestino === 'D') ||
    (corrOrigem === 'D' && corrDestino === 'E')
  ) {
    return TIPOS_PASSE.invertido;
  }

  const faixaOrigem = obterFaixa(zonaOrigem, timeId);
  const faixaDestino = obterFaixa(zonaDestino, timeId);
  const delta = faixaDestino - faixaOrigem;

  if (delta < 0) return TIPOS_PASSE.tras;
  if (delta === 0) return TIPOS_PASSE.lateral;
  if (delta === 1) return TIPOS_PASSE.frente;
  return TIPOS_PASSE.longo;
}

function juntarHabilidadesUnicas(...listas) {
  const resultado = [];
  const vistos = new Set();
  for (const lista of listas) {
    for (const item of lista || []) {
      const texto = typeof item === 'string' ? item : item?.texto;
      if (!texto || vistos.has(texto)) continue;
      vistos.add(texto);
      resultado.push(texto);
    }
  }
  return resultado;
}

/**
 * Calcula a chance de acerto de um passe para um companheiro específico.
 */
export function calcularChancePasse({
  passador,
  receptor,
  defensores,
  timeId,
  aliados = null,
  mapaPressao = null,
  marcacaoIndividual = null,
  modificadoresPressao = null,
  ajustesChance = [],
  habilidadeAtiva = null,
}) {
  const tipo = classificarTipoPasse(passador.zona, receptor.zona, timeId);
  const pressoes =
    mapaPressao ||
    calcularMapaPressao(defensores, marcacaoIndividual, modificadoresPressao);

  const { bonusAtributosLinha: bonusAliados, habilidadesAura: aurasAliados } =
    coletarModificadoresPassivosTime(aliados || [passador, receptor]);

  const eficienciaReceptor = calcularEficienciaNaZona(
    receptor,
    receptor.zona,
    bonusAliados,
  );

  const ataqueBruto =
    obterAtributoEfetivoComBonus(passador, 'passe', bonusAliados) *
      PASSE_CONFIG.pesoPassePassador +
    (obterAtributoEfetivoComBonus(receptor, 'dominio', bonusAliados) *
      PASSE_CONFIG.pesoDominioReceptor +
      obterAtributoEfetivoComBonus(receptor, 'posicionamento', bonusAliados) *
        PASSE_CONFIG.pesoPosicionamentoReceptor) *
      eficienciaReceptor;

  const pressaoPortadorOrigemBruta = pressoes[passador.zona]?.pressaoPortador ?? 0;
  const redOrigem = obterReducaoPressaoPortadorPasse(passador);
  const pressaoPortadorOrigem =
    redOrigem.reducao > 0
      ? arredondar1(pressaoPortadorOrigemBruta * (1 - redOrigem.reducao))
      : pressaoPortadorOrigemBruta;
  const pressaoLinhaDestinoBruta = pressoes[receptor.zona]?.pressaoLinha ?? 0;

  let pressaoLinhaDestino = pressaoLinhaDestinoBruta;
  const habilidadesAtivasAplicadas = [];
  for (const h of redOrigem.habilidades) {
    habilidadesAtivasAplicadas.push(`${h.nome} (${h.jogador}: ${h.detalhe})`);
  }

  if (
    habilidadeAtiva?.efeito?.tipo === 'passe_ignora_pressao_destino' &&
    (!habilidadeAtiva.efeito.tiposPassePermitidos ||
      habilidadeAtiva.efeito.tiposPassePermitidos.includes(tipo.id))
  ) {
    const reducao = habilidadeAtiva.efeito.reducaoPressaoLinhaDestino || 0;
    pressaoLinhaDestino = arredondar1(pressaoLinhaDestinoBruta * (1 - reducao));
    habilidadesAtivasAplicadas.push(
      `${habilidadeAtiva.nome} (${passador.nomeCurto}: ${habilidadeAtiva.efeito.rotuloCurto || '−50% pressão dest.'})`,
    );
  }

  // Se o passe pula zonas (longo ou invertido), soma 50% da pressão na linha da zona intermediária
  const zonasIntermediarias = obterZonasIntermediarias(
    passador.zona,
    receptor.zona,
    tipo.id,
    timeId,
  );
  let pressaoIntermediaria = 0;
  const habsIntermediarias = [];
  if (zonasIntermediarias.length > 0) {
    const soma = zonasIntermediarias.reduce(
      (acc, z) => acc + (pressoes[z]?.pressaoLinha ?? 0),
      0,
    );
    pressaoIntermediaria = Math.round(soma / zonasIntermediarias.length);
    for (const z of zonasIntermediarias) {
      habsIntermediarias.push(...(pressoes[z]?.habilidadesLinhaZona || []));
    }
  }

  const pressaoTotalDestino = Math.min(
    100,
    pressaoLinhaDestino +
      pressaoIntermediaria * PASSE_CONFIG.fatorZonaIntermediaria,
  );

  const bonusPassivos = obterBonusPassivosPasse(passador, tipo.id);
  const ajustesCompletos = [...ajustesChance, ...bonusPassivos.ajustes];
  const somaAjustes = ajustesCompletos.reduce((acc, item) => acc + item.valor, 0);

  const chanceBruta =
    tipo.base +
    (ataqueBruto - PASSE_CONFIG.referenciaAtributo) * PASSE_CONFIG.fatorAtaque -
    pressaoTotalDestino * tipo.peso * PASSE_CONFIG.fatorPressaoLinha -
    pressaoPortadorOrigem * PASSE_CONFIG.fatorPressaoPortador +
    somaAjustes;

  const chance = Math.round(limitar(chanceBruta, CHANCE_MINIMA, CHANCE_MAXIMA));

  const folegoPassador = calcularCustoEstaminaComHabilidades(passador, 10).habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const folegoReceptor = calcularCustoEstaminaComHabilidades(receptor, 10).habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const habsAuraTexto = !receptor.ehGoleiro
    ? aurasAliados.map((a) => `${a.nome} (${a.jogador}: ${a.detalhe})`)
    : [];
  const habsBonusPasseTexto = bonusPassivos.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );

  const habilidadesAplicadas = juntarHabilidadesUnicas(
    habilidadesAtivasAplicadas,
    habsBonusPasseTexto,
    habsAuraTexto,
    pressoes[passador.zona]?.habilidadesPortadorZona,
    pressoes[receptor.zona]?.habilidadesLinhaZona,
    habsIntermediarias,
    folegoPassador,
    folegoReceptor,
  );

  return {
    acao: 'passe',
    tipo,
    base: tipo.base,
    peso: tipo.peso,
    ataque: arredondar1(ataqueBruto),
    eficienciaReceptor: Math.round(eficienciaReceptor * 100),
    pressaoPortadorOrigem,
    pressaoDestino: pressaoLinhaDestino,
    pressaoDestinoBruta: pressaoLinhaDestinoBruta,
    zonasIntermediarias,
    pressaoIntermediaria,
    pressaoTotal: arredondar1(pressaoTotalDestino),
    ajustesChance: ajustesCompletos,
    somaAjustes,
    habilidadeAtivaId: habilidadeAtiva?.id || null,
    habilidadesAplicadas,
    jogadoresFadiga: [
      resumirFadigaJogador(passador, 'Passador'),
      resumirFadigaJogador(receptor, 'Receptor'),
    ].filter(Boolean),
    chance,
    classificacao: classificarRisco(chance),
  };
}

// ============================================================================
// Cálculo de Condução (para zona vizinha ou Arrancada de 2 zonas)
// ============================================================================

/**
 * Conduzir: leva a bola para uma zona vizinha (ou 2 zonas com Arrancada).
 * Inclui o atributo dibre junto com técnica e velocidade.
 */
export function calcularChanceConducao({
  portador,
  zonaDestino,
  defensores,
  timeId,
  aliados = null,
  mapaPressao = null,
  marcacaoIndividual = null,
  modificadoresPressao = null,
  ajustesChance = [],
  habilidadeAtiva = null,
}) {
  const ehArrancada = habilidadeAtiva?.efeito?.tipo === 'conducao_distancia';
  if (ehArrancada) {
    const distExata = habilidadeAtiva.efeito.distanciaExata || 2;
    if (
      !ZONAS[zonaDestino] ||
      ZONAS[zonaDestino].foraDaGrade ||
      obterDistanciaZonas(portador.zona, zonaDestino) !== distExata
    ) {
      return null;
    }
  } else if (!saoZonasVizinhos(portador.zona, zonaDestino)) {
    return null;
  }

  const pressoes =
    mapaPressao ||
    calcularMapaPressao(defensores, marcacaoIndividual, modificadoresPressao);
  const pressaoPortadorDestino = pressoes[zonaDestino]?.pressaoPortador ?? 0;

  const ataqueBruto =
    obterAtributoEfetivo(portador, 'tecnica') * CONDUCAO_CONFIG.pesoTecnica +
    obterAtributoEfetivo(portador, 'velocidade') * CONDUCAO_CONFIG.pesoVelocidade +
    obterAtributoEfetivo(portador, 'dibre') * (CONDUCAO_CONFIG.pesoDibre || 0);

  const base = ehArrancada
    ? habilidadeAtiva.efeito.baseChance
    : CONDUCAO_CONFIG.base;

  const bonusPassivosCond = obterBonusPassivosConducao(portador);
  const ajustesCompletos = [...ajustesChance, ...bonusPassivosCond.ajustes];
  const somaAjustes = ajustesCompletos.reduce((acc, item) => acc + item.valor, 0);

  const chanceBruta =
    base +
    (ataqueBruto - CONDUCAO_CONFIG.referenciaAtributo) *
      CONDUCAO_CONFIG.fatorAtaque -
    pressaoPortadorDestino *
      CONDUCAO_CONFIG.pesoPressao *
      CONDUCAO_CONFIG.fatorPressao +
    somaAjustes;

  const chance = Math.round(limitar(chanceBruta, CHANCE_MINIMA, CHANCE_MAXIMA));

  const deltaFaixa =
    obterFaixa(zonaDestino, timeId) - obterFaixa(portador.zona, timeId);

  const rotuloPadrao =
    deltaFaixa > 0
      ? 'Conduzir (avanço)'
      : deltaFaixa < 0
        ? 'Conduzir (recuo)'
        : 'Conduzir (lateral)';

  const habsAtivas = ehArrancada
    ? [`${habilidadeAtiva.nome} (${portador.nomeCurto}: ${habilidadeAtiva.efeito.rotuloCurto})`]
    : [];
  const habsBonusCondTexto = bonusPassivosCond.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const folegoPortador = calcularCustoEstaminaComHabilidades(portador, 10).habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );

  void aliados;

  const habilidadesAplicadas = juntarHabilidadesUnicas(
    habsAtivas,
    habsBonusCondTexto,
    pressoes[zonaDestino]?.habilidadesPortadorZona,
    folegoPortador,
  );

  return {
    acao: 'conduzir',
    tipo: {
      id: 'conduzir',
      rotulo: ehArrancada ? `${habilidadeAtiva.nome} (2 zonas)` : rotuloPadrao,
      base,
      peso: CONDUCAO_CONFIG.pesoPressao,
    },
    deltaFaixa,
    base,
    peso: CONDUCAO_CONFIG.pesoPressao,
    ataque: arredondar1(ataqueBruto),
    pressaoPortadorOrigem: pressoes[portador.zona]?.pressaoPortador ?? 0,
    pressaoDestino: pressaoPortadorDestino,
    zonasIntermediarias: [],
    pressaoIntermediaria: 0,
    pressaoTotal: pressaoPortadorDestino,
    ajustesChance: ajustesCompletos,
    somaAjustes,
    habilidadeAtivaId: habilidadeAtiva?.id || null,
    habilidadesAplicadas,
    jogadoresFadiga: [resumirFadigaJogador(portador, 'Portador')].filter(Boolean),
    chance,
    classificacao: classificarRisco(chance),
  };
}

// ============================================================================
// Cálculo de Dibre (Partir pra cima do marcador na zona ou avançando)
// ============================================================================

/**
 * Dibrar: encara a marcação usando Dibre (55%) + Técnica (25%) + Velocidade (20%).
 * - Na mesma zona (base 74): limpa o marcador para abrir espaço para finalização/passe.
 * - Para zona vizinha (base 70): dribla ganhando terreno rumo ao ataque.
 * Se acertar, concede +12% e −50% pressão no portador na próxima jogada.
 * Se falhar por pouco no terço final, pode sofrer falta perigosa ou pênalti!
 */
export function calcularChanceDibre({
  portador,
  zonaDestino,
  defensores,
  timeId,
  aliados = null,
  mapaPressao = null,
  marcacaoIndividual = null,
  modificadoresPressao = null,
  ajustesChance = [],
}) {
  if (!portador || !zonaDestino || !ZONAS[zonaDestino] || ZONAS[zonaDestino].foraDaGrade) {
    return null;
  }

  const ehMesmaZona = zonaDestino === portador.zona;
  if (!ehMesmaZona && !saoZonasVizinhos(portador.zona, zonaDestino)) {
    return null;
  }

  const pressoes =
    mapaPressao ||
    calcularMapaPressao(defensores, marcacaoIndividual, modificadoresPressao);
  const pressaoPortadorAlvo = pressoes[zonaDestino]?.pressaoPortador ?? 0;

  const ataqueBruto =
    obterAtributoEfetivo(portador, 'dibre') * DIBRE_CONFIG.pesoDibre +
    obterAtributoEfetivo(portador, 'tecnica') * DIBRE_CONFIG.pesoTecnica +
    obterAtributoEfetivo(portador, 'velocidade') * DIBRE_CONFIG.pesoVelocidade;

  const base = ehMesmaZona ? DIBRE_CONFIG.baseMesmaZona : DIBRE_CONFIG.baseAvanco;

  const bonusPassivosCond = obterBonusPassivosConducao(portador);
  const ajustesCompletos = [...ajustesChance, ...bonusPassivosCond.ajustes];
  const somaAjustes = ajustesCompletos.reduce((acc, item) => acc + item.valor, 0);

  const chanceBruta =
    base +
    (ataqueBruto - DIBRE_CONFIG.referenciaAtributo) * DIBRE_CONFIG.fatorAtaque -
    pressaoPortadorAlvo * DIBRE_CONFIG.fatorPressaoPortador +
    somaAjustes;

  const chance = Math.round(limitar(chanceBruta, CHANCE_MINIMA, CHANCE_MAXIMA));

  const deltaFaixa =
    obterFaixa(zonaDestino, timeId) - obterFaixa(portador.zona, timeId);

  const rotulo = ehMesmaZona
    ? 'Dibre curto (limpar marcação)'
    : deltaFaixa > 0
      ? 'Dibre em progressão'
      : 'Dibre de corte';

  const habsBonusCondTexto = bonusPassivosCond.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const folegoPortador = calcularCustoEstaminaComHabilidades(portador, 10).habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );

  void aliados;

  const habilidadesAplicadas = juntarHabilidadesUnicas(
    habsBonusCondTexto,
    pressoes[zonaDestino]?.habilidadesPortadorZona,
    folegoPortador,
  );

  return {
    acao: 'dibrar',
    tipo: {
      id: 'dibrar',
      rotulo,
      base,
      peso: 1,
    },
    ehMesmaZona,
    deltaFaixa,
    base,
    peso: 1,
    ataque: arredondar1(ataqueBruto),
    pressaoPortadorOrigem: pressoes[portador.zona]?.pressaoPortador ?? 0,
    pressaoDestino: pressaoPortadorAlvo,
    zonasIntermediarias: [],
    pressaoIntermediaria: 0,
    pressaoTotal: pressaoPortadorAlvo,
    ajustesChance: ajustesCompletos,
    somaAjustes,
    habilidadeAtivaId: null,
    habilidadesAplicadas,
    jogadoresFadiga: [resumirFadigaJogador(portador, 'Driblador')].filter(Boolean),
    chance,
    classificacao: classificarRisco(chance),
  };
}

// ============================================================================
// Cálculo de Cruzamento na Linha de Fundo / Ala para Cabeceio na Área
// ============================================================================

/**
 * Cruzamento: levantada na área a partir da linha de fundo (Z5-E/Z5-D, base 42)
 * ou ala ofensiva (Z4-E/Z4-D, base 34) para finalização imediata (cabeceio/voleio)
 * de um companheiro posicionado na área (faixa 5 ou Z4-C).
 */
export function calcularChanceCruzamento({
  passador,
  receptor,
  goleiro,
  defensores,
  timeId,
  aliados = null,
  mapaPressao = null,
  marcacaoIndividual = null,
  modificadoresPressao = null,
  ajustesChance = [],
  bonusDefesaGoleiro = 0,
  habilidadesDefesaExtra = [],
}) {
  if (!passador || !receptor || passador.id === receptor.id) return null;
  if (!podeCruzarNaZona(passador.zona, timeId)) return null;
  if (!ehZonaTercoFinal(receptor.zona, timeId)) return null;

  const ehLinhaDeFundo = ehZonaLinhaDeFundo(passador.zona, timeId);
  const base = ehLinhaDeFundo
    ? CRUZAMENTO_CONFIG.baseLinhaDeFundo
    : CRUZAMENTO_CONFIG.baseAlaOfensiva;
  const zonaOrigemPV = zonaParaPontoDeVista(passador.zona, timeId);
  const zonaDestinoPV = zonaParaPontoDeVista(receptor.zona, timeId);
  const rotulo = ehLinhaDeFundo
    ? `Cruzamento da linha de fundo (${zonaOrigemPV}→${zonaDestinoPV})`
    : `Cruzamento na área (${zonaOrigemPV}→${zonaDestinoPV})`;

  const pressoes =
    mapaPressao ||
    calcularMapaPressao(defensores, marcacaoIndividual, modificadoresPressao);

  const { bonusAtributosLinha: bonusAliados, habilidadesAura: aurasAliados } =
    coletarModificadoresPassivosTime(aliados || [passador, receptor]);

  const ataqueCruzador =
    obterAtributoEfetivoComBonus(passador, 'passe', bonusAliados) *
      CRUZAMENTO_CONFIG.pesoPasseCruzador +
    obterAtributoEfetivoComBonus(passador, 'tecnica', bonusAliados) *
      CRUZAMENTO_CONFIG.pesoTecnicaCruzador +
    obterAtributoEfetivoComBonus(passador, 'dibre', bonusAliados) *
      CRUZAMENTO_CONFIG.pesoDibreCruzador;

  const ataqueCabeceador =
    obterAtributoEfetivoComBonus(receptor, 'finalizacao', bonusAliados) *
      CRUZAMENTO_CONFIG.pesoFinalizacaoCabeceador +
    obterAtributoEfetivoComBonus(receptor, 'posicionamento', bonusAliados) *
      CRUZAMENTO_CONFIG.pesoPosicionamentoCabeceador +
    obterAtributoEfetivoComBonus(receptor, 'dominio', bonusAliados) *
      CRUZAMENTO_CONFIG.pesoDominioCabeceador;

  const ataqueBruto = ataqueCruzador * 0.48 + ataqueCabeceador * 0.52;

  const pressaoPortadorOrigem = pressoes[passador.zona]?.pressaoPortador ?? 0;
  const pressaoLinhaDestino = pressoes[receptor.zona]?.pressaoLinha ?? 0;

  const defesaGoleiroBase = goleiro
    ? obterAtributoEfetivo(goleiro, 'defesa')
    : FINALIZACAO_CONFIG.defesaGoleiroPadrao;
  const reflexoGoleiro = obterBonusPassivoDefesaGoleiro(goleiro);
  const defesaGoleiro =
    defesaGoleiroBase + (bonusDefesaGoleiro || 0) + (reflexoGoleiro.bonusDefesa || 0);

  const bonusPassivosFin = obterBonusPassivosFinalizacao(receptor);
  const bonusPassivosPasse = obterBonusPassivosPasse(passador, 'longo');
  const ajustesCompletos = [
    ...ajustesChance,
    ...bonusPassivosFin.ajustes,
    ...bonusPassivosPasse.ajustes,
  ];
  const somaAjustes = ajustesCompletos.reduce((acc, item) => acc + item.valor, 0);

  const chanceBruta =
    base +
    (ataqueBruto - CRUZAMENTO_CONFIG.referenciaAtributo) *
      CRUZAMENTO_CONFIG.fatorAtaque -
    (defesaGoleiro - CRUZAMENTO_CONFIG.referenciaAtributo) *
      CRUZAMENTO_CONFIG.fatorGoleiro -
    pressaoLinhaDestino * CRUZAMENTO_CONFIG.fatorPressaoLinha -
    pressaoPortadorOrigem * CRUZAMENTO_CONFIG.fatorPressaoPortador +
    somaAjustes;

  const chance = Math.round(
    limitar(chanceBruta, FINALIZACAO_CHANCE_MINIMA, FINALIZACAO_CHANCE_MAXIMA),
  );

  const habsAuraTexto = aurasAliados.map(
    (a) => `${a.nome} (${a.jogador}: ${a.detalhe})`,
  );
  const habsBonusFinTexto = bonusPassivosFin.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const habsBonusPasseTexto = bonusPassivosPasse.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const habsReflexoTexto = reflexoGoleiro.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );

  const habilidadesAplicadas = juntarHabilidadesUnicas(
    habsBonusFinTexto,
    habsBonusPasseTexto,
    habsAuraTexto,
    habsReflexoTexto,
    habilidadesDefesaExtra,
    pressoes[passador.zona]?.habilidadesPortadorZona,
    pressoes[receptor.zona]?.habilidadesLinhaZona,
  );

  return {
    acao: 'cruzar',
    tipo: {
      id: 'cruzar',
      rotulo,
      base,
      peso: 1,
    },
    ehLinhaDeFundo,
    base,
    peso: 1,
    ataque: arredondar1(ataqueBruto),
    defesaGoleiro: arredondar1(defesaGoleiro),
    bonusDefesaGoleiro: (bonusDefesaGoleiro || 0) + (reflexoGoleiro.bonusDefesa || 0),
    pressaoPortadorOrigem,
    pressaoDestino: pressaoLinhaDestino,
    zonasIntermediarias: [],
    pressaoIntermediaria: 0,
    pressaoTotal: pressaoLinhaDestino,
    ajustesChance: ajustesCompletos,
    somaAjustes,
    habilidadeAtivaId: null,
    habilidadesAplicadas,
    jogadoresFadiga: [
      resumirFadigaJogador(passador, 'Cruzador'),
      resumirFadigaJogador(receptor, 'Cabeceador'),
      ...(goleiro ? [resumirFadigaJogador(goleiro, 'Goleiro')] : []),
    ].filter(Boolean),
    chance,
    classificacao: classificarRisco(chance),
  };
}

// ============================================================================
// Cálculo de Finalização (Faixa 5, Z4-C, Pênalti, Falta Direta ou Chute de fora)
// ============================================================================

/**
 * Finalização:
 * - Da faixa 5: base 44 no corredor C e 30 nos corredores E/D.
 * - De Z4-C: base 20 (chute da entrada da área).
 * - Habilidade Chute de fora: qualquer zona das faixas 3 e 4 com base 10 (+14% potência).
 * - Bola parada: Pênalti (base 76, sem pressão de linha) ou Falta Direta (base 28 nas faixas 3 e 4).
 */
export function calcularChanceFinalizacao({
  atacante,
  goleiro,
  defensores,
  timeId,
  aliados = null,
  mapaPressao = null,
  marcacaoIndividual = null,
  modificadoresPressao = null,
  ajustesChance = [],
  habilidadeAtiva = null,
  bonusDefesaGoleiro = 0,
  habilidadesDefesaExtra = [],
  modoBolaParada = null,
  tipoChute = 'padrao',
}) {
  const zonaPV = zonaParaPontoDeVista(atacante.zona, timeId);
  const faixa = obterFaixa(atacante.zona, timeId);
  let base = null;
  let rotulo = 'Finalização';

  const ehChuteDeFora = habilidadeAtiva?.efeito?.tipo === 'finalizacao_faixas';
  if (modoBolaParada === 'penalti') {
    base = FINALIZACAO_CONFIG.basePenalti;
    rotulo = 'Cobrança de Pênalti (Z5-C)';
  } else if (modoBolaParada === 'falta_direta' && (faixa === 4 || faixa === 3)) {
    base = FINALIZACAO_CONFIG.baseFaltaDireta;
    rotulo = `Falta Direta (${zonaPV})`;
  } else if (ehChuteDeFora) {
    const permitidas = habilidadeAtiva.efeito.faixasPermitidas || [3, 4];
    if (permitidas.includes(faixa)) {
      base = habilidadeAtiva.efeito.baseChance;
      rotulo = `${habilidadeAtiva.nome} (${zonaPV})`;
    }
  } else if (zonaPV === 'Z5-C') {
    base = FINALIZACAO_CONFIG.baseFaixa5Centro;
    rotulo = 'Finalização na Área (Z5-C)';
  } else if (zonaPV === 'Z5-E' || zonaPV === 'Z5-D') {
    base = FINALIZACAO_CONFIG.baseFaixa5Lado;
    rotulo = `Finalização Diagonal (${zonaPV})`;
  } else if (zonaPV === 'Z4-C') {
    base = FINALIZACAO_CONFIG.baseZ4Centro;
    rotulo = 'Chute da Entrada da Área (Z4-C)';
  }

  if (base === null) return null;

  const pressoes =
    mapaPressao ||
    calcularMapaPressao(defensores, marcacaoIndividual, modificadoresPressao);
  const pressaoBruta = pressoes[atacante.zona]?.pressaoPortador ?? 0;
  const pressaoPortadorZona =
    modoBolaParada === 'penalti'
      ? 0
      : modoBolaParada === 'falta_direta'
        ? Math.round(pressaoBruta * 0.4)
        : pressaoBruta;

  const ataqueBruto =
    obterAtributoEfetivo(atacante, 'finalizacao') * FINALIZACAO_CONFIG.pesoFinalizacao +
    obterAtributoEfetivo(atacante, 'tecnica') * FINALIZACAO_CONFIG.pesoTecnica +
    obterAtributoEfetivo(atacante, 'dibre') * (FINALIZACAO_CONFIG.pesoDibre || 0);
  const defesaGoleiroBase = goleiro
    ? obterAtributoEfetivo(goleiro, 'defesa')
    : FINALIZACAO_CONFIG.defesaGoleiroPadrao;
  const reflexoGoleiro = obterBonusPassivoDefesaGoleiro(goleiro);
  const defesaGoleiro =
    defesaGoleiroBase + (bonusDefesaGoleiro || 0) + (reflexoGoleiro.bonusDefesa || 0);

  const bonusPassivosFin = obterBonusPassivosFinalizacao(atacante);
  const extraChuteFora = ehChuteDeFora
    ? [
        {
          rotulo: 'Potência de longe',
          valor: FINALIZACAO_CONFIG.bonusPotenciaChuteDeFora || 15,
        },
      ]
    : [];
  const extraTipoChute = [];
  if (modoBolaParada !== 'penalti') {
    if (tipoChute === 'colocado') {
      extraTipoChute.push({
        rotulo: 'Chute colocado (precisão)',
        valor: FINALIZACAO_CONFIG.bonusChuteColocado,
      });
    } else if (tipoChute === 'bomba') {
      extraTipoChute.push({
        rotulo: 'Chute bomba (+rebote/escanteio)',
        valor: FINALIZACAO_CONFIG.ajusteChuteBomba,
      });
    }
  }

  const ajustesCompletos = [
    ...ajustesChance,
    ...extraChuteFora,
    ...extraTipoChute,
    ...bonusPassivosFin.ajustes,
  ];
  const somaAjustes = ajustesCompletos.reduce((acc, item) => acc + item.valor, 0);

  const chanceBruta =
    base +
    (ataqueBruto - FINALIZACAO_CONFIG.referenciaAtributo) *
      FINALIZACAO_CONFIG.fatorAtaque -
    (defesaGoleiro - FINALIZACAO_CONFIG.referenciaAtributo) *
      FINALIZACAO_CONFIG.fatorGoleiro -
    pressaoPortadorZona * FINALIZACAO_CONFIG.fatorPressaoPortador +
    somaAjustes;

  const chance = Math.round(
    limitar(chanceBruta, FINALIZACAO_CHANCE_MINIMA, FINALIZACAO_CHANCE_MAXIMA),
  );

  void aliados;

  const habsAtivas = ehChuteDeFora
    ? [`${habilidadeAtiva.nome} (${atacante.nomeCurto}: base ${base})`]
    : [];
  const habsBonusFinTexto = bonusPassivosFin.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const habsReflexoTexto = reflexoGoleiro.habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );
  const folegoAtacante = calcularCustoEstaminaComHabilidades(atacante, 10).habilidades.map(
    (h) => `${h.nome} (${h.jogador}: ${h.detalhe})`,
  );

  const habilidadesAplicadas = juntarHabilidadesUnicas(
    habsAtivas,
    habsBonusFinTexto,
    habsReflexoTexto,
    habilidadesDefesaExtra,
    pressoes[atacante.zona]?.habilidadesPortadorZona,
    folegoAtacante,
  );

  return {
    acao: 'finalizar',
    tipo: {
      id: 'finalizar',
      rotulo,
      base,
      peso: 1,
    },
    modoBolaParada,
    tipoChute,
    base,
    peso: 1,
    ataque: arredondar1(ataqueBruto),
    defesaGoleiro: arredondar1(defesaGoleiro),
    bonusDefesaGoleiro: (bonusDefesaGoleiro || 0) + (reflexoGoleiro.bonusDefesa || 0),
    pressaoPortadorOrigem: pressaoPortadorZona,
    pressaoDestino: pressaoPortadorZona,
    zonasIntermediarias: [],
    pressaoIntermediaria: 0,
    pressaoTotal: pressaoPortadorZona,
    ajustesChance: ajustesCompletos,
    somaAjustes,
    habilidadeAtivaId: habilidadeAtiva?.id || null,
    habilidadesAplicadas,
    jogadoresFadiga: [
      resumirFadigaJogador(atacante, 'Finalizador'),
      ...(goleiro ? [resumirFadigaJogador(goleiro, 'Goleiro')] : []),
    ].filter(Boolean),
    chance,
    classificacao: classificarRisco(chance),
  };
}

/**
 * Classificação textual para acompanhar a cor sem depender apenas de matiz.
 */
export function classificarRisco(chance) {
  if (chance >= 68) {
    return { nivel: 'seguro', rotulo: 'Seguro' };
  }
  if (chance >= 42) {
    return { nivel: 'arriscado', rotulo: 'Arriscado' };
  }
  return { nivel: 'dificil', rotulo: 'Difícil' };
}
