/**
 * Gerenciamento de estado da campanha, PRNG por seed, persistência segura em localStorage,
 * cálculo de média inicial e gerador de adversários por camada.
 */

import {
  aplicarFormacaoNoTime,
  FORMACAO_PADRAO,
  POSICOES_NATURAIS_PAPEL,
  sortearFormacaoPorSeed,
} from '../dados/formacoes.js';
import { TIMES_PADRAO } from '../dados/times.js';
import { LISTA_HABILIDADES, jogadorPodeTerHabilidade } from '../dados/habilidades.js';
import { criarInstanciaHabilidade } from '../regras/habilidades.js';
import { CAMPANHA_CONFIG } from './constantes.js';

export const ATRIBUTOS_LINHA = Object.freeze([
  'passe',
  'dominio',
  'posicionamento',
  'marcacao',
  'interceptacao',
  'desarme',
  'velocidade',
  'tecnica',
  'dibre',
  'finalizacao',
]);

export const ROTULOS_ATRIBUTOS = Object.freeze({
  passe: 'Passe',
  dominio: 'Domínio',
  posicionamento: 'Posicionamento',
  marcacao: 'Marcação',
  interceptacao: 'Interceptação',
  desarme: 'Desarme',
  velocidade: 'Velocidade',
  tecnica: 'Técnica',
  dibre: 'Dibre',
  finalizacao: 'Finalização',
  agressividade: 'Agressividade',
  defesa: 'Defesa',
});

const NOMES_RIVAIS = Object.freeze([
  { nome: 'Ferroviária Sul', sigla: 'FER', cor: '#881337' },
  { nome: 'Grêmio Horizonte', sigla: 'HOR', cor: '#7c2d12' },
  { nome: 'União Serrana', sigla: 'USR', cor: '#4c1d95' },
  { nome: 'Real Litoral', sigla: 'LIT', cor: '#115e59' },
  { nome: 'Esporte Clube Várzea', sigla: 'VAR', cor: '#713f12' },
  { nome: 'Atlético Planalto', sigla: 'PLA', cor: '#9f1239' },
  { nome: 'Operário Central', sigla: 'OPE', cor: '#3730a3' },
  { nome: 'Juventude do Norte', sigla: 'JUV', cor: '#166534' },
  { nome: 'Nacional Metropolitano', sigla: 'NAC', cor: '#86198f' },
  { nome: 'Real Serra Dourada', sigla: 'RSD', cor: '#9a3412' },
  { nome: 'Imperador FC', sigla: 'IMP', cor: '#7f1d1d' },
]);

const PRIMEIROS_NOMES = Object.freeze([
  'Arthur', 'Bruno', 'Caio', 'Danilo', 'Eduardo', 'Felipe', 'Guilherme', 'Heitor',
  'Igor', 'João', 'Kauã', 'Leonardo', 'Marcos', 'Nicolas', 'Otávio', 'Paulo',
  'Rafael', 'Samuel', 'Thiago', 'Vinícius', 'Wesley', 'Yago', 'Lucas', 'Renan',
]);

const SOBRENOMES = Object.freeze([
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Farias', 'Gomes', 'Henrique',
  'Lacerda', 'Machado', 'Nunes', 'Oliveira', 'Pereira', 'Queiroz', 'Ribeiro', 'Sampaio',
  'Tavares', 'Vieira', 'Xavier', 'Zanetti', 'Bastos', 'Campos', 'Mendes', 'Rocha',
]);

/**
 * Hash determinístico FNV-1a + Mulberry32 para campanhas reproduzíveis por seed.
 */
export function hashString(texto) {
  const s = String(texto || 'PRANCHETA-1');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function criarRng(seedTexto) {
  let a = hashString(seedTexto) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gerarNovaSeed(rng = Math.random) {
  const numero = Math.floor(1000 + rng() * 9000);
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const l1 = letras[Math.floor(rng() * letras.length)];
  const l2 = letras[Math.floor(rng() * letras.length)];
  return `BRI-${l1}${l2}${numero}`;
}

export function inteiroAleatorio(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function ajustarAtributoClamped(jogador, atributo, delta) {
  if (!jogador?.atributos || typeof jogador.atributos[atributo] !== 'number') return 0;
  const antes = jogador.atributos[atributo];
  const depois = Math.max(1, Math.min(100, antes + delta));
  jogador.atributos[atributo] = depois;
  return depois - antes;
}

/**
 * Calcula a média geral de um jogador (usada para força de mercado e base da campanha).
 */
export function calcularMediaJogador(jogador) {
  if (!jogador?.atributos) return 60;
  const chaves = jogador.ehGoleiro
    ? ['defesa', 'posicionamento', 'passe', 'dominio', 'interceptacao']
    : ATRIBUTOS_LINHA;
  let soma = 0;
  let qtd = 0;
  for (const c of chaves) {
    if (typeof jogador.atributos[c] === 'number') {
      soma += jogador.atributos[c];
      qtd += 1;
    }
  }
  return qtd > 0 ? soma / qtd : 60;
}

/**
 * Média dos 11 titulares iniciais do Atlético Brisa.
 */
export function calcularMediaTitularesInicial(elenco) {
  const titulares = elenco.slice(0, 11);
  if (titulares.length === 0) return 70;
  const soma = titulares.reduce((acc, j) => acc + calcularMediaJogador(j), 0);
  return Math.round((soma / titulares.length) * 10) / 10;
}

/**
 * Valor de mercado (100 a 400) proporcional à força do jogador e número de habilidades.
 */
export function calcularValorMercadoJogador(jogador) {
  const media = calcularMediaJogador(jogador);
  const bonusHab = (jogador.extras?.habilidades?.length || 0) * 20;
  const bruto = 100 + ((media - 60) / 30) * 260 + bonusHab;
  return Math.max(
    CAMPANHA_CONFIG.mercadoPrecoMin,
    Math.min(CAMPANHA_CONFIG.mercadoPrecoMax, Math.round(bruto / 5) * 5),
  );
}

/**
 * Cria o elenco inicial de 18 jogadores (2 GOL, 6 DEF, 5 MEI, 5 ATA) a partir de TIMES_PADRAO.meuTime.
 */
export function criarElencoInicialCampanha(mods = null) {
  const base = structuredClone(TIMES_PADRAO.meuTime);
  const modDef = mods?.modDefensores || 0;
  const modAta = mods?.modAtacantes || 0;

  const todos = [...base.jogadores, ...base.reservas].map((j, idx) => {
    const setor =
      j.setor ||
      (j.ehGoleiro
        ? 'GOL'
        : ['ZAG', 'LE', 'LD'].includes(j.posicao)
          ? 'DEF'
          : ['VOL', 'ME', 'MD'].includes(j.posicao)
            ? 'MEI'
            : 'ATA');

    const deltaSetor = setor === 'DEF' ? modDef : setor === 'ATA' ? modAta : 0;
    const jogador = {
      ...j,
      setor,
      lesionado: false,
      ordemElenco: idx,
      extras: {
        estamina: 100,
        habilidades: (j.extras?.habilidades || [])
          .map((h) => criarInstanciaHabilidade(h))
          .filter(Boolean),
        cartoes: { amarelos: 0, vermelho: false },
        substituido: false,
      },
    };

    if (deltaSetor !== 0) {
      for (const attr of Object.keys(jogador.atributos || {})) {
        if (attr === 'agressividade') continue;
        ajustarAtributoClamped(jogador, attr, deltaSetor);
      }
    }

    return jogador;
  });
  return todos;
}

export function classificarForcaRival(forcaAlvo, mediaInicialTitulares) {
  if (forcaAlvo < mediaInicialTitulares + 2) return 'Fraco';
  if (forcaAlvo < mediaInicialTitulares + 12) return 'Médio';
  return 'Forte';
}

export function calcularForcaAlvoCamada(
  mediaInicialTitulares,
  camada,
  ehChefao = false,
  bonusDificuldade = 0,
) {
  const base =
    mediaInicialTitulares -
    CAMPANHA_CONFIG.rivalDescontoBase +
    CAMPANHA_CONFIG.rivalGanhoPorCamada * camada +
    (ehChefao ? CAMPANHA_CONFIG.rivalBonusChefao : 0) +
    (Number(bonusDificuldade) || 0);
  return Math.round(Math.max(50, Math.min(100, base)) * 10) / 10;
}

/**
 * Gera um time rival completo (11 titulares + 7 reservas em 4-3-3) para uma camada/nó.
 */
export function gerarRivalPorCamada({
  seed,
  noId,
  camada,
  ehChefao = false,
  mediaInicialTitulares = 71,
  forcaPersonalizada = null,
  bonusDificuldade = 0,
  formacao = FORMACAO_PADRAO,
}) {
  const rng = criarRng(`${seed}::rival::${noId}::c${camada}`);
  const forcaAlvo =
    typeof forcaPersonalizada === 'number'
      ? forcaPersonalizada
      : calcularForcaAlvoCamada(mediaInicialTitulares, camada, ehChefao, bonusDificuldade);

  const modelo = structuredClone(TIMES_PADRAO.rival);
  aplicarFormacaoNoTime(modelo, formacao);
  const infoClube = ehChefao
    ? { nome: 'Imperador FC (Chefão)', sigla: 'IMP', cor: '#7f1d1d' }
    : NOMES_RIVAIS[Math.floor(rng() * NOMES_RIVAIS.length)];

  const variacao = CAMPANHA_CONFIG.rivalVariacaoAtributo;
  const maxHabsPorJogador = ehChefao ? 2 : camada >= 7 ? 2 : camada >= 3 ? 1 : 0;
  const chanceHab = ehChefao ? 0.85 : Math.min(0.75, 0.2 + camada * 0.05);

  const gerarAtributosEscalados = (ehGoleiro, papel) => {
    const sortearAttr = (bias = 0) =>
      Math.max(
        20,
        Math.min(99, Math.round(forcaAlvo + bias + inteiroAleatorio(-variacao, variacao, rng))),
      );

    const ehZagueiro = papel?.startsWith('ZAG');
    const ehLateral = papel?.startsWith('LAT') || papel?.startsWith('ALA');
    const ehVol = papel?.startsWith('VOL');
    const ehMeia = papel?.startsWith('MEI');
    const ehAta =
      papel?.startsWith('PONTA') || papel?.startsWith('ATA') || papel === 'CA';

    return {
      passe: sortearAttr(ehMeia || ehVol ? 3 : 0),
      dominio: sortearAttr(ehMeia || ehAta ? 2 : 0),
      posicionamento: sortearAttr(2),
      marcacao: sortearAttr(ehZagueiro || ehVol ? 4 : ehAta ? -12 : 0),
      interceptacao: sortearAttr(ehZagueiro || ehVol ? 3 : ehAta ? -10 : 0),
      desarme: sortearAttr(ehZagueiro || ehVol ? 4 : ehAta ? -12 : 0),
      velocidade: sortearAttr(
        ehLateral || papel?.startsWith('PONTA') ? 5 : 0,
      ),
      tecnica: sortearAttr(ehMeia || ehAta ? 3 : -2),
      dibre: sortearAttr(ehAta || ehMeia ? 4 : ehLateral ? 2 : -4),
      finalizacao: sortearAttr(ehAta ? 5 : ehZagueiro ? -15 : -4),
      agressividade: sortearAttr(-8),
      ...(ehGoleiro ? { defesa: sortearAttr(6) } : {}),
    };
  };

  const nomesUsados = new Set();
  const sortearNome = (idx) => {
    for (let t = 0; t < 20; t += 1) {
      const p = PRIMEIROS_NOMES[Math.floor(rng() * PRIMEIROS_NOMES.length)];
      const s = SOBRENOMES[Math.floor(rng() * SOBRENOMES.length)];
      const completo = `${p} ${s}`;
      if (!nomesUsados.has(completo)) {
        nomesUsados.add(completo);
        return { nome: completo, nomeCurto: p };
      }
    }
    return { nome: `Jogador ${idx + 1}`, nomeCurto: `J${idx + 1}` };
  };

  const sortearHabilidades = (jogadorBase) => {
    if (maxHabsPorJogador <= 0 || rng() > chanceHab) return [];
    const compativeis = LISTA_HABILIDADES.filter((h) => jogadorPodeTerHabilidade(jogadorBase, h));
    const escolhidas = [];
    const pool = [...compativeis];
    const qtd = ehChefao && pool.length >= 2 ? 2 : 1;
    for (let k = 0; k < qtd && pool.length > 0; k += 1) {
      const i = Math.floor(rng() * pool.length);
      const hab = pool.splice(i, 1)[0];
      escolhidas.push(criarInstanciaHabilidade(hab.id));
    }
    return escolhidas.filter(Boolean);
  };

  const ajustarLista = (lista, prefixoId, ehTitular) =>
    lista.map((j, idx) => {
      const { nome, nomeCurto } = sortearNome(idx);
      const posNatural =
        ehTitular && POSICOES_NATURAIS_PAPEL[j.papel]?.[0]
          ? POSICOES_NATURAIS_PAPEL[j.papel][0]
          : j.posicao;
      const novo = {
        ...j,
        posicao: posNatural,
        foraDePosicao: false,
        id: `${prefixoId}_${noId}_${idx}`,
        nome,
        nomeCurto,
        atributos: gerarAtributosEscalados(j.ehGoleiro, j.papel),
        extras: {
          estamina: 100,
          habilidades: [],
          cartoes: { amarelos: 0, vermelho: false },
          substituido: false,
        },
      };
      novo.extras.habilidades = sortearHabilidades(novo);
      return novo;
    });

  return {
    ...modelo,
    id: 'rival',
    formacao: modelo.formacao || formacao,
    nome: infoClube.nome,
    sigla: infoClube.sigla,
    corPrincipal: infoClube.cor,
    forcaAlvo,
    classificacaoForca: ehChefao ? 'Forte' : classificarForcaRival(forcaAlvo, mediaInicialTitulares),
    jogadores: ajustarLista(modelo.jogadores, 'r', true),
    reservas: ajustarLista(modelo.reservas, 'rr', false),
    substituidos: [],
  };
}

/**
 * Cria um estado completo de campanha a partir da seed informada.
 * O mapa é passado/injetado por `criarCampanha` (ou via `geradorMapa`).
 */
export function criarEstadoCampanhaBase({
  seed = null,
  geradorMapa = null,
  modificadores = null,
} = {}) {
  const seedFinal =
    typeof seed === 'string' && seed.trim().length > 0 ? seed.trim() : gerarNovaSeed();
  const elenco = criarElencoInicialCampanha(modificadores);
  const mediaInicialTitulares = calcularMediaTitularesInicial(elenco);
  const bonusDificuldade = modificadores?.bonusForcaRival || 0;

  const estado = {
    versao: 2,
    seed: seedFinal,
    clubeId: modificadores?.clubeId || 'equilibrado',
    clubeNome: modificadores?.clubeNome || 'Atlético Brisa',
    clubeSigla: modificadores?.clubeSigla || 'BRI',
    tecnicoId: modificadores?.tecnicoId || 'padrao',
    tecnicoNome: modificadores?.tecnicoNome || 'Clássico (Sem bônus)',
    dificuldade: modificadores?.dificuldade || 0,
    uniformeId: modificadores?.uniformeId || 'padrao',
    modificadoresMeta: modificadores ? structuredClone(modificadores) : null,
    metaFinalizada: false,
    dinheiro: CAMPANHA_CONFIG.dinheiroInicial,
    elenco,
    mediaInicialTitulares,
    mapa: null,
    noAtualId: null,
    camadaAtual: 0,
    nosVisitados: [],
    noPendente: null, // mantém estado de um nó aberto (ex.: opções sorteadas)
    historico: [],
    partidasDisputadas: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    derrotasSeguidas: 0,
    moral: 0,
    contratosPatrocinio: [],
    formacaoRival: sortearFormacaoPorSeed(`${seedFinal}::formacao_rival`),
    formacaoSelecionada: FORMACAO_PADRAO,
    posturaSelecionada: 'equilibrada',
    status: 'em_andamento', // 'em_andamento' | 'vitoria' | 'derrota'
    motivoFim: '',
  };

  if (typeof geradorMapa === 'function') {
    estado.mapa = geradorMapa(seedFinal, mediaInicialTitulares, bonusDificuldade);
  }

  return estado;
}

/**
 * Persistência segura em localStorage (sempre dentro de try/catch; nunca falha se indisponível).
 */
export function salvarCampanha(estado, storage = globalThis?.localStorage) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(CAMPANHA_CONFIG.storageKey, JSON.stringify(estado));
    return true;
  } catch {
    return false;
  }
}

export function carregarCampanha(storage = globalThis?.localStorage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const bruto = storage.getItem(CAMPANHA_CONFIG.storageKey);
    if (!bruto) return null;
    const parsed = JSON.parse(bruto);
    if (!parsed || !parsed.seed || !Array.isArray(parsed.elenco) || !parsed.mapa) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function limparCampanha(storage = globalThis?.localStorage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(CAMPANHA_CONFIG.storageKey);
    return true;
  } catch {
    return false;
  }
}
