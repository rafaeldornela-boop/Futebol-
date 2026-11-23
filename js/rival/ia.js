/**
 * Inteligência artificial do time rival (Ferroviária Sul).
 *
 * Usa as mesmas regras da partida e escolhe a jogada com peso proporcional
 * à chance, dando um pequeno peso extra para jogadas para frente.
 * Também decide o uso de habilidades ativas ofensivas (25% quando aplicável).
 */

import { obterFaixa } from '../dados/zonas.js';
import {
  listarOpcoesHabilidadesPortador,
  listarOpcoesLegais,
  obterPortador,
} from '../regras/partida.js';

export const PROBABILIDADE_HABILIDADE_RIVAL = 0.25;

function ponderarOpcoes(opcoes, faixaOrigem, timeId) {
  return opcoes.map((previa) => {
    let multiplicador = 1.0;

    if (previa.acao === 'passe' && previa.receptor) {
      const faixaDestino = obterFaixa(previa.receptor.zona, timeId);
      const deltaFaixa = faixaDestino - faixaOrigem;
      if (deltaFaixa > 0) multiplicador = 1.3;
      else if (deltaFaixa < 0) multiplicador = 0.8;
      if (previa.receptor.ehGoleiro) multiplicador *= 0.45;
    } else if (previa.acao === 'conduzir') {
      const deltaFaixa = previa.calculo.deltaFaixa ?? 0;
      multiplicador = deltaFaixa > 0 ? 1.3 : 0.9;
    } else if (previa.acao === 'finalizar') {
      multiplicador = 1.4;
    }

    return {
      previa,
      peso: Math.max(1, previa.calculo.chance * multiplicador),
    };
  });
}

function sortearPonderada(ponderadas, rng) {
  const somaPesos = ponderadas.reduce((acc, item) => acc + item.peso, 0);
  let sorteio = rng() * somaPesos;

  for (const opcao of ponderadas) {
    sorteio -= opcao.peso;
    if (sorteio <= 0) {
      return opcao.previa;
    }
  }

  return ponderadas[ponderadas.length - 1].previa;
}

/**
 * Escolhe uma jogada válida para o time com a bola usando o algoritmo padrão da IA
 * (peso proporcional à chance, leve bônus para progressão e 25% de chance de habilidade ativa).
 */
export function escolherJogadaIA(
  estado,
  rng = Math.random,
  { rngHabilidade = rng } = {},
) {
  if (estado.encerrada || !estado.timeComBola) {
    return null;
  }

  const timeId = estado.timeComBola;
  const portador = obterPortador(estado);
  if (!portador) return null;

  const faixaOrigem = obterFaixa(portador.zona, timeId);

  const opcoesHabilidade = listarOpcoesHabilidadesPortador(estado);
  if (
    opcoesHabilidade.length > 0 &&
    rngHabilidade() < PROBABILIDADE_HABILIDADE_RIVAL
  ) {
    const ponderadasHab = ponderarOpcoes(opcoesHabilidade, faixaOrigem, timeId);
    return sortearPonderada(ponderadasHab, rng);
  }

  const opcoesLegais = listarOpcoesLegais(estado);
  if (opcoesLegais.length === 0) return null;

  const ponderadas = ponderarOpcoes(opcoesLegais, faixaOrigem, timeId);
  return sortearPonderada(ponderadas, rng);
}

/**
 * Escolhe uma jogada válida para o portador atual do time rival
 * com peso proporcional à chance e leve bônus para progressão ofensiva.
 * Com 25% de chance (quando aplicável), utiliza uma habilidade ativa ofensiva.
 */
export function escolherJogadaRival(
  estado,
  rng = Math.random,
  opcoes = {},
) {
  if (estado.encerrada || estado.timeComBola !== 'rival') {
    return null;
  }
  return escolherJogadaIA(estado, rng, opcoes);
}
