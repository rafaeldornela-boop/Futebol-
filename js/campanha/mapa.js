/**
 * Gerador determinístico do mapa de 12 camadas estilo Slay the Spire.
 *
 * Regras:
 * - 12 camadas de baixo para cima (camada 1 embaixo, camada 12 Chefão no topo).
 * - 3 a 4 nós por camada (1 único nó na camada 12).
 * - Caminhos sobem, se fundem e NUNCA se cruzam (arestas monotônicas).
 * - Cada nó das camadas 1..11 liga a 1 ou 2 nós da camada seguinte,
 *   e todo nó das camadas 2..12 possui pelo menos 1 entrada.
 * - Camadas 1 e 2: apenas partidas. Camada 11: apenas descanso. Camada 12: chefão.
 * - Camadas 3 a 10: pesos definidos em CAMPANHA_CONFIG.pesosNosCamadasMeio.
 * - Garante no mapa: >= 2 treino, >= 1 mercado, >= 1 fisioterapia, >= 1 patrocínio.
 */

import {
  CAMPANHA_CONFIG,
  METADADOS_NO,
  TIPOS_NO,
} from './constantes.js';
import {
  calcularForcaAlvoCamada,
  classificarForcaRival,
  criarRng,
  inteiroAleatorio,
} from './estado.js';

function sortearTipoPonderado(pesos, rng) {
  const entradas = Object.entries(pesos);
  const total = entradas.reduce((acc, [, peso]) => acc + peso, 0);
  let alvo = rng() * total;
  for (const [tipo, peso] of entradas) {
    alvo -= peso;
    if (alvo <= 0) return tipo;
  }
  return entradas[0][0];
}

function posicoesHorizontais(quantidade) {
  if (quantidade === 1) return [50];
  if (quantidade === 2) return [32, 68];
  if (quantidade === 3) return [20, 50, 80];
  return [14, 38, 62, 86];
}

/**
 * Conecta duas camadas adjacentes (qtdAtual -> qtdProxima) garantindo:
 * 1) 1 ou 2 saídas por nó de origem
 * 2) >= 1 entrada em cada nó de destino
 * 3) Zero cruzamentos: se i1 < i2 e (i1 -> j1), (i2 -> j2), então j1 <= j2
 */
function conectarCamadasSemCruzamento(qtdAtual, qtdProxima, rng) {
  if (qtdProxima === 1) {
    return Array.from({ length: qtdAtual }, () => [0]);
  }

  // Atribui exatamente 1 pai monotônico inicial para cada nó j de destino (0..qtdProxima-1)
  // garantindo que todos os nós de destino fiquem cobertos e que nenhum pai receba mais de 2 ainda.
  const conexoes = Array.from({ length: qtdAtual }, () => []);

  // Passo 1: Mapeamento monotônico base de cada origem i -> destino principal
  for (let i = 0; i < qtdAtual; i += 1) {
    const jPrincipal = Math.min(
      qtdProxima - 1,
      Math.floor((i * qtdProxima) / qtdAtual),
    );
    conexoes[i].push(jPrincipal);
  }

  // Passo 2: Garantir que todo destino j tenha pelo menos 1 entrada sem quebrar monotonicidade
  for (let j = 0; j < qtdProxima; j += 1) {
    const jaTemEntrada = conexoes.some((lista) => lista.includes(j));
    if (jaTemEntrada) continue;

    // Acha o índice de origem i mais adequado onde inserir j mantém j crescente entre pais
    let escolhido = -1;
    for (let i = 0; i < qtdAtual; i += 1) {
      if (conexoes[i].length >= 2) continue;
      const maxAnterior = i > 0 ? Math.max(...conexoes[i - 1]) : 0;
      const minProximo = i < qtdAtual - 1 ? Math.min(...conexoes[i + 1]) : qtdProxima - 1;
      if (j >= maxAnterior && j <= minProximo) {
        escolhido = i;
        break;
      }
    }

    // Fallback seguro: desloca a ponta do último nó com margem válida
    if (escolhido === -1) {
      for (let i = 0; i < qtdAtual; i += 1) {
        const maxAnterior = i > 0 ? Math.max(...conexoes[i - 1]) : 0;
        const minProximo = i < qtdAtual - 1 ? Math.min(...conexoes[i + 1]) : qtdProxima - 1;
        if (j >= maxAnterior && j <= minProximo) {
          escolhido = i;
          break;
        }
      }
    }

    if (escolhido !== -1 && !conexoes[escolhido].includes(j)) {
      conexoes[escolhido].push(j);
      conexoes[escolhido].sort((a, b) => a - b);
    }
  }

  // Passo 3: Opcionalmente adiciona uma 2ª conexão (ramificação/fusão) respeitando estritamente a ordem
  for (let i = 0; i < qtdAtual; i += 1) {
    if (conexoes[i].length >= 2 || rng() >= 0.48) continue;
    const atualMax = Math.max(...conexoes[i]);
    const atualMin = Math.min(...conexoes[i]);
    const minProximo = i < qtdAtual - 1 ? Math.min(...conexoes[i + 1]) : qtdProxima - 1;
    const maxAnterior = i > 0 ? Math.max(...conexoes[i - 1]) : 0;

    const candidatos = [];
    if (atualMax + 1 <= minProximo && !conexoes[i].includes(atualMax + 1)) {
      candidatos.push(atualMax + 1);
    }
    if (atualMin - 1 >= maxAnterior && !conexoes[i].includes(atualMin - 1)) {
      candidatos.push(atualMin - 1);
    }
    if (candidatos.length > 0) {
      const extra = candidatos[Math.floor(rng() * candidatos.length)];
      conexoes[i].push(extra);
      conexoes[i].sort((a, b) => a - b);
    }
  }

  return conexoes;
}

/**
 * Garante quantidades mínimas obrigatórias (treino >= 2, mercado >= 1, fisioterapia >= 1, patrocinio >= 1)
 * substituindo nós das camadas intermediárias (3..10) que estejam em excesso (preferencialmente partidas).
 */
function garantirMinimosDoMapa(camadas, rng) {
  const contagem = {};
  for (const camada of camadas) {
    for (const no of camada.nos) {
      contagem[no.tipo] = (contagem[no.tipo] || 0) + 1;
    }
  }

  const candidatosMeio = [];
  for (const camada of camadas) {
    if (camada.numero < 3 || camada.numero > 10) continue;
    for (const no of camada.nos) {
      candidatosMeio.push(no);
    }
  }

  const minimos = CAMPANHA_CONFIG.minimosNoMapa;
  for (const [tipoReq, qtdMin] of Object.entries(minimos)) {
    while ((contagem[tipoReq] || 0) < qtdMin) {
      // Escolhe um nó substituto que não quebre nenhum mínimo (preferindo 'partida' ou tipo com folga)
      const substituiveis = candidatosMeio.filter((no) => {
        if (no.tipo === tipoReq) return false;
        const minDoTipo = minimos[no.tipo] || 0;
        return (contagem[no.tipo] || 0) > minDoTipo;
      });
      if (substituiveis.length === 0) break;

      const partidasMeio = substituiveis.filter((n) => n.tipo === TIPOS_NO.PARTIDA);
      const pool = partidasMeio.length > 0 ? partidasMeio : substituiveis;
      const escolhido = pool[Math.floor(rng() * pool.length)];

      contagem[escolhido.tipo] -= 1;
      escolhido.tipo = tipoReq;
      contagem[tipoReq] = (contagem[tipoReq] || 0) + 1;
    }
  }
}

/**
 * Gera o mapa completo de 12 camadas determinístico a partir da seed.
 */
export function gerarMapaCampanha(
  seed,
  mediaInicialTitulares = 71,
  bonusDificuldade = 0,
) {
  const rng = criarRng(`${seed}::mapa`);
  const camadas = [];

  // 1. Cria os nós de cada camada (1..12)
  for (let num = 1; num <= CAMPANHA_CONFIG.totalCamadas; num += 1) {
    const qtd =
      num === CAMPANHA_CONFIG.totalCamadas
        ? 1
        : inteiroAleatorio(
            CAMPANHA_CONFIG.nosPorCamadaMin,
            CAMPANHA_CONFIG.nosPorCamadaMax,
            rng,
          );
    const xs = posicoesHorizontais(qtd);
    const nos = [];

    for (let col = 0; col < qtd; col += 1) {
      let tipo = TIPOS_NO.PARTIDA;
      if (num <= 2) {
        tipo = TIPOS_NO.PARTIDA;
      } else if (num === 11) {
        tipo = TIPOS_NO.DESCANSO;
      } else if (num === CAMPANHA_CONFIG.totalCamadas) {
        tipo = TIPOS_NO.CHEFAO;
      } else {
        tipo = sortearTipoPonderado(CAMPANHA_CONFIG.pesosNosCamadasMeio, rng);
      }

      nos.push({
        id: `c${num}_n${col + 1}`,
        camada: num,
        coluna: col,
        xPct: xs[col],
        tipo,
        conexoes: [],
        rivalForca: null,
        rivalClassificacao: null,
      });
    }

    camadas.push({ numero: num, nos });
  }

  // 2. Garante mínimos obrigatórios de nós especiais nas camadas 3..10
  garantirMinimosDoMapa(camadas, rng);

  // 3. Preenche metadados de força dos rivais nos nós de partida e chefão,
  //    e cria as arestas sem cruzamento entre camada L e L+1.
  for (let i = 0; i < camadas.length; i += 1) {
    const camada = camadas[i];
    for (const no of camada.nos) {
      const meta = METADADOS_NO[no.tipo] || METADADOS_NO.partida;
      no.rotulo = meta.nome;
      no.simbolo = meta.simbolo;

      if (no.tipo === TIPOS_NO.PARTIDA || no.tipo === TIPOS_NO.CHEFAO) {
        const variacaoNo =
          no.tipo === TIPOS_NO.CHEFAO ? 0 : Math.round((rng() * 3 - 1.5) * 10) / 10;
        const forcaBase = calcularForcaAlvoCamada(
          mediaInicialTitulares,
          no.camada,
          no.tipo === TIPOS_NO.CHEFAO,
          bonusDificuldade,
        );
        const forca = Math.round(Math.max(50, Math.min(100, forcaBase + variacaoNo)) * 10) / 10;
        no.rivalForca = forca;
        no.rivalClassificacao =
          no.tipo === TIPOS_NO.CHEFAO
            ? 'Forte'
            : classificarForcaRival(forca, mediaInicialTitulares);
      }
    }

    if (i < camadas.length - 1) {
      const proxima = camadas[i + 1];
      const mapaArestas = conectarCamadasSemCruzamento(
        camada.nos.length,
        proxima.nos.length,
        rng,
      );
      for (let col = 0; col < camada.nos.length; col += 1) {
        camada.nos[col].conexoes = mapaArestas[col].map((destIdx) => proxima.nos[destIdx].id);
      }
    }
  }

  return {
    totalCamadas: CAMPANHA_CONFIG.totalCamadas,
    camadas,
  };
}

export function encontrarNoMapa(mapa, noId) {
  if (!mapa || !noId) return null;
  for (const camada of mapa.camadas || []) {
    const no = camada.nos.find((n) => n.id === noId);
    if (no) return no;
  }
  return null;
}

/**
 * Retorna os IDs dos nós clicáveis no momento atual da campanha.
 */
export function obterNosDisponiveisIds(mapa, noAtualId) {
  if (!mapa?.camadas?.length) return [];
  if (!noAtualId) {
    return mapa.camadas[0].nos.map((n) => n.id);
  }
  const atual = encontrarNoMapa(mapa, noAtualId);
  return atual ? [...atual.conexoes] : [];
}

/**
 * Calcula todos os nós ainda alcançáveis a partir da posição atual (para esmaecer caminhos mortos).
 */
export function obterNosAlcancaveisIds(mapa, noAtualId) {
  const alcancaveis = new Set();
  const fila = obterNosDisponiveisIds(mapa, noAtualId);
  while (fila.length > 0) {
    const id = fila.shift();
    if (alcancaveis.has(id)) continue;
    alcancaveis.add(id);
    const no = encontrarNoMapa(mapa, id);
    if (no?.conexoes) {
      for (const proxId of no.conexoes) {
        if (!alcancaveis.has(proxId)) fila.push(proxId);
      }
    }
  }
  return alcancaveis;
}
