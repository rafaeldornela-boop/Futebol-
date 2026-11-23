/**
 * Formação 4-3-3 por fases de jogo (ATRÁS, MEIO, FRENTE),
 * balanço defensivo dos laterais e espelhamento automático para o rival.
 *
 * Estrutura modular preparada para suportar formações adicionais futuras.
 */

import {
  converterDoPontoDeVista,
  deslocarZonaNaFaixa,
  obterCorredor,
  obterFaixa,
  zonaParaPontoDeVista,
} from './zonas.js';
import {
  calcularCustoDeslocamentoFaixa,
  gastarEstamina,
  obterEstamina,
} from '../regras/estamina.js';
import { calcularCustoEstaminaComHabilidades } from '../regras/habilidades.js';

/**
 * Fase do time pela zona da bola do ponto de vista dele:
 * - atras: GK, faixas 1-2
 * - meio: faixa 3
 * - frente: faixas 4-5, GKR
 */
export function obterFaseParaTime(zonaBola, timeId) {
  const faixaPV = obterFaixa(zonaBola, timeId);
  if (faixaPV <= 2) return 'atras';
  if (faixaPV === 3) return 'meio';
  return 'frente';
}

/**
 * Tabela 4-3-3 (atrás / meio / frente) do ponto de vista do time:
 * - Goleiro: GK / GK / GK
 * - Zagueiro 1: Z1-C / Z1-C / Z1-C (sempre de cobertura)
 * - Zagueiro 2: Z1-C / Z1-C / Z2-C
 * - Lateral E: Z1-E / Z2-E / Z3-E
 * - Lateral D: Z1-D / Z2-D / Z3-D
 * - Volante: Z1-C / Z2-C / Z3-C
 * - Meia E: Z2-E / Z3-E / Z4-E
 * - Meia D: Z2-D / Z3-D / Z4-D
 * - Ponta E: Z3-E / Z4-E / Z5-E
 * - Ponta D: Z3-D / Z4-D / Z5-D
 * - Centroavante: Z4-C / Z5-C / Z5-C
 *
 * Balanço defensivo: o lateral do lado oposto ao da bola não passa da faixa 2.
 */
function resolverZona433(papel, fase, corredorBolaPV) {
  switch (papel) {
    case 'GOL':
      return 'GK';
    case 'ZAG1':
      return 'Z1-C';
    case 'ZAG2':
      return fase === 'frente' ? 'Z2-C' : 'Z1-C';
    case 'LAT_E': {
      if (fase === 'atras') return 'Z1-E';
      if (fase === 'meio') return 'Z2-E';
      // Na fase frente, se a bola está no corredor D, o lateral E é o oposto: limita à faixa 2
      return corredorBolaPV === 'D' ? 'Z2-E' : 'Z3-E';
    }
    case 'LAT_D': {
      if (fase === 'atras') return 'Z1-D';
      if (fase === 'meio') return 'Z2-D';
      // Na fase frente, se a bola está no corredor E, o lateral D é o oposto: limita à faixa 2
      return corredorBolaPV === 'E' ? 'Z2-D' : 'Z3-D';
    }
    case 'VOL':
      if (fase === 'atras') return 'Z1-C';
      if (fase === 'meio') return 'Z2-C';
      return 'Z3-C';
    case 'MEI_E':
      if (fase === 'atras') return 'Z2-E';
      if (fase === 'meio') return 'Z3-E';
      return 'Z4-E';
    case 'MEI_D':
      if (fase === 'atras') return 'Z2-D';
      if (fase === 'meio') return 'Z3-D';
      return 'Z4-D';
    case 'PONTA_E':
      if (fase === 'atras') return 'Z3-E';
      if (fase === 'meio') return 'Z4-E';
      return 'Z5-E';
    case 'PONTA_D':
      if (fase === 'atras') return 'Z3-D';
      if (fase === 'meio') return 'Z4-D';
      return 'Z5-D';
    case 'CA':
      return fase === 'atras' ? 'Z4-C' : 'Z5-C';
    default:
      return 'Z3-C';
  }
}

export const PAPEIS_433 = Object.freeze([
  'GOL',
  'LAT_E',
  'ZAG1',
  'ZAG2',
  'LAT_D',
  'VOL',
  'MEI_E',
  'MEI_D',
  'PONTA_E',
  'PONTA_D',
  'CA',
]);

export const FORMACOES = Object.freeze({
  '4-3-3': {
    id: '4-3-3',
    nome: '4-3-3 Equilibrado',
    resolverZonaBase: resolverZona433,
  },
});

/**
 * Calcula a zona-base real no campo para um jogador do time (`meuTime` ou `rival`),
 * aplicando o balanço defensivo dos laterais e o espelhamento automático para o rival.
 */
export function obterZonaBaseJogador(
  jogador,
  zonaBola,
  timeId,
  idFormacao = '4-3-3',
  deslocamentoFaixa = 0,
) {
  const formacao = FORMACOES[idFormacao] || FORMACOES['4-3-3'];
  const fase = obterFaseParaTime(zonaBola, timeId);
  const zonaBolaPV = zonaParaPontoDeVista(zonaBola, timeId);
  const corredorBolaPV = obterCorredor(zonaBolaPV, 'meuTime');
  const zonaBasePV = formacao.resolverZonaBase(jogador.papel, fase, corredorBolaPV);
  const zonaReal = converterDoPontoDeVista(zonaBasePV, timeId);

  if (deslocamentoFaixa !== 0 && !jogador.ehGoleiro) {
    return deslocarZonaNaFaixa(zonaReal, deslocamentoFaixa, timeId);
  }
  return zonaReal;
}

/**
 * Simula quanto cada jogador mudará de zona-base com o deslocamento informado,
 * sem alterar o estado do time.
 */
export function simularDeslocamentoBloco(
  time,
  timeId,
  zonaBola,
  idFormacao = '4-3-3',
  deslocamentoFaixa = 0,
  reducaoMeta = 0,
) {
  const movimentos = [];
  for (const jogador of time.jogadores) {
    if (jogador.ehGoleiro || jogador.extras?.cartoes?.vermelho) continue;
    const zonaAnterior = jogador.zonaBase || jogador.zona;
    const novaZona = obterZonaBaseJogador(
      jogador,
      zonaBola,
      timeId,
      idFormacao,
      deslocamentoFaixa,
    );
    const custoBruto = calcularCustoDeslocamentoFaixa(zonaAnterior, novaZona, timeId);
    if (custoBruto > 0) {
      const { custoFinal: custo, habilidades } = calcularCustoEstaminaComHabilidades(
        jogador,
        custoBruto,
        reducaoMeta,
      );
      movimentos.push({
        jogador,
        zonaAnterior,
        novaZona,
        custoBruto,
        custo,
        habilidadesCusto: habilidades,
        estaminaAtual: obterEstamina(jogador),
      });
    }
  }
  return movimentos;
}

/**
 * Posiciona os jogadores ativos (não expulsos) no início de cada turno.
 * Mantém o portador atual na `zonaBola` para preservar conduções fora da zona-base.
 * Quando `cobrarDeslocamento` é true, desconta 1 de estamina por faixa que o jogador mudou de zona-base.
 */
export function aplicarMovimentoDeTurno(
  time,
  timeId,
  zonaBola,
  portadorId = null,
  idFormacao = '4-3-3',
  deslocamentoFaixa = 0,
  { cobrarDeslocamento = false, reducaoMeta = 0 } = {},
) {
  const deslocamentos = [];

  for (const jogador of time.jogadores) {
    if (jogador.extras?.cartoes?.vermelho) {
      jogador.zona = null;
      jogador.zonaBase = null;
      continue;
    }

    const zonaBaseAnterior = jogador.zonaBase;
    const zonaBase = obterZonaBaseJogador(
      jogador,
      zonaBola,
      timeId,
      idFormacao,
      deslocamentoFaixa,
    );

    if (cobrarDeslocamento && !jogador.ehGoleiro && zonaBaseAnterior) {
      const custoBruto = calcularCustoDeslocamentoFaixa(zonaBaseAnterior, zonaBase, timeId);
      if (custoBruto > 0) {
        const { custoFinal: custo, habilidades } = calcularCustoEstaminaComHabilidades(
          jogador,
          custoBruto,
          reducaoMeta,
        );
        const res = gastarEstamina(jogador, custo);
        deslocamentos.push({
          jogador,
          zonaBaseAnterior,
          zonaBase,
          custoBruto,
          custo,
          habilidadesCusto: habilidades,
          ...res,
        });
      }
    }

    jogador.zonaBase = zonaBase;
    if (portadorId && jogador.id === portadorId) {
      jogador.zona = zonaBola;
    } else {
      jogador.zona = zonaBase;
    }
  }

  return deslocamentos;
}
