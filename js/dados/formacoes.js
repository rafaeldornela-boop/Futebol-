/**
 * Formações táticas por fases de jogo (ATRÁS, MEIO, FRENTE):
 * - 4-3-3 (Equilibrado)
 * - 4-4-2 (Dupla de Ataque)
 * - 3-5-2 (Três Zagueiros e Alas)
 * - 4-2-3-1 (Meia Central e Pivô Duplo)
 *
 * Regras estruturais:
 * - Atrás: bloco compacto nas faixas 1 e 2.
 * - Meio: linhas nas faixas 2 e 3.
 * - Frente: time sobe até a faixa 5.
 * - Sempre pelo menos 1 jogador de cobertura em Z1-C (ZAG1), em todas as fases.
 * - No máximo 3 jogadores por zona.
 * - Jogador escalado fora da posição natural perde 8% em todos os atributos.
 *
 * TODAS as constantes ficam centralizadas no topo deste arquivo.
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
import {
  obterDeslocamentoPosturaJogador,
  obterMultiplicadorDeslocamentoPostura,
  POSTURA_PADRAO,
} from '../regras/postura.js';

// ============================================================================
// Constantes de Calibração (centralizadas no topo)
// ============================================================================

export const FORMACAO_PADRAO = '4-3-3';
export const PENALIDADE_FORA_POSICAO = 0.08;
export const FATOR_ATRIBUTO_FORA_POSICAO = 0.92;
export const MAX_JOGADORES_POR_ZONA = 3;

export const IDS_FORMACOES = Object.freeze([
  '4-3-3',
  '4-4-2',
  '3-5-2',
  '4-2-3-1',
]);

export const ROTULOS_PAPEIS = Object.freeze({
  GOL: 'GOL',
  ZAG1: 'ZAG (Cob.)',
  ZAG2: 'ZAG',
  ZAG3: 'ZAG D',
  LAT_E: 'LAT E',
  LAT_D: 'LAT D',
  ALA_E: 'ALA E',
  ALA_D: 'ALA D',
  VOL: 'VOL',
  VOL1: 'VOL 1',
  VOL2: 'VOL 2',
  MEI_E: 'MEI E',
  MEI_C: 'MEI C',
  MEI_D: 'MEI D',
  PONTA_E: 'PONTA E',
  PONTA_D: 'PONTA D',
  CA: 'CA',
  ATA1: 'ATA 1',
  ATA2: 'ATA 2',
});

export const POSICOES_NATURAIS_PAPEL = Object.freeze({
  GOL: ['GOL'],
  ZAG1: ['ZAG'],
  ZAG2: ['ZAG'],
  ZAG3: ['ZAG'],
  LAT_E: ['LE'],
  LAT_D: ['LD'],
  ALA_E: ['LE'],
  ALA_D: ['LD'],
  VOL: ['VOL'],
  VOL1: ['VOL'],
  VOL2: ['VOL'],
  MEI_E: ['ME'],
  MEI_D: ['MD'],
  MEI_C: ['ME', 'MD'],
  PONTA_E: ['PE'],
  PONTA_D: ['PD'],
  CA: ['CA'],
  ATA1: ['CA', 'PE', 'PD'],
  ATA2: ['CA', 'PE', 'PD'],
});

export const POSICOES_PREFERIDAS_PAPEL = Object.freeze({
  GOL: ['GOL'],
  ZAG1: ['ZAG'],
  ZAG2: ['ZAG'],
  ZAG3: ['ZAG'],
  LAT_E: ['LE', 'LD'],
  LAT_D: ['LD', 'LE'],
  ALA_E: ['LE', 'LD', 'PE'],
  ALA_D: ['LD', 'LE', 'PD'],
  VOL: ['VOL', 'ME', 'MD'],
  VOL1: ['VOL', 'ME', 'MD'],
  VOL2: ['VOL', 'ME', 'MD'],
  MEI_E: ['ME', 'MD', 'VOL'],
  MEI_D: ['MD', 'ME', 'VOL'],
  MEI_C: ['ME', 'MD', 'VOL'],
  PONTA_E: ['PE', 'PD', 'CA'],
  PONTA_D: ['PD', 'PE', 'CA'],
  CA: ['CA', 'PE', 'PD'],
  ATA1: ['CA', 'PE', 'PD'],
  ATA2: ['CA', 'PE', 'PD'],
});

export const SETOR_DO_PAPEL = Object.freeze({
  GOL: 'GOL',
  ZAG1: 'DEF',
  ZAG2: 'DEF',
  ZAG3: 'DEF',
  LAT_E: 'DEF',
  LAT_D: 'DEF',
  ALA_E: 'DEF',
  ALA_D: 'DEF',
  VOL: 'MEI',
  VOL1: 'MEI',
  VOL2: 'MEI',
  MEI_E: 'MEI',
  MEI_C: 'MEI',
  MEI_D: 'MEI',
  PONTA_E: 'ATA',
  PONTA_D: 'ATA',
  CA: 'ATA',
  ATA1: 'ATA',
  ATA2: 'ATA',
});

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

export const PAPEIS_442 = Object.freeze([
  'GOL',
  'LAT_E',
  'ZAG1',
  'ZAG2',
  'LAT_D',
  'VOL1',
  'VOL2',
  'MEI_E',
  'MEI_D',
  'ATA1',
  'ATA2',
]);

export const PAPEIS_352 = Object.freeze([
  'GOL',
  'ZAG2',
  'ZAG1',
  'ZAG3',
  'ALA_E',
  'VOL',
  'ALA_D',
  'MEI_E',
  'MEI_D',
  'ATA1',
  'ATA2',
]);

export const PAPEIS_4231 = Object.freeze([
  'GOL',
  'LAT_E',
  'ZAG1',
  'ZAG2',
  'LAT_D',
  'VOL1',
  'VOL2',
  'MEI_E',
  'MEI_C',
  'MEI_D',
  'CA',
]);

// ============================================================================
// Resolvedores de Zona-Base por Formação (ponto de vista do time)
// ============================================================================

function resolverZona433(papel, fase, corredorBolaPV) {
  switch (papel) {
    case 'GOL':
      return 'GK';
    case 'ZAG1':
      return 'Z1-C';
    case 'ZAG2':
      return fase === 'frente' ? 'Z2-C' : 'Z1-C';
    case 'LAT_E':
      if (fase === 'atras') return 'Z1-E';
      if (fase === 'meio') return 'Z2-E';
      return corredorBolaPV === 'D' ? 'Z2-E' : 'Z3-E';
    case 'LAT_D':
      if (fase === 'atras') return 'Z1-D';
      if (fase === 'meio') return 'Z2-D';
      return corredorBolaPV === 'E' ? 'Z2-D' : 'Z3-D';
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

function resolverZona442(papel, fase, corredorBolaPV) {
  switch (papel) {
    case 'GOL':
      return 'GK';
    case 'ZAG1':
      return 'Z1-C';
    case 'ZAG2':
      return fase === 'frente' ? 'Z2-C' : 'Z1-C';
    case 'LAT_E':
      if (fase === 'atras') return 'Z1-E';
      if (fase === 'meio') return 'Z2-E';
      return corredorBolaPV === 'D' ? 'Z2-E' : 'Z3-E';
    case 'LAT_D':
      if (fase === 'atras') return 'Z1-D';
      if (fase === 'meio') return 'Z2-D';
      return corredorBolaPV === 'E' ? 'Z2-D' : 'Z3-D';
    case 'VOL1':
      if (fase === 'atras') return 'Z1-C';
      if (fase === 'meio') return 'Z2-C';
      return 'Z3-C';
    case 'VOL2':
      if (fase === 'atras') return 'Z2-C';
      if (fase === 'meio') return 'Z3-C';
      return 'Z3-C';
    case 'MEI_E':
      if (fase === 'atras') return 'Z2-E';
      if (fase === 'meio') return 'Z3-E';
      return 'Z4-E';
    case 'MEI_D':
      if (fase === 'atras') return 'Z2-D';
      if (fase === 'meio') return 'Z3-D';
      return 'Z4-D';
    case 'ATA1':
      if (fase === 'atras') return 'Z3-E';
      if (fase === 'meio') return 'Z4-E';
      return 'Z5-C';
    case 'ATA2':
      if (fase === 'atras') return 'Z3-D';
      if (fase === 'meio') return 'Z4-D';
      return 'Z5-C';
    default:
      return 'Z3-C';
  }
}

function resolverZona352(papel, fase, corredorBolaPV) {
  switch (papel) {
    case 'GOL':
      return 'GK';
    case 'ZAG1':
      return 'Z1-C';
    case 'ZAG2':
      return fase === 'frente' ? 'Z2-E' : 'Z1-E';
    case 'ZAG3':
      return fase === 'frente' ? 'Z2-D' : 'Z1-D';
    case 'ALA_E':
      if (fase === 'atras') return 'Z2-E';
      if (fase === 'meio') return 'Z3-E';
      return corredorBolaPV === 'D' ? 'Z3-E' : 'Z4-E';
    case 'ALA_D':
      if (fase === 'atras') return 'Z2-D';
      if (fase === 'meio') return 'Z3-D';
      return corredorBolaPV === 'E' ? 'Z3-D' : 'Z4-D';
    case 'VOL':
      if (fase === 'atras') return 'Z1-C';
      if (fase === 'meio') return 'Z2-C';
      return 'Z3-C';
    case 'MEI_E':
      if (fase === 'atras') return 'Z2-C';
      if (fase === 'meio') return 'Z3-C';
      return 'Z4-E';
    case 'MEI_D':
      if (fase === 'atras') return 'Z2-C';
      if (fase === 'meio') return 'Z3-C';
      return 'Z4-D';
    case 'ATA1':
      if (fase === 'atras') return 'Z3-E';
      if (fase === 'meio') return 'Z4-C';
      return 'Z5-C';
    case 'ATA2':
      if (fase === 'atras') return 'Z3-D';
      if (fase === 'meio') return 'Z4-C';
      return 'Z5-C';
    default:
      return 'Z3-C';
  }
}

function resolverZona4231(papel, fase, corredorBolaPV) {
  switch (papel) {
    case 'GOL':
      return 'GK';
    case 'ZAG1':
      return 'Z1-C';
    case 'ZAG2':
      return fase === 'frente' ? 'Z2-C' : 'Z1-C';
    case 'LAT_E':
      if (fase === 'atras') return 'Z1-E';
      if (fase === 'meio') return 'Z2-E';
      return corredorBolaPV === 'D' ? 'Z2-E' : 'Z3-E';
    case 'LAT_D':
      if (fase === 'atras') return 'Z1-D';
      if (fase === 'meio') return 'Z2-D';
      return corredorBolaPV === 'E' ? 'Z2-D' : 'Z3-D';
    case 'VOL1':
      if (fase === 'atras') return 'Z1-C';
      if (fase === 'meio') return 'Z2-C';
      return 'Z3-C';
    case 'VOL2':
      if (fase === 'atras') return 'Z2-C';
      if (fase === 'meio') return 'Z3-C';
      return 'Z3-C';
    case 'MEI_E':
      if (fase === 'atras') return 'Z2-E';
      if (fase === 'meio') return 'Z3-E';
      return 'Z4-E';
    case 'MEI_C':
      if (fase === 'atras') return 'Z2-C';
      if (fase === 'meio') return 'Z4-C';
      return 'Z4-C';
    case 'MEI_D':
      if (fase === 'atras') return 'Z2-D';
      if (fase === 'meio') return 'Z3-D';
      return 'Z4-D';
    case 'CA':
      if (fase === 'atras') return 'Z3-C';
      return 'Z5-C';
    default:
      return 'Z3-C';
  }
}

export const FORMACOES = Object.freeze({
  '4-3-3': {
    id: '4-3-3',
    nome: '4-3-3 Clássico',
    nomeCurto: '4-3-3',
    descricao: '2 ZAG · 2 LAT · 1 VOL · 2 MEI · 2 Pontas · 1 CA',
    papeis: PAPEIS_433,
    resolverZonaBase: resolverZona433,
  },
  '4-4-2': {
    id: '4-4-2',
    nome: '4-4-2 Dupla de Ataque',
    nomeCurto: '4-4-2',
    descricao: '2 ZAG · 2 LAT · 2 VOL · 2 MEI abertos · 2 ATA',
    papeis: PAPEIS_442,
    resolverZonaBase: resolverZona442,
  },
  '3-5-2': {
    id: '3-5-2',
    nome: '3-5-2 Três Zagueiros',
    nomeCurto: '3-5-2',
    descricao: '3 ZAG · 2 Alas (LE/LD) · 1 VOL · 2 MEI · 2 ATA',
    papeis: PAPEIS_352,
    resolverZonaBase: resolverZona352,
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    nome: '4-2-3-1 Meia Central',
    nomeCurto: '4-2-3-1',
    descricao: '2 ZAG · 2 LAT · 2 VOL · 3 MEI (E, C, D) · 1 CA',
    papeis: PAPEIS_4231,
    resolverZonaBase: resolverZona4231,
  },
});

// ============================================================================
// Funções Puras de Formação e Movimento
// ============================================================================

export function obterFormacao(idFormacao) {
  return FORMACOES[idFormacao] || FORMACOES[FORMACAO_PADRAO];
}

export function obterPapeisFormacao(idFormacao) {
  return obterFormacao(idFormacao).papeis;
}

/**
 * Verifica se o jogador atua na sua posição natural no papel informado.
 */
export function ehPosicaoNatural(jogador, papel) {
  if (!jogador || !papel) return true;
  if (papel === 'GOL') return Boolean(jogador.ehGoleiro);
  if (jogador.ehGoleiro) return false;
  const naturais = POSICOES_NATURAIS_PAPEL[papel];
  if (!naturais || naturais.length === 0) return true;
  return naturais.includes(jogador.posicao);
}

export function atualizarStatusPosicaoJogador(jogador) {
  if (!jogador) return false;
  const fora = !ehPosicaoNatural(jogador, jogador.papel);
  jogador.foraDePosicao = fora;
  return fora;
}

/**
 * Sorteia uma formação com peso igual entre as 4 disponíveis.
 * Aceita seed (string) ou função rng.
 */
export function sortearFormacaoPorSeed(seedOuRng) {
  let valor = 0;
  if (typeof seedOuRng === 'function') {
    valor = seedOuRng();
  } else {
    const str = String(seedOuRng || 'PADRAO');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    valor = (h >>> 0) / 4294967296;
  }
  const idx = Math.max(0, Math.min(IDS_FORMACOES.length - 1, Math.floor(valor * IDS_FORMACOES.length)));
  return IDS_FORMACOES[idx];
}

function pontuarCompatibilidadePapel(jogador, papel) {
  if (papel === 'GOL') return jogador.ehGoleiro ? 1000 : -1e6;
  if (jogador.ehGoleiro) return -1e6;
  const naturais = POSICOES_NATURAIS_PAPEL[papel] || [];
  if (naturais[0] === jogador.posicao) return 120;
  if (naturais.includes(jogador.posicao)) return 100;
  const pref = POSICOES_PREFERIDAS_PAPEL[papel] || [];
  if (pref.includes(jogador.posicao)) return 55;
  if (jogador.setor && jogador.setor === SETOR_DO_PAPEL[papel]) return 30;
  return 0;
}

/**
 * Reorganiza um time (11 titulares + eventuais reservas) para atuar na formação informada,
 * atribuindo papéis compatíveis e marcando `foraDePosicao` quando aplicável.
 */
export function aplicarFormacaoNoTime(time, idFormacao = FORMACAO_PADRAO) {
  if (!time) return time;
  const formacao = obterFormacao(idFormacao);
  time.formacao = formacao.id;

  const pool = [...(time.jogadores || []), ...(time.reservas || [])].filter(
    (j) => !j.extras?.substituido && !j.extras?.cartoes?.vermelho,
  );
  const usados = new Set();
  const novosTitulares = [];

  for (const papel of formacao.papeis) {
    const candidatos = pool
      .filter((j) => !usados.has(j.id))
      .sort(
        (a, b) =>
          pontuarCompatibilidadePapel(b, papel) - pontuarCompatibilidadePapel(a, papel),
      );
    if (candidatos.length > 0) {
      const escolhido = candidatos[0];
      usados.add(escolhido.id);
      escolhido.papel = papel;
      escolhido.ehReserva = false;
      escolhido.iniciaComBola = papel === 'ZAG1';
      atualizarStatusPosicaoJogador(escolhido);
      novosTitulares.push(escolhido);
    }
  }

  const novasReservas = pool
    .filter((j) => !usados.has(j.id))
    .map((j) => {
      j.ehReserva = true;
      j.iniciaComBola = false;
      j.foraDePosicao = false;
      j.zona = null;
      j.zonaBase = null;
      return j;
    });

  time.jogadores = novosTitulares;
  if (Array.isArray(time.reservas)) {
    time.reservas = novasReservas;
  }

  return time;
}

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
 * Calcula a zona-base real no campo para um jogador do time (`meuTime` ou `rival`),
 * aplicando balanço defensivo dos laterais/alas, postura tática (meio/frente) e espelhamento.
 */
export function obterZonaBaseJogador(
  jogador,
  zonaBola,
  timeId,
  idFormacao = FORMACAO_PADRAO,
  deslocamentoFaixa = 0,
  posturaId = POSTURA_PADRAO,
) {
  const formacao = obterFormacao(idFormacao);
  const fase = obterFaseParaTime(zonaBola, timeId);
  const zonaBolaPV = zonaParaPontoDeVista(zonaBola, timeId);
  const corredorBolaPV = obterCorredor(zonaBolaPV, 'meuTime');
  const zonaBasePV = formacao.resolverZonaBase(jogador.papel, fase, corredorBolaPV);
  let zonaReal = converterDoPontoDeVista(zonaBasePV, timeId);

  if (!jogador.ehGoleiro) {
    const deltaPostura = obterDeslocamentoPosturaJogador(posturaId, jogador.papel, fase);
    const deltaTotal = deltaPostura + (deslocamentoFaixa || 0);
    if (deltaTotal !== 0) {
      zonaReal = deslocarZonaNaFaixa(zonaReal, deltaTotal, timeId);
    }
  }

  return zonaReal;
}

/**
 * Simula quanto cada jogador mudará de zona-base com o deslocamento e postura informados,
 * sem alterar o estado do time.
 */
export function simularDeslocamentoBloco(
  time,
  timeId,
  zonaBola,
  idFormacao = FORMACAO_PADRAO,
  deslocamentoFaixa = 0,
  reducaoMeta = 0,
  posturaId = POSTURA_PADRAO,
) {
  const multPostura = obterMultiplicadorDeslocamentoPostura(posturaId);
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
      posturaId,
    );
    const custoBase = calcularCustoDeslocamentoFaixa(zonaAnterior, novaZona, timeId);
    const custoBruto = Number((custoBase * multPostura).toFixed(2));
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
 * Quando `cobrarDeslocamento` é true, desconta estamina por faixa mudada (×1,5 em postura ofensiva).
 */
export function aplicarMovimentoDeTurno(
  time,
  timeId,
  zonaBola,
  portadorId = null,
  idFormacao = FORMACAO_PADRAO,
  deslocamentoFaixa = 0,
  { cobrarDeslocamento = false, reducaoMeta = 0, posturaId = POSTURA_PADRAO } = {},
) {
  const deslocamentos = [];
  const multPostura = obterMultiplicadorDeslocamentoPostura(posturaId);

  for (const jogador of time.jogadores) {
    if (jogador.extras?.cartoes?.vermelho) {
      jogador.zona = null;
      jogador.zonaBase = null;
      continue;
    }

    atualizarStatusPosicaoJogador(jogador);
    const zonaBaseAnterior = jogador.zonaBase;
    const zonaBase = obterZonaBaseJogador(
      jogador,
      zonaBola,
      timeId,
      idFormacao,
      deslocamentoFaixa,
      posturaId,
    );

    if (cobrarDeslocamento && !jogador.ehGoleiro && zonaBaseAnterior) {
      const custoBase = calcularCustoDeslocamentoFaixa(zonaBaseAnterior, zonaBase, timeId);
      const custoBruto = Number((custoBase * multPostura).toFixed(2));
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
