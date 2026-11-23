/**
 * Módulo de estamina, fadiga e custos energéticos das jogadas e ordens defensivas.
 *
 * TODAS as constantes de calibração de estamina ficam centralizadas no topo.
 */

import { obterFaixa } from '../dados/zonas.js';
import { calcularCustoEstaminaComHabilidades } from './habilidades.js';

// ============================================================================
// Constantes de Calibração de Estamina (centralizadas no topo)
// ============================================================================

export const ESTAMINA_MINIMA = 0;
export const ESTAMINA_MAXIMA = 100;
export const ESTAMINA_INICIAL = 100;
export const FATOR_FORA_POSICAO = 0.92;

export const FAIXAS_FADIGA = Object.freeze([
  { min: 70, multiplicador: 1.0, cor: 'verde', rotulo: 'Inteiro' },
  { min: 40, multiplicador: 0.92, cor: 'amarelo', rotulo: 'Cansado' },
  { min: 20, multiplicador: 0.82, cor: 'vermelho', rotulo: 'Exausto' },
  { min: 0, multiplicador: 0.7, cor: 'vermelho', rotulo: 'Esgotado' },
]);

export const CUSTOS_PASSE_ESTAMINA = Object.freeze({
  curto: { passador: 2, receptor: 1 },
  tras: { passador: 2, receptor: 1 },
  lateral: { passador: 2, receptor: 1 },
  frente: { passador: 3, receptor: 2 },
  longo: { passador: 5, receptor: 3 },
  invertido: { passador: 5, receptor: 3 },
});

export const CUSTO_CONDUCAO_ESTAMINA = 6;
export const CUSTO_DIBRE_ESTAMINA = 5;
export const CUSTO_CRUZAMENTO_ESTAMINA = Object.freeze({
  cruzador: 4,
  cabeceador: 3,
});
export const CUSTO_FINALIZACAO_ESTAMINA = 6;
export const CUSTO_DESLOCAMENTO_POR_FAIXA = 1;

export const CUSTOS_ORDEM_DEFENSIVA = Object.freeze({
  pressionar: { quantidade: 2, custoPorJogador: 10 },
  fechar_linha: { quantidade: 2, custoPorJogador: 6 },
  recuar: { quantidade: 0, custoPorJogador: 0 },
  falta_tatica: { quantidade: 1, custoPorJogador: 8 },
  nenhuma: { quantidade: 0, custoPorJogador: 0 },
});

// ============================================================================
// Funções Puras de Estamina e Fadiga
// ============================================================================

export function limitarEstamina(valor) {
  return Math.max(ESTAMINA_MINIMA, Math.min(ESTAMINA_MAXIMA, Math.round(valor * 100) / 100));
}

export function obterEstaminaExata(jogador) {
  if (!jogador) return ESTAMINA_INICIAL;
  const bruta = jogador.extras?.estamina;
  if (typeof bruta !== 'number' || Number.isNaN(bruta)) {
    return ESTAMINA_INICIAL;
  }
  return limitarEstamina(bruta);
}

export function obterEstamina(jogador) {
  return Math.round(obterEstaminaExata(jogador));
}

export function obterFaixaFadiga(jogadorOuEstamina) {
  const estamina =
    typeof jogadorOuEstamina === 'number'
      ? limitarEstamina(jogadorOuEstamina)
      : obterEstamina(jogadorOuEstamina);

  for (const faixa of FAIXAS_FADIGA) {
    if (estamina >= faixa.min) {
      return faixa;
    }
  }
  return FAIXAS_FADIGA[FAIXAS_FADIGA.length - 1];
}

export function obterMultiplicadorFadiga(jogadorOuEstamina) {
  return obterFaixaFadiga(jogadorOuEstamina).multiplicador;
}

export function obterCorEstamina(jogadorOuEstamina) {
  return obterFaixaFadiga(jogadorOuEstamina).cor;
}

export function obterAtributoEfetivo(jogador, chave) {
  const base =
    chave === 'dibre'
      ? (jogador?.atributos?.dibre ?? jogador?.atributos?.tecnica ?? 0)
      : (jogador?.atributos?.[chave] ?? 0);
  const fatorPosicao = jogador?.foraDePosicao ? FATOR_FORA_POSICAO : 1;
  return base * fatorPosicao * obterMultiplicadorFadiga(jogador);
}

export function obterAtributoEfetivoComBonus(jogador, chave, bonusAtributos = null) {
  const extra = !jogador?.ehGoleiro ? bonusAtributos?.[chave] || 0 : 0;
  const valorBruto =
    chave === 'dibre'
      ? (jogador?.atributos?.dibre ?? jogador?.atributos?.tecnica ?? 0)
      : (jogador?.atributos?.[chave] ?? 0);
  const base = valorBruto + extra;
  const fatorPosicao = jogador?.foraDePosicao ? FATOR_FORA_POSICAO : 1;
  return base * fatorPosicao * obterMultiplicadorFadiga(jogador);
}

export function formatarMultiplicador(multiplicador) {
  return `×${multiplicador.toFixed(2).replace('.', ',')}`;
}

export function resumirFadigaJogador(jogador, papel = null) {
  if (!jogador) return null;
  const estamina = obterEstamina(jogador);
  const faixa = obterFaixaFadiga(estamina);
  return {
    id: jogador.id,
    nome: jogador.nomeCurto,
    papel,
    estamina,
    multiplicador: faixa.multiplicador,
    cor: faixa.cor,
  };
}

/**
 * Reduz a estamina de um jogador garantindo limite [0, 100].
 */
export function gastarEstamina(jogador, quantidade) {
  if (!jogador || !quantidade || quantidade <= 0) {
    const atual = obterEstamina(jogador);
    return { anterior: atual, atual, gasto: 0 };
  }
  if (!jogador.extras) jogador.extras = {};
  const anteriorExato = obterEstaminaExata(jogador);
  const atualExato = limitarEstamina(anteriorExato - quantidade);
  jogador.extras.estamina = atualExato;
  return {
    anterior: Math.round(anteriorExato),
    atual: Math.round(atualExato),
    gasto: Math.round((anteriorExato - atualExato) * 100) / 100,
  };
}

/**
 * Calcula e aplica o gasto de estamina de uma jogada ofensiva (mesmo se falhar),
 * considerando custo de habilidade ativa ofensiva, Fôlego e redução da meta-progressão.
 */
export function aplicarCustoEstaminaJogada(previa, reducaoMeta = 0) {
  if (!previa) return [];
  const gastos = [];
  const habAtiva = previa.habilidadeAtiva || null;

  const cobrar = (jogador, papel, custoBruto) => {
    const { custoFinal, habilidades } = calcularCustoEstaminaComHabilidades(
      jogador,
      custoBruto,
      reducaoMeta,
    );
    const res = gastarEstamina(jogador, custoFinal);
    gastos.push({
      jogador,
      papel,
      custoBruto,
      custo: custoFinal,
      habilidadesCusto: habilidades,
      ...res,
    });
  };

  if (previa.acao === 'passe') {
    const tipoId = previa.calculo?.tipo?.id || 'curto';
    const regra = CUSTOS_PASSE_ESTAMINA[tipoId] || CUSTOS_PASSE_ESTAMINA.curto;
    if (previa.passador) {
      const custoPassador =
        habAtiva && habAtiva.acaoAlvo === 'passe'
          ? habAtiva.custo
          : regra.passador;
      cobrar(previa.passador, 'Passador', custoPassador);
    }
    if (previa.receptor) {
      cobrar(previa.receptor, 'Receptor', regra.receptor);
    }
  } else if (previa.acao === 'conduzir' && previa.passador) {
    const custoCond =
      habAtiva && habAtiva.acaoAlvo === 'conduzir'
        ? habAtiva.custo
        : CUSTO_CONDUCAO_ESTAMINA;
    cobrar(previa.passador, 'Portador', custoCond);
  } else if (previa.acao === 'dibrar' && previa.passador) {
    cobrar(previa.passador, 'Driblador', CUSTO_DIBRE_ESTAMINA);
  } else if (previa.acao === 'cruzar') {
    if (previa.passador) {
      cobrar(previa.passador, 'Cruzador', CUSTO_CRUZAMENTO_ESTAMINA.cruzador);
    }
    if (previa.receptor) {
      cobrar(previa.receptor, 'Cabeceador', CUSTO_CRUZAMENTO_ESTAMINA.cabeceador);
    }
  } else if (previa.acao === 'finalizar' && previa.passador) {
    const custoFin =
      habAtiva && habAtiva.acaoAlvo === 'finalizar'
        ? habAtiva.custo
        : CUSTO_FINALIZACAO_ESTAMINA;
    cobrar(previa.passador, 'Finalizador', custoFin);
  }

  return gastos;
}

/**
 * Calcula quantas faixas a zona-base de um jogador mudou e retorna o custo (1 por faixa).
 */
export function calcularCustoDeslocamentoFaixa(zonaBaseAnterior, zonaBaseNova, timeId) {
  if (!zonaBaseAnterior || !zonaBaseNova || zonaBaseAnterior === zonaBaseNova) {
    return 0;
  }
  const faixaAntes = obterFaixa(zonaBaseAnterior, timeId);
  const faixaDepois = obterFaixa(zonaBaseNova, timeId);
  return Math.abs(faixaDepois - faixaAntes) * CUSTO_DESLOCAMENTO_POR_FAIXA;
}
