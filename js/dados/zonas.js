/**
 * Definição do campo vertical em 17 zonas:
 * - Grade 3 colunas (E = esquerda, C = centro, D = direita) × 5 faixas (1 = defesa .. 5 = ataque)
 *   gerando as 15 zonas Z1-E ... Z5-D.
 * - 2 zonas de goleiro fora da grade: GK (meu goleiro, embaixo, faixa 0) e GKR (goleiro rival, em cima, faixa 6).
 *
 * Orientação visual: meu gol embaixo (GK), atacando para cima (GKR).
 * Espelhamento para o rival: faixa -> 6 - faixa, corredor E <-> D.
 */

export const CORREDORES = Object.freeze(['E', 'C', 'D']);
export const FAIXAS_GRADE = Object.freeze([5, 4, 3, 2, 1]); // ordem visual de cima para baixo

const INDICE_CORREDOR = Object.freeze({ E: 0, C: 1, D: 2 });
const ESPELHO_CORREDOR = Object.freeze({ E: 'D', C: 'C', D: 'E' });

/**
 * Gera a definição estática de todas as 17 zonas (GKR, Z5-E..Z1-D, GK).
 */
function criarMapaZonas() {
  const mapa = {};

  mapa.GKR = {
    id: 'GKR',
    nome: 'GKR',
    descricao: 'Goleiro rival',
    faixa: 6,
    corredor: 'C',
    col: 1,
    foraDaGrade: true,
    espelho: 'GK',
    vizinhos: [],
  };

  for (let faixa = 5; faixa >= 1; faixa -= 1) {
    for (const corredor of CORREDORES) {
      const id = `Z${faixa}-${corredor}`;
      mapa[id] = {
        id,
        nome: id,
        descricao: `Faixa ${faixa} (${corredor})`,
        faixa,
        corredor,
        col: INDICE_CORREDOR[corredor],
        foraDaGrade: false,
        espelho: `Z${6 - faixa}-${ESPELHO_CORREDOR[corredor]}`,
        vizinhos: [],
      };
    }
  }

  mapa.GK = {
    id: 'GK',
    nome: 'GK',
    descricao: 'Meu goleiro',
    faixa: 0,
    corredor: 'C',
    col: 1,
    foraDaGrade: true,
    espelho: 'GKR',
    vizinhos: [],
  };

  const ids = Object.keys(mapa);
  for (const idA of ids) {
    const a = mapa[idA];
    const vizinhos = [];
    for (const idB of ids) {
      if (idA === idB) continue;
      const b = mapa[idB];
      // Vizinhas = zonas que se tocam (inclusive diagonal).
      // Como GK = (faixa 0, col 1) e GKR = (faixa 6, col 1), max(|df|, |dc|) === 1
      // faz GK tocar toda a faixa 1 e GKR tocar toda a faixa 5 automaticamente.
      const dist = Math.max(Math.abs(a.faixa - b.faixa), Math.abs(a.col - b.col));
      if (dist === 1) {
        vizinhos.push(idB);
      }
    }
    a.vizinhos = Object.freeze(vizinhos);
    Object.freeze(a);
  }

  return Object.freeze(mapa);
}

export const ZONAS = criarMapaZonas();

export const IDS_ZONAS = Object.freeze(Object.keys(ZONAS));

export const IDS_ZONAS_GRADE = Object.freeze(
  IDS_ZONAS.filter((id) => !ZONAS[id].foraDaGrade),
);

/**
 * Distância entre zonas = maior diferença entre faixas e corredores
 * (GK = faixa 0 e GKR = faixa 6, ambos no corredor C).
 */
export function obterDistanciaZonas(zonaA, zonaB) {
  const a = ZONAS[zonaA];
  const b = ZONAS[zonaB];
  if (!a || !b) return 99;
  return Math.max(Math.abs(a.faixa - b.faixa), Math.abs(a.col - b.col));
}

/**
 * Indica se duas zonas são vizinhas diretas (se tocam, inclusive na diagonal).
 */
export function saoZonasVizinhos(zonaA, zonaB) {
  return Boolean(ZONAS[zonaA]?.vizinhos.includes(zonaB));
}

/**
 * Espelha uma zona entre o ponto de vista do meu time e o do rival:
 * faixa -> 6 - faixa, corredor E <-> D.
 */
export function espelharZona(zonaId) {
  return ZONAS[zonaId]?.espelho || zonaId;
}

/**
 * Converte uma zona real do campo para o ponto de vista do time (`meuTime` ou `rival`).
 */
export function zonaParaPontoDeVista(zonaId, timeId) {
  return timeId === 'rival' ? espelharZona(zonaId) : zonaId;
}

/**
 * Converte uma zona do ponto de vista de um time de volta para a zona real do campo.
 */
export function converterDoPontoDeVista(zonaPV, timeId) {
  return timeId === 'rival' ? espelharZona(zonaPV) : zonaPV;
}

/**
 * Retorna a faixa (0 a 6) da zona do ponto de vista do time informado.
 */
export function obterFaixa(zonaId, timeId = 'meuTime') {
  const z = ZONAS[zonaParaPontoDeVista(zonaId, timeId)];
  return z ? z.faixa : 0;
}

/**
 * Retorna o corredor ('E', 'C' ou 'D') da zona do ponto de vista do time informado.
 */
export function obterCorredor(zonaId, timeId = 'meuTime') {
  const z = ZONAS[zonaParaPontoDeVista(zonaId, timeId)];
  return z ? z.corredor : 'C';
}

/**
 * Indica se o portador pode finalizar nesta zona:
 * faixa 5 (Z5-E, Z5-C, Z5-D) ou Z4-C (chute de fora), no ponto de vista de quem ataca.
 */
export function podeFinalizarNaZona(zonaId, timeId) {
  const zonaPV = zonaParaPontoDeVista(zonaId, timeId);
  return (
    zonaPV === 'Z5-C' ||
    zonaPV === 'Z5-E' ||
    zonaPV === 'Z5-D' ||
    zonaPV === 'Z4-C'
  );
}

/**
 * Indica se a zona é a linha de fundo lateral (Z5-E ou Z5-D no ponto de vista do time atacante).
 */
export function ehZonaLinhaDeFundo(zonaId, timeId = 'meuTime') {
  const zonaPV = zonaParaPontoDeVista(zonaId, timeId);
  return zonaPV === 'Z5-E' || zonaPV === 'Z5-D';
}

/**
 * Indica se a zona permite cruzamento na área (linha de fundo Z5-E/Z5-D ou alas ofensivas Z4-E/Z4-D).
 */
export function podeCruzarNaZona(zonaId, timeId = 'meuTime') {
  const zonaPV = zonaParaPontoDeVista(zonaId, timeId);
  return (
    zonaPV === 'Z5-E' ||
    zonaPV === 'Z5-D' ||
    zonaPV === 'Z4-E' ||
    zonaPV === 'Z4-D'
  );
}

/**
 * Indica se a zona pertence ao terço final ofensivo (faixas 4 ou 5 no ponto de vista do time).
 */
export function ehZonaTercoFinal(zonaId, timeId = 'meuTime') {
  const faixa = obterFaixa(zonaId, timeId);
  return faixa === 4 || faixa === 5;
}

/**
 * Indica se a zona fica dentro da grande área ofensiva (faixa 5: Z5-E, Z5-C, Z5-D).
 */
export function ehZonaAreaPenal(zonaId, timeId = 'meuTime') {
  return obterFaixa(zonaId, timeId) === 5;
}

/**
 * Retorna a zona do goleiro adversário para o time que está atacando.
 */
export function obterZonaGolAlvo(timeId) {
  return timeId === 'meuTime' ? 'GKR' : 'GK';
}

/**
 * Retorna a zona do próprio goleiro do time informado.
 */
export function obterZonaProprioGoleiro(timeId) {
  return timeId === 'meuTime' ? 'GK' : 'GKR';
}

/**
 * Calcula as zonas intermediárias atravessadas por passes que pulam zonas
 * (`longo` ou `invertido`).
 * - No invertido (E <-> D): retorna o corredor C da faixa do meio do caminho.
 * - No longo (+2 faixas ou mais): retorna as faixas intermediárias entre origem e destino.
 */
export function obterZonasIntermediarias(origem, destino, tipoPasse, timeId = 'meuTime') {
  const origemPV = zonaParaPontoDeVista(origem, timeId);
  const destinoPV = zonaParaPontoDeVista(destino, timeId);
  const zO = ZONAS[origemPV];
  const zD = ZONAS[destinoPV];
  if (!zO || !zD) return [];

  if (tipoPasse === 'invertido') {
    const faixaMeio = Math.max(1, Math.min(5, Math.round((zO.faixa + zD.faixa) / 2)));
    const interPV = `Z${faixaMeio}-C`;
    const interReal = converterDoPontoDeVista(interPV, timeId);
    return interReal === origem || interReal === destino ? [] : [interReal];
  }

  if (tipoPasse === 'longo') {
    const deltaFaixa = zD.faixa - zO.faixa;
    if (deltaFaixa < 2) return [];
    const lista = [];
    for (let passo = 1; passo < deltaFaixa; passo += 1) {
      const f = zO.faixa + passo;
      let col;
      if (zO.col === zD.col) {
        col = zO.col;
      } else if (zO.col === 1 || zD.col === 1) {
        // Mantém simetria E/D ao passar envolvendo o corredor central
        col = 1;
      } else {
        const t = passo / deltaFaixa;
        col = Math.round(zO.col + (zD.col - zO.col) * t);
      }
      const corredor = CORREDORES[col] || 'C';
      const interPV = `Z${f}-${corredor}`;
      const interReal = converterDoPontoDeVista(interPV, timeId);
      if (interReal !== origem && interReal !== destino) {
        lista.push(interReal);
      }
    }
    return lista;
  }

  return [];
}

/**
 * Desloca uma zona real em `deltaFaixas` (+1 sobe, -1 desce) no ponto de vista
 * do time informado, mantendo jogadores de linha dentro das faixas 1 a 5.
 */
export function deslocarZonaNaFaixa(zonaId, deltaFaixas, timeId) {
  const zReal = ZONAS[zonaId];
  if (!zReal || zReal.foraDaGrade || deltaFaixas === 0) return zonaId;

  const zonaPV = zonaParaPontoDeVista(zonaId, timeId);
  const zPV = ZONAS[zonaPV];
  if (!zPV || zPV.foraDaGrade) return zonaId;

  const novaFaixa = Math.max(1, Math.min(5, zPV.faixa + deltaFaixas));
  const novaZonaPV = `Z${novaFaixa}-${zPV.corredor}`;
  return converterDoPontoDeVista(novaZonaPV, timeId);
}
