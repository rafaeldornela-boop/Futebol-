/**
 * Compras e evolução das melhorias permanentes do Clube (Torcida, Estádio,
 * Categorias de base, Equipamentos e paletas de Uniforme).
 */

import {
  MELHORIAS_CLUBE,
  PALETAS_UNIFORME,
} from './constantes.js';

export function obterNivelMelhoria(meta, melhoriaId) {
  return Math.max(0, Number(meta?.melhorias?.[melhoriaId]) || 0);
}

export function obterCustoProximaMelhoria(meta, melhoriaId) {
  const def = MELHORIAS_CLUBE[melhoriaId];
  if (!def) return null;
  const nivelAtual = obterNivelMelhoria(meta, melhoriaId);
  if (nivelAtual >= def.maxNivel) return null;
  return def.custos[nivelAtual] ?? null;
}

export function comprarMelhoriaClube(meta, melhoriaId) {
  const def = MELHORIAS_CLUBE[melhoriaId];
  if (!def || !meta) {
    return { valido: false, motivo: 'Melhoria inválida.' };
  }

  const nivelAtual = obterNivelMelhoria(meta, melhoriaId);
  if (nivelAtual >= def.maxNivel) {
    return { valido: false, motivo: `${def.nome} já está no nível máximo (${def.maxNivel}).` };
  }

  const custo = def.custos[nivelAtual];
  if ((meta.pontosLegado || 0) < custo) {
    return {
      valido: false,
      motivo: `Pontos insuficientes para ${def.nome} (precisa de ${custo} pts).`,
    };
  }

  meta.pontosLegado -= custo;
  if (!meta.melhorias) meta.melhorias = {};
  meta.melhorias[melhoriaId] = nivelAtual + 1;

  return {
    valido: true,
    melhoriaId,
    novoNivel: nivelAtual + 1,
    custo,
    resumo: `${def.nome} evoluída para o nível ${nivelAtual + 1} (−${custo} pts).`,
  };
}

export function uniformeEstaDesbloqueado(meta, paletaId) {
  const paleta = PALETAS_UNIFORME[paletaId];
  if (!paleta) return false;
  if (paleta.gratuita) return true;
  return Array.isArray(meta?.uniformesDesbloqueados) && meta.uniformesDesbloqueados.includes(paletaId);
}

export function comprarOuEquiparUniforme(meta, paletaId) {
  const paleta = PALETAS_UNIFORME[paletaId];
  if (!paleta || !meta) {
    return { valido: false, motivo: 'Paleta de uniforme inválida.' };
  }

  if (uniformeEstaDesbloqueado(meta, paletaId)) {
    meta.uniformeEquipado = paletaId;
    return {
      valido: true,
      acao: 'equipado',
      paleta,
      resumo: `Uniforme ${paleta.nome} equipado nos chips do seu time.`,
    };
  }

  if ((meta.pontosLegado || 0) < paleta.custo) {
    return {
      valido: false,
      motivo: `Pontos insuficientes para o uniforme ${paleta.nome} (precisa de ${paleta.custo} pts).`,
    };
  }

  meta.pontosLegado -= paleta.custo;
  if (!Array.isArray(meta.uniformesDesbloqueados)) {
    meta.uniformesDesbloqueados = ['padrao'];
  }
  if (!meta.uniformesDesbloqueados.includes(paletaId)) {
    meta.uniformesDesbloqueados.push(paletaId);
  }
  meta.uniformeEquipado = paletaId;

  return {
    valido: true,
    acao: 'comprado',
    paleta,
    custo: paleta.custo,
    resumo: `Uniforme ${paleta.nome} desbloqueado e equipado (−${paleta.custo} pts).`,
  };
}
