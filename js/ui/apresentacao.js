/**
 * Camada independente de apresentação qualitativa e leitura de olheiro.
 *
 * Responsabilidade:
 * - Traduzir atributos internos (0..100) em faixas qualitativas de futebol
 *   (muito fraco -> excepcional) para a UI de gameplay.
 * - Traduzir chances de jogada (0..100) em leitura qualitativa de oportunidade
 *   (muito seguro -> muito arriscado) + barra visual de leitura rápida.
 * - Traduzir pressão de zona, nível funcional e potencial de olheiro sem expor
 *   números crus na experiência normal (números exatos ficam no Debug e Simulador).
 */

import {
  avaliarFamiliaridadePosicao,
  calcularAvaliacaoPosicional,
  extrairDestaquesIndividuais,
  obterAtributoMental,
  ROTULOS_PE_DOMINANTE,
} from '../jogador/identidade.js';
import { classificarPotencialOlheiro } from '../jogador/desenvolvimento.js';

export const FAIXAS_ATRIBUTO_QUALITATIVO = Object.freeze([
  { id: 'excepcional', min: 80, rotulo: 'Excepcional', curto: 'Excep.', nivelCor: 'excepcional' },
  { id: 'excelente', min: 70, rotulo: 'Excelente', curto: 'Excel.', nivelCor: 'excelente' },
  { id: 'muito_bom', min: 60, rotulo: 'Muito bom', curto: 'M. Bom', nivelCor: 'muito-bom' },
  { id: 'bom', min: 50, rotulo: 'Bom', curto: 'Bom', nivelCor: 'bom' },
  { id: 'razoavel', min: 40, rotulo: 'Razoável', curto: 'Razoáv.', nivelCor: 'razoavel' },
  { id: 'fraco', min: 30, rotulo: 'Fraco', curto: 'Fraco', nivelCor: 'fraco' },
  { id: 'muito_fraco', min: 0, rotulo: 'Muito fraco', curto: 'M. Fraco', nivelCor: 'muito-fraco' },
]);

export const FAIXAS_OPORTUNIDADE_JOGADA = Object.freeze([
  { id: 'muito_seguro', min: 78, rotulo: 'Muito seguro', curto: 'Muito seguro', nivel: 'seguro', barras: 5 },
  { id: 'boa_oportunidade', min: 62, rotulo: 'Boa oportunidade', curto: 'Boa chance', nivel: 'seguro', barras: 4 },
  { id: 'razoavel', min: 48, rotulo: 'Razoável', curto: 'Razoável', nivel: 'arriscado', barras: 3 },
  { id: 'complicado', min: 35, rotulo: 'Complicado', curto: 'Complicado', nivel: 'arriscado', barras: 2 },
  { id: 'arriscado', min: 22, rotulo: 'Arriscado', curto: 'Arriscado', nivel: 'dificil', barras: 1 },
  { id: 'muito_arriscado', min: 0, rotulo: 'Muito arriscado', curto: 'Muito arrisc.', nivel: 'dificil', barras: 1 },
]);

export const ROTULOS_CURTOS_ATRIBUTOS = Object.freeze({
  passe: 'Passe',
  dominio: 'Domínio',
  posicionamento: 'Posicionamento',
  marcacao: 'Marcação',
  interceptacao: 'Interceptação',
  desarme: 'Desarme',
  velocidade: 'Velocidade',
  tecnica: 'Técnica',
  dibre: 'Drible',
  finalizacao: 'Finalização',
  agressividade: 'Agressividade',
  defesa: 'Defesa',
  concentracao: 'Concentração',
});

/**
 * Classifica um valor numérico interno (0..100) em faixa qualitativa.
 */
export function classificarAtributoQualitativo(valor) {
  const num = typeof valor === 'number' && Number.isFinite(valor) ? valor : 45;
  return (
    FAIXAS_ATRIBUTO_QUALITATIVO.find((f) => num >= f.min) ||
    FAIXAS_ATRIBUTO_QUALITATIVO[FAIXAS_ATRIBUTO_QUALITATIVO.length - 1]
  );
}

/**
 * Classifica a chance interna (0..100) de uma jogada em leitura qualitativa de oportunidade.
 */
export function classificarOportunidadeJogada(chance) {
  const num = typeof chance === 'number' && Number.isFinite(chance) ? chance : 50;
  return (
    FAIXAS_OPORTUNIDADE_JOGADA.find((f) => num >= f.min) ||
    FAIXAS_OPORTUNIDADE_JOGADA[FAIXAS_OPORTUNIDADE_JOGADA.length - 1]
  );
}

/**
 * Classifica a pressão defensiva de uma zona (0..100) sem expor percentual cru.
 */
export function classificarPressaoQualitativa(pressao) {
  if (pressao >= 68) return { id: 'sufocante', rotulo: 'Sufocante', curto: 'Alta+' };
  if (pressao >= 58) return { id: 'forte', rotulo: 'Marcação forte', curto: 'Alta' };
  if (pressao >= 44) return { id: 'media', rotulo: 'Marcação média', curto: 'Média' };
  if (pressao >= 28) return { id: 'leve', rotulo: 'Espaço aberto', curto: 'Leve' };
  return { id: 'livre', rotulo: 'Zona livre', curto: 'Livre' };
}

/**
 * Classifica o nível funcional posicional do jogador (sem mostrar "OVR 48").
 */
export function classificarNivelJogador(jogador, papelOpcional = null) {
  const nota = calcularAvaliacaoPosicional(jogador, papelOpcional);
  const faixa = classificarAtributoQualitativo(nota);
  return {
    ...faixa,
    notaInterna: nota,
  };
}

/**
 * Classifica o risco de cartão numa falta tática sem expor porcentagem crua.
 */
export function classificarRiscoCartao(chanceAmarelo) {
  if (chanceAmarelo >= 42) return 'Risco alto de cartão';
  if (chanceAmarelo >= 28) return 'Risco moderado de cartão';
  return 'Risco baixo de cartão';
}

/**
 * Formata a leitura curta de pé dominante + pé fraco.
 */
export function formatarPeDominante(jogador) {
  const pe = jogador?.peDominante || 'direito';
  const base = ROTULOS_PE_DOMINANTE[pe] || 'Destro';
  if (pe === 'ambidestro') return 'Ambidestro';
  const pf = jogador?.qualidadePeFraco ?? 2;
  const descPf = pf >= 4 ? 'bom pé fraco' : pf <= 2 ? 'pé fraco limitado' : 'pé fraco razoável';
  return `${base} (${descPf})`;
}

/**
 * Gera resumo qualitativo compacto dos pontos fortes e fraquezas do atleta
 * (substitui "PAS 78 · DOM 75 · MAR 72..." na Escalação, Mercado, Treino e Banco).
 */
export function formatarResumoQualitativoJogador(jogador) {
  if (!jogador) return '';
  const { fortes, fracos } = extrairDestaquesIndividuais(jogador);
  const partesFortes = fortes.map((f) => {
    const nome = ROTULOS_CURTOS_ATRIBUTOS[f.chave] || f.chave;
    const nivel = classificarAtributoQualitativo(f.valor).rotulo.toLowerCase();
    return `${nome} ${nivel}`;
  });

  const partesFracos = fracos.slice(0, 1).map((f) => {
    const nome = ROTULOS_CURTOS_ATRIBUTOS[f.chave] || f.chave;
    const nivel = classificarAtributoQualitativo(f.valor).rotulo.toLowerCase();
    return `${nome} ${nivel}`;
  });

  const conc = obterAtributoMental(jogador, 'concentracao');
  const concNivel = classificarAtributoQualitativo(conc).rotulo.toLowerCase();
  const base =
    partesFortes.length > 0
      ? `Forte: ${partesFortes.join(', ')}`
      : `Concentração: ${concNivel}`;

  if (partesFracos.length > 0) {
    return `${base} · Limitação: ${partesFracos[0]}`;
  }
  return `${base} · Foco: ${concNivel}`;
}

/**
 * Gera resumo de identidade para cards (idade, pé dominante, potencial de olheiro, familiaridade).
 */
export function resumirIdentidadeCard(jogador, papelAlvo = null) {
  const nivel = classificarNivelJogador(jogador, papelAlvo);
  const pot = classificarPotencialOlheiro(jogador);
  const fam = papelAlvo ? avaliarFamiliaridadePosicao(jogador, papelAlvo) : null;
  const peCurto = ROTULOS_PE_DOMINANTE[jogador?.peDominante || 'direito'] || 'Destro';
  const idade = jogador?.idade ?? 24;

  return {
    nivel,
    potencial: pot,
    familiaridade: fam,
    peCurto,
    idade,
    linhaMeta: `${idade} anos · ${peCurto} · ${pot.rotulo}`,
  };
}

/**
 * Cria um elemento DOM de barra visual qualitativa de oportunidade (5 segmentos)
 * acompanhada do rótulo qualitativo (sem porcentagem crua).
 */
export function criarIndicadorOportunidadeDOM(chance, { compacto = false } = {}) {
  const op = classificarOportunidadeJogada(chance);
  const wrap = document.createElement('span');
  wrap.className = `indicador-oportunidade nivel-${op.nivel}${compacto ? ' compacto' : ''}`;
  wrap.dataset.oportunidade = op.id;

  const barras = document.createElement('span');
  barras.className = 'oportunidade-barras';
  barras.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 5; i += 1) {
    const seg = document.createElement('span');
    seg.className = `oportunidade-seg${i <= op.barras ? ' ativo' : ''}`;
    barras.appendChild(seg);
  }

  const lbl = document.createElement('span');
  lbl.className = 'oportunidade-rotulo';
  lbl.textContent = compacto ? op.curto : op.rotulo;

  wrap.append(barras, lbl);
  return wrap;
}
