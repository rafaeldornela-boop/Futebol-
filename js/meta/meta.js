/**
 * Gerenciador central de Meta-Progressão entre campanhas:
 * - Estado inicial, normalização e persistência segura em localStorage (try/catch)
 * - Exportação e importação em JSON
 * - Cálculo de Pontos de Legado ao fim de cada campanha
 * - Função única modificadoresMeta() consultada por toda a campanha e partida
 */

import { obterHabilidadesDisponiveis } from '../dados/habilidades.js';
import {
  BONUS_RIVAL_POR_DIFICULDADE,
  CLUBES_INICIAIS,
  DIFICULDADE_MAX,
  DIFICULDADE_MIN,
  META_STORAGE_KEY,
  META_VERSAO,
  PACOTES_CONTEUDO,
  PALETAS_UNIFORME,
  PONTOS_LEGADO_CONFIG,
  TECNICOS_CLUBE,
} from './constantes.js';
import {
  clubeEstaDesbloqueado,
  registrarResultadoCampanhaNosDesbloqueios,
  tecnicoEstaDesbloqueado,
} from './desbloqueios.js';
import { uniformeEstaDesbloqueado } from './melhorias.js';

export function criarEstadoMetaInicial() {
  return {
    versao: META_VERSAO,
    pontosLegado: 0,
    pontosTotaisGanhos: 0,
    campanhasJogadas: 0,
    campanhasVencidas: 0,
    dificuldadeMaxDesbloqueada: 0,
    melhorias: {
      torcida: 0,
      estadio: 0,
      base: 0,
      equipamentos: 0,
    },
    uniformesDesbloqueados: ['padrao'],
    uniformeEquipado: 'padrao',
    clubesDesbloqueados: ['equilibrado'],
    clubeSelecionadoPadrao: 'equilibrado',
    tecnicosDesbloqueados: ['padrao'],
    tecnicoSelecionadoPadrao: 'padrao',
    pacotesDesbloqueados: [],
    trofeus: [],
    conquistasDesbloqueadas: [],
    opcoes: {
      relogioDesligado: false,
    },
  };
}

function limitarInt(val, min, max, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

export function normalizarEstadoMeta(bruto) {
  const base = criarEstadoMetaInicial();
  if (!bruto || typeof bruto !== 'object') return base;

  const melhorias = {
    torcida: limitarInt(bruto.melhorias?.torcida, 0, 5, 0),
    estadio: limitarInt(bruto.melhorias?.estadio, 0, 5, 0),
    base: limitarInt(bruto.melhorias?.base, 0, 5, 0),
    equipamentos: limitarInt(bruto.melhorias?.equipamentos, 0, 5, 0),
  };

  const uniformesDesb = Array.isArray(bruto.uniformesDesbloqueados)
    ? bruto.uniformesDesbloqueados.filter((id) => Boolean(PALETAS_UNIFORME[id]))
    : [];
  if (!uniformesDesb.includes('padrao')) uniformesDesb.unshift('padrao');

  const clubesDesb = Array.isArray(bruto.clubesDesbloqueados)
    ? bruto.clubesDesbloqueados.filter((id) => Boolean(CLUBES_INICIAIS[id]))
    : [];
  if (!clubesDesb.includes('equilibrado')) clubesDesb.unshift('equilibrado');

  const tecnicosDesb = Array.isArray(bruto.tecnicosDesbloqueados)
    ? bruto.tecnicosDesbloqueados.filter((id) => Boolean(TECNICOS_CLUBE[id]))
    : [];
  if (!tecnicosDesb.includes('padrao')) tecnicosDesb.unshift('padrao');

  const pacotesDesb = Array.isArray(bruto.pacotesDesbloqueados)
    ? [...new Set(bruto.pacotesDesbloqueados.filter((id) => Boolean(PACOTES_CONTEUDO[id])))]
    : [];

  const uniformeEquipado =
    typeof bruto.uniformeEquipado === 'string' && uniformesDesb.includes(bruto.uniformeEquipado)
      ? bruto.uniformeEquipado
      : 'padrao';

  const clubePadrao =
    typeof bruto.clubeSelecionadoPadrao === 'string' && clubesDesb.includes(bruto.clubeSelecionadoPadrao)
      ? bruto.clubeSelecionadoPadrao
      : 'equilibrado';

  const tecnicoPadrao =
    typeof bruto.tecnicoSelecionadoPadrao === 'string' && tecnicosDesb.includes(bruto.tecnicoSelecionadoPadrao)
      ? bruto.tecnicoSelecionadoPadrao
      : 'padrao';

  const trofeus = Array.isArray(bruto.trofeus)
    ? bruto.trofeus.filter((t) => t && typeof t === 'object')
    : [];

  const conquistas = Array.isArray(bruto.conquistasDesbloqueadas)
    ? [...new Set(bruto.conquistasDesbloqueadas.filter((c) => typeof c === 'string'))]
    : [];

  return {
    versao: META_VERSAO,
    pontosLegado: Math.max(0, Math.floor(Number(bruto.pontosLegado) || 0)),
    pontosTotaisGanhos: Math.max(0, Math.floor(Number(bruto.pontosTotaisGanhos) || 0)),
    campanhasJogadas: Math.max(0, Math.floor(Number(bruto.campanhasJogadas) || 0)),
    campanhasVencidas: Math.max(0, Math.floor(Number(bruto.campanhasVencidas) || 0)),
    dificuldadeMaxDesbloqueada: limitarInt(
      bruto.dificuldadeMaxDesbloqueada,
      DIFICULDADE_MIN,
      DIFICULDADE_MAX,
      0,
    ),
    melhorias,
    uniformesDesbloqueados: [...new Set(uniformesDesb)],
    uniformeEquipado,
    clubesDesbloqueados: [...new Set(clubesDesb)],
    clubeSelecionadoPadrao: clubePadrao,
    tecnicosDesbloqueados: [...new Set(tecnicosDesb)],
    tecnicoSelecionadoPadrao: tecnicoPadrao,
    pacotesDesbloqueados: pacotesDesb,
    trofeus,
    conquistasDesbloqueadas: conquistas,
    opcoes: {
      relogioDesligado: Boolean(bruto.opcoes?.relogioDesligado),
    },
  };
}

export function carregarMeta(storage = globalThis?.localStorage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') {
      return criarEstadoMetaInicial();
    }
    const bruto = storage.getItem(META_STORAGE_KEY);
    if (!bruto) return criarEstadoMetaInicial();
    return normalizarEstadoMeta(JSON.parse(bruto));
  } catch {
    return criarEstadoMetaInicial();
  }
}

export function salvarMeta(meta, storage = globalThis?.localStorage) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function alternarRelogioMeta(
  meta,
  forcarValor = null,
  storage = globalThis?.localStorage,
) {
  if (!meta) return false;
  if (!meta.opcoes) meta.opcoes = { relogioDesligado: false };
  const novoValor =
    typeof forcarValor === 'boolean' ? forcarValor : !meta.opcoes.relogioDesligado;
  meta.opcoes.relogioDesligado = novoValor;
  salvarMeta(meta, storage);
  return novoValor;
}

export function exportarMetaJson(meta) {
  const normalizado = normalizarEstadoMeta(meta);
  return JSON.stringify(
    {
      formato: 'prancheta11_meta_backup',
      versao: META_VERSAO,
      exportadoEm: new Date().toISOString(),
      dados: normalizado,
    },
    null,
    2,
  );
}

export function importarMetaJson(textoJson) {
  try {
    if (typeof textoJson !== 'string' || !textoJson.trim()) {
      return { valido: false, motivo: 'Arquivo JSON vazio.' };
    }
    const parsed = JSON.parse(textoJson);
    if (!parsed || typeof parsed !== 'object') {
      return { valido: false, motivo: 'Formato JSON inválido.' };
    }
    const payload =
      parsed.formato === 'prancheta11_meta_backup' && parsed.dados
        ? parsed.dados
        : parsed;

    const temEstrutura =
      payload &&
      typeof payload === 'object' &&
      ('pontosLegado' in payload || 'melhorias' in payload || 'trofeus' in payload);
    if (!temEstrutura) {
      return {
        valido: false,
        motivo: 'JSON não corresponde a um backup válido do Prancheta 11.',
      };
    }

    return {
      valido: true,
      meta: normalizarEstadoMeta(payload),
    };
  } catch {
    return { valido: false, motivo: 'Não foi possível ler o arquivo JSON selecionado.' };
  }
}

/**
 * Calcula os Pontos de Legado ao fim de cada campanha (mesmo em derrota):
 * pontos = 2 * camadasCompletadas + 3 * vitorias + 1 * empates + 30 (se vencer chefão) + 5 * nivelDificuldade.
 */
export function calcularPontosLegado({
  camadasCompletadas = 0,
  vitorias = 0,
  empates = 0,
  venceuChefao = false,
  dificuldade = 0,
} = {}) {
  const c = Math.max(0, Number(camadasCompletadas) || 0);
  const v = Math.max(0, Number(vitorias) || 0);
  const e = Math.max(0, Number(empates) || 0);
  const dif = limitarInt(dificuldade, DIFICULDADE_MIN, DIFICULDADE_MAX, 0);

  const ptsCamadas = c * PONTOS_LEGADO_CONFIG.porCamada;
  const ptsVitorias = v * PONTOS_LEGADO_CONFIG.porVitoria;
  const ptsEmpates = e * PONTOS_LEGADO_CONFIG.porEmpate;
  const ptsChefao = venceuChefao ? PONTOS_LEGADO_CONFIG.porChefao : 0;
  const ptsDificuldade = dif * PONTOS_LEGADO_CONFIG.porDificuldade;

  const total = ptsCamadas + ptsVitorias + ptsEmpates + ptsChefao + ptsDificuldade;

  return {
    total,
    camadasCompletadas: c,
    vitorias: v,
    empates: e,
    venceuChefao: Boolean(venceuChefao),
    dificuldade: dif,
    parcelas: {
      camadas: ptsCamadas,
      vitorias: ptsVitorias,
      empates: ptsEmpates,
      chefao: ptsChefao,
      dificuldade: ptsDificuldade,
    },
  };
}

/**
 * ÚNICA fonte da verdade para todos os efeitos da meta-progressão na campanha e na partida.
 * O código da campanha e do motor consulta apenas os valores retornados por esta função.
 */
export function modificadoresMeta(metaEstado = null, opcoes = {}) {
  const meta = normalizarEstadoMeta(metaEstado);

  const difMax = meta.dificuldadeMaxDesbloqueada;
  const difSolicitada =
    opcoes?.dificuldade !== undefined && opcoes?.dificuldade !== null
      ? limitarInt(opcoes.dificuldade, DIFICULDADE_MIN, DIFICULDADE_MAX, 0)
      : 0;
  const dificuldade = opcoes?.permitirQualquerDificuldade
    ? difSolicitada
    : Math.min(difSolicitada, difMax);

  const clubeCand = opcoes?.clubeId || meta.clubeSelecionadoPadrao || 'equilibrado';
  const clubeId =
    opcoes?.permitirQualquerClube || clubeEstaDesbloqueado(meta, clubeCand)
      ? CLUBES_INICIAIS[clubeCand]
        ? clubeCand
        : 'equilibrado'
      : 'equilibrado';
  const clube = CLUBES_INICIAIS[clubeId] || CLUBES_INICIAIS.equilibrado;

  const tecCand = opcoes?.tecnicoId || meta.tecnicoSelecionadoPadrao || 'padrao';
  const tecnicoId =
    opcoes?.permitirQualquerTecnico || tecnicoEstaDesbloqueado(meta, tecCand)
      ? TECNICOS_CLUBE[tecCand]
        ? tecCand
        : 'padrao'
      : 'padrao';
  const tecnico = TECNICOS_CLUBE[tecnicoId] || TECNICOS_CLUBE.padrao;

  const uniCand = opcoes?.uniformeId || meta.uniformeEquipado || 'padrao';
  const uniformeId = uniformeEstaDesbloqueado(meta, uniCand) ? uniCand : 'padrao';
  const uniforme = PALETAS_UNIFORME[uniformeId] || PALETAS_UNIFORME.padrao;

  const nivelTorcida = meta.melhorias.torcida;
  const nivelEstadio = meta.melhorias.estadio;
  const nivelBase = meta.melhorias.base;
  const nivelEquipamentos = meta.melhorias.equipamentos;

  const bonusReceitaPct = Number((0.04 * nivelTorcida).toFixed(4));
  const fatorReceita = Number((1 + bonusReceitaPct).toFixed(4));
  const bilheteriaPorPartida = Math.round(15 * nivelEstadio * (1 + 0.1 * nivelTorcida));
  const bonusRecuperacaoEquipamentos = 2 * nivelEquipamentos;
  const reducaoCustoEstamina = Number((0.02 * nivelEquipamentos).toFixed(4));
  const bonusRecuperacaoTecnico = tecnico.bonusRecuperacaoPorNo || 0;

  const pacotesDesbloqueados = [...meta.pacotesDesbloqueados];
  const habilidadesDisponiveis = obterHabilidadesDisponiveis(pacotesDesbloqueados);

  return Object.freeze({
    dificuldade,
    bonusForcaRival: dificuldade * BONUS_RIVAL_POR_DIFICULDADE,

    clubeId: clube.id,
    clubeNome: clube.nome,
    clubeEstilo: clube.rotuloEstilo,
    clubeSigla: clube.sigla,
    modDefensores: clube.modDefensores || 0,
    modAtacantes: clube.modAtacantes || 0,

    tecnicoId: tecnico.id,
    tecnicoNome: tecnico.nome,
    bonusAtributosPartida: tecnico.bonusAtributosPartida || 0,
    fatorPrecoMercado: tecnico.fatorPrecoMercado ?? 1,
    bonusVendaMercadoPct: tecnico.bonusVendaMercadoPct ?? 0,
    bonusRecuperacaoTecnico,

    nivelTorcida,
    bonusReceitaPct,
    fatorReceita,

    nivelEstadio,
    bilheteriaPorPartida,

    nivelBase,
    jovensNoMercado: nivelBase,
    jovemEvolucaoPorPartida: nivelBase > 0 ? 1 : 0,

    nivelEquipamentos,
    bonusRecuperacaoEquipamentos,
    reducaoCustoEstamina,
    bonusRecuperacaoPorNoTotal: bonusRecuperacaoEquipamentos + bonusRecuperacaoTecnico,

    uniformeId: uniforme.id,
    uniforme,

    pacotesDesbloqueados,
    habilidadesDisponiveisIds: habilidadesDisponiveis.map((h) => h.id),
    relogioDesligado:
      typeof opcoes?.relogioDesligado === 'boolean'
        ? opcoes.relogioDesligado
        : Boolean(meta.opcoes?.relogioDesligado),
  });
}

/**
 * Conclui uma campanha dentro da meta-progressão: calcula Pontos de Legado,
 * atualiza dificuldade máxima, registra troféu (se campeão) e avalia conquistas.
 */
export function finalizarCampanhaNoMeta(meta, estadoCampanha, storage = globalThis?.localStorage) {
  if (!meta || !estadoCampanha) return null;

  const venceuChefao = estadoCampanha.status === 'vitoria';
  const ultimoChefao = (estadoCampanha.historico || []).find((h) => h.tipo === 'chefao');
  const camadasCompletadas = Math.max(
    estadoCampanha.nosVisitados?.length || 0,
    estadoCampanha.camadaAtual || 0,
  );

  const pontos = calcularPontosLegado({
    camadasCompletadas,
    vitorias: estadoCampanha.vitorias || 0,
    empates: estadoCampanha.empates || 0,
    venceuChefao,
    dificuldade: estadoCampanha.dificuldade || 0,
  });

  meta.pontosLegado = (meta.pontosLegado || 0) + pontos.total;
  meta.pontosTotaisGanhos = (meta.pontosTotaisGanhos || 0) + pontos.total;
  meta.campanhasJogadas = (meta.campanhasJogadas || 0) + 1;
  if (venceuChefao) {
    meta.campanhasVencidas = (meta.campanhasVencidas || 0) + 1;
  }

  const resumo = {
    status: estadoCampanha.status,
    clubeId: estadoCampanha.clubeId || 'equilibrado',
    tecnicoId: estadoCampanha.tecnicoId || 'padrao',
    dificuldade: estadoCampanha.dificuldade || 0,
    seed: estadoCampanha.seed,
    derrotas: estadoCampanha.derrotas || 0,
    dinheiro: estadoCampanha.dinheiro || 0,
    placarChefao: ultimoChefao?.placar || null,
    rivalChefaoNome: ultimoChefao?.rivalNome || 'Imperador FC',
  };

  const desbloqueios = registrarResultadoCampanhaNosDesbloqueios(meta, resumo);
  salvarMeta(meta, storage);

  return {
    pontos,
    desbloqueios,
    pontosLegadoAtual: meta.pontosLegado,
  };
}
