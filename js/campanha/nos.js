/**
 * Lógica pura de resolução de todos os 9 tipos de nó + Chefão da campanha.
 *
 * Responsável por:
 * - Escalação automática (11 titulares + 7 reservas saudáveis) e validação de escalação manual
 * - Construção do time pronto para `partida(meuTime, rival, opcoes)` aplicando moral
 * - Pós-partida: renda, contratos de patrocínio, lesões (<20 estamina -> 25%), recuperação +10,
 *   limpeza da moral, derrotas seguidas (3 = demissão) e vitória/derrota no chefão
 * - Treino, Descanso Total, Fisioterapia, Patrocínio, Torcida, Mercado, Evento e Misterioso
 */

import {
  jogadorPodeTerHabilidade,
  obterHabilidadesDisponiveis,
} from '../dados/habilidades.js';
import { PAPEIS_433 } from '../dados/formacoes.js';
import { modificadoresMeta } from '../meta/meta.js';
import { criarInstanciaHabilidade } from '../regras/habilidades.js';
import { CAMPANHA_CONFIG, TIPOS_NO } from './constantes.js';
import { obterEventosDisponiveis } from './eventos.js';
import {
  ajustarAtributoClamped,
  ATRIBUTOS_LINHA,
  calcularMediaJogador,
  calcularValorMercadoJogador,
  criarEstadoCampanhaBase,
  criarRng,
  inteiroAleatorio,
  ROTULOS_ATRIBUTOS,
} from './estado.js';
import { gerarMapaCampanha } from './mapa.js';

export function obterModsCampanha(estado) {
  return estado?.modificadoresMeta || modificadoresMeta();
}

const POSICOES_PREFERIDAS_PAPEL = Object.freeze({
  GOL: ['GOL'],
  ZAG1: ['ZAG'],
  ZAG2: ['ZAG'],
  LAT_E: ['LE', 'LD'],
  LAT_D: ['LD', 'LE'],
  VOL: ['VOL', 'ME', 'MD'],
  MEI_E: ['ME', 'MD', 'VOL'],
  MEI_D: ['MD', 'ME', 'VOL'],
  PONTA_E: ['PE', 'PD', 'CA'],
  PONTA_D: ['PD', 'PE', 'CA'],
  CA: ['CA', 'PE', 'PD'],
});

const SETOR_DO_PAPEL = Object.freeze({
  GOL: 'GOL',
  ZAG1: 'DEF',
  ZAG2: 'DEF',
  LAT_E: 'DEF',
  LAT_D: 'DEF',
  VOL: 'MEI',
  MEI_E: 'MEI',
  MEI_D: 'MEI',
  PONTA_E: 'ATA',
  PONTA_D: 'ATA',
  CA: 'ATA',
});

const NOMES_MERCADO_P = Object.freeze([
  'Breno', 'Cauã', 'Diego', 'Enzo', 'Fabrício', 'Gerson', 'Hugo', 'Ícaro',
  'Jonas', 'Kevin', 'Leandro', 'Mateus', 'Nathan', 'Orlando', 'Pedro', 'Rodrigo',
  'Sandro', 'Túlio', 'Vitor', 'William',
]);

const NOMES_MERCADO_S = Object.freeze([
  'Siqueira', 'Monteiro', 'Peixoto', 'Santana', 'Borges', 'Coutinho', 'Assis', 'Paiva',
  'Cavalcanti', 'Bittencourt', 'Macedo', 'Freitas', 'Teixeira', 'Nogueira', 'Lopes', 'Ferraz',
]);

/**
 * Pontua um jogador saudável do elenco para preencher determinado papel do 4-3-3.
 */
function pontuarJogadorParaPapel(jogador, papel) {
  if (!jogador || jogador.lesionado) return -1e9;
  if (papel === 'GOL' && !jogador.ehGoleiro) return -1e6;
  if (papel !== 'GOL' && jogador.ehGoleiro) return -1e6;

  const est = typeof jogador.extras?.estamina === 'number' ? jogador.extras.estamina : 100;
  const media = calcularMediaJogador(jogador);
  const preferidas = POSICOES_PREFERIDAS_PAPEL[papel] || [];
  let bonusPos = 0;
  if (preferidas[0] === jogador.posicao) bonusPos = 35;
  else if (preferidas.includes(jogador.posicao)) bonusPos = 22;
  else if (jogador.setor === SETOR_DO_PAPEL[papel]) bonusPos = 14;

  const pesoEstamina = est * 0.25;
  return bonusPos + media + pesoEstamina;
}

/**
 * Seleciona automaticamente os 11 melhores jogadores disponíveis (não lesionados)
 * respeitando as posições do 4-3-3, mais até 7 reservas saudáveis.
 */
export function prepararEscalacaoPadrao(elenco) {
  const saudaveis = (elenco || []).filter((j) => !j.lesionado);
  const usados = new Set();
  const titularesPorPapel = {};

  for (const papel of PAPEIS_433) {
    const candidatos = saudaveis
      .filter((j) => !usados.has(j.id))
      .sort((a, b) => pontuarJogadorParaPapel(b, papel) - pontuarJogadorParaPapel(a, papel));
    if (candidatos.length > 0) {
      titularesPorPapel[papel] = candidatos[0].id;
      usados.add(candidatos[0].id);
    } else {
      titularesPorPapel[papel] = null;
    }
  }

  const reservasIds = saudaveis
    .filter((j) => !usados.has(j.id))
    .slice(0, 7)
    .map((j) => j.id);

  return {
    titularesPorPapel,
    reservasIds,
  };
}

/**
 * Valida a escalação para entrar em campo.
 */
export function validarEscalacao(elenco, titularesPorPapel, reservasIds = []) {
  const mapaElenco = new Map((elenco || []).map((j) => [j.id, j]));
  const idsTitulares = [];
  const vistos = new Set();

  for (const papel of PAPEIS_433) {
    const id = titularesPorPapel?.[papel];
    const jogador = mapaElenco.get(id);
    if (!jogador) {
      return { valido: false, motivo: `Falta escalar um jogador para ${papel}.` };
    }
    if (jogador.lesionado) {
      return { valido: false, motivo: `${jogador.nomeCurto} está lesionado e não pode jogar.` };
    }
    if (papel === 'GOL' && !jogador.ehGoleiro) {
      return { valido: false, motivo: 'A vaga de GOL exige um goleiro.' };
    }
    if (papel !== 'GOL' && jogador.ehGoleiro) {
      return { valido: false, motivo: `${jogador.nomeCurto} (GOL) não pode atuar na linha.` };
    }
    if (vistos.has(id)) {
      return { valido: false, motivo: `${jogador.nomeCurto} foi escalado em duas vagas.` };
    }
    vistos.add(id);
    idsTitulares.push(id);
  }

  const reservasValidas = [];
  for (const rId of reservasIds) {
    const r = mapaElenco.get(rId);
    if (!r || r.lesionado || vistos.has(rId)) continue;
    vistos.add(rId);
    reservasValidas.push(rId);
    if (reservasValidas.length >= 7) break;
  }

  return {
    valido: true,
    idsTitulares,
    reservasValidas,
  };
}

/**
 * Monta o objeto `meuTime` pronto para `partida(meuTime, rival, opcoes)` aplicando
 * a escalação escolhida e o bônus de moral em todos os atributos (sem mutar `estado.elenco`).
 */
export function montarTimeParaPartida(estado, titularesPorPapel, reservasIds) {
  const mapaElenco = new Map(estado.elenco.map((j) => [j.id, j]));
  const mods = obterModsCampanha(estado);
  const moral = estado.moral || 0;
  const bonusAtributos = moral + (mods.bonusAtributosPartida || 0);

  const prepararJogador = (base, papel, ehReserva) => {
    const clone = structuredClone(base);
    clone.papel = papel;
    clone.ehReserva = ehReserva;
    clone.iniciaComBola = papel === 'ZAG1';
    clone.zona = ehReserva ? null : clone.ehGoleiro ? 'GK' : 'Z1-C';
    clone.zonaBase = ehReserva ? null : clone.ehGoleiro ? 'GK' : 'Z1-C';
    clone.extras = {
      estamina: typeof clone.extras?.estamina === 'number' ? clone.extras.estamina : 100,
      habilidades: (clone.extras?.habilidades || [])
        .map((h) =>
          criarInstanciaHabilidade(typeof h === 'string' ? h : h.id),
        )
        .filter(Boolean),
      cartoes: { amarelos: 0, vermelho: false },
      substituido: false,
    };

    if (bonusAtributos !== 0) {
      for (const attr of Object.keys(clone.atributos)) {
        if (attr === 'agressividade') continue;
        clone.atributos[attr] = Math.max(1, Math.min(100, clone.atributos[attr] + bonusAtributos));
      }
    }
    return clone;
  };

  const jogadores = PAPEIS_433.map((papel) =>
    prepararJogador(mapaElenco.get(titularesPorPapel[papel]), papel, false),
  );

  const reservas = (reservasIds || [])
    .map((id) => mapaElenco.get(id))
    .filter((j) => j && !j.lesionado)
    .slice(0, 7)
    .map((j) => prepararJogador(j, j.papel || j.posicao, true));

  return {
    id: 'meuTime',
    nome: mods.clubeNome || estado.clubeNome || 'Atlético Brisa',
    sigla: mods.clubeSigla || estado.clubeSigla || 'BRI',
    formacao: '4-3-3',
    corPrincipal: mods.uniforme?.corPrincipal || '#163a76',
    corBorda: mods.uniforme?.corBorda || '#93c5fd',
    corDetalhe: mods.uniforme?.corDetalhe || '#f5b82e',
    corTexto: mods.uniforme?.corTexto || '#ffffff',
    modificadoresMeta: mods,
    jogadores,
    reservas,
    substituidos: [],
  };
}

/**
 * Aplica recuperação de +10 de estamina + bônus de Equipamentos/Fisiologista ao passar por um nó.
 */
export function aplicarRecuperacaoEntreNos(estado) {
  const mods = obterModsCampanha(estado);
  const ganho =
    CAMPANHA_CONFIG.recuperacaoEstaminaEntreNos + (mods.bonusRecuperacaoPorNoTotal || 0);
  for (const j of estado.elenco) {
    const atual = typeof j.extras?.estamina === 'number' ? j.extras.estamina : 100;
    j.extras.estamina = Math.min(100, atual + ganho);
  }
  return ganho;
}

function registrarVisitaNo(estado, no, detalheHistorico, { recuperarEntreNos = true } = {}) {
  estado.noAtualId = no.id;
  estado.camadaAtual = no.camada;
  if (!estado.nosVisitados.includes(no.id)) {
    estado.nosVisitados.push(no.id);
  }
  estado.noPendente = null;
  if (recuperarEntreNos) {
    aplicarRecuperacaoEntreNos(estado);
  }
  estado.historico.unshift({
    camada: no.camada,
    noId: no.id,
    tipo: no.tipo,
    ...detalheHistorico,
  });
}

/**
 * Aplica o desfecho completo de uma partida da campanha:
 * 1) Grava estamina final e marca lesionados (já sorteados em `partida()` antes da recuperação)
 * 2) Paga renda por resultado + contratos de patrocínio ativos
 * 3) Atualiza sequência de derrotas (empate zera) e limpa moral de 1 jogo
 * 4) Verifica vitória no Chefão ou derrota (3 seguidas ou derrota no Chefão)
 * 5) Aplica recuperação +10 entre nós se a campanha seguir (ou sempre ao fim do nó)
 */
export function aplicarPosPartidaCampanha(
  estado,
  resultadoPartida,
  no,
  { rngDesempateChefao = Math.random, rngEvolucao = Math.random } = {},
) {
  const mods = obterModsCampanha(estado);
  const ehChefao = no.tipo === TIPOS_NO.CHEFAO;
  let resultadoFinal = resultadoPartida.resultado;
  let notaDesempate = '';

  // Se o Chefão terminar empatado em 10 turnos, disputa pênaltis para decisão imediata
  if (ehChefao && resultadoFinal === 'empate') {
    const venceuPenaltis = rngDesempateChefao() < 0.52;
    resultadoFinal = venceuPenaltis ? 'vitoria' : 'derrota';
    notaDesempate = venceuPenaltis
      ? ' Empate no tempo normal; vitória nos pênaltis!'
      : ' Empate no tempo normal; derrota nos pênaltis.';
  }

  // 1. Atualiza estamina e lesões (antes da recuperação entre nós)
  const estaminaFinal = resultadoPartida.estaminaFinal || {};
  const lesionadosSet = new Set(resultadoPartida.lesionados || []);
  const nomesLesionados = [];

  for (const j of estado.elenco) {
    if (typeof estaminaFinal[j.id] === 'number') {
      j.extras.estamina = Math.max(0, Math.min(100, estaminaFinal[j.id]));
    }
    if (lesionadosSet.has(j.id)) {
      j.lesionado = true;
      nomesLesionados.push(j.nomeCurto);
    }
  }

  // 1b. Evolução dos jovens da base que atuaram na partida (+1 atributo aleatório por partida)
  const jovensEvoluidos = [];
  if (mods.jovemEvolucaoPorPartida > 0) {
    const participantesSet = new Set(resultadoPartida.participantesIds || []);
    for (const j of estado.elenco) {
      if (!j.ehJovem || !participantesSet.has(j.id)) continue;
      const chaves = j.ehGoleiro
        ? ['defesa', 'posicionamento', 'passe', 'dominio', 'interceptacao']
        : ATRIBUTOS_LINHA;
      const elegiveis = chaves.filter((attr) => (j.atributos?.[attr] ?? 100) < 100);
      if (elegiveis.length === 0) continue;
      const attrEscolhido = elegiveis[Math.floor(rngEvolucao() * elegiveis.length)];
      const delta = ajustarAtributoClamped(j, attrEscolhido, mods.jovemEvolucaoPorPartida);
      if (delta > 0) {
        jovensEvoluidos.push({
          jogadorId: j.id,
          nome: j.nomeCurto,
          atributo: attrEscolhido,
          rotuloAtributo: ROTULOS_ATRIBUTOS[attrEscolhido] || attrEscolhido,
          ganho: delta,
        });
      }
    }
  }

  // 2. Recuperação entre nós (+10 base + Equipamentos + Fisiologista) após registro das lesões
  aplicarRecuperacaoEntreNos(estado);

  // 3. Renda da partida + patrocínios ativos (com Torcida) + bilheteria do Estádio
  const fatorReceita = mods.fatorReceita ?? 1;
  const rendaBaseBruta = CAMPANHA_CONFIG.rendaPartida[resultadoFinal] ?? 0;
  const rendaBase = Math.round(rendaBaseBruta * fatorReceita);

  let rendaPatrocinioBruta = 0;
  const contratosRestantes = [];

  for (const contrato of estado.contratosPatrocinio || []) {
    if (contrato.partidasRestantes > 0) {
      rendaPatrocinioBruta += contrato.valorPorPartida;
      const restante = contrato.partidasRestantes - 1;
      if (restante > 0) {
        contratosRestantes.push({ ...contrato, partidasRestantes: restante });
      }
    }
  }
  estado.contratosPatrocinio = contratosRestantes;
  const rendaPatrocinio = Math.round(rendaPatrocinioBruta * fatorReceita);
  const bilheteria = mods.bilheteriaPorPartida || 0;
  const rendaTotal = rendaBase + rendaPatrocinio + bilheteria;
  estado.dinheiro += rendaTotal;

  // 4. Estatísticas e moral de uso único
  estado.partidasDisputadas += 1;
  if (resultadoFinal === 'vitoria') {
    estado.vitorias += 1;
    estado.derrotasSeguidas = 0;
  } else if (resultadoFinal === 'empate') {
    estado.empates += 1;
    estado.derrotasSeguidas = 0;
  } else {
    estado.derrotas += 1;
    estado.derrotasSeguidas += 1;
  }

  const moralUsada = estado.moral || 0;
  estado.moral = 0;

  // 5. Atualiza nó atual e histórico
  estado.noAtualId = no.id;
  estado.camadaAtual = no.camada;
  if (!estado.nosVisitados.includes(no.id)) {
    estado.nosVisitados.push(no.id);
  }
  estado.noPendente = null;

  const placarStr = `${resultadoPartida.placar.meuTime} × ${resultadoPartida.placar.rival}`;
  const nomeRival = resultadoPartida.rivalNome || 'Adversário';
  const extrasRenda = [];
  if (rendaPatrocinio > 0) extrasRenda.push(`$${rendaPatrocinio} patrocínio`);
  if (bilheteria > 0) extrasRenda.push(`$${bilheteria} estádio`);

  const notaJovens =
    jovensEvoluidos.length > 0
      ? ` Base: ${jovensEvoluidos.map((e) => `${e.nome} +${e.ganho} ${e.rotuloAtributo}`).join(', ')}.`
      : '';

  const resumo =
    `${resultadoFinal === 'vitoria' ? 'Vitória' : resultadoFinal === 'empate' ? 'Empate' : 'Derrota'} ` +
    `(${placarStr} vs ${nomeRival}).${notaDesempate} ` +
    `Renda +$${rendaTotal}${extrasRenda.length > 0 ? ` (incl. ${extrasRenda.join(', ')})` : ''}.` +
    (nomesLesionados.length > 0 ? ` Lesões: ${nomesLesionados.join(', ')}.` : '') +
    notaJovens;

  estado.historico.unshift({
    camada: no.camada,
    noId: no.id,
    tipo: no.tipo,
    resultado: resultadoFinal,
    placar: resultadoPartida.placar,
    rivalNome: nomeRival,
    renda: rendaTotal,
    bilheteria,
    lesionados: nomesLesionados,
    jovensEvoluidos,
    moralUsada,
    resumo,
  });

  // 6. Condições de vitória/derrota da campanha
  const nomeClube = mods.clubeNome || estado.clubeNome || 'Atlético Brisa';
  if (ehChefao) {
    if (resultadoFinal === 'vitoria') {
      estado.status = 'vitoria';
      estado.motivoFim = `Campeão! O ${nomeClube} venceu ${nomeRival} por ${placarStr} na grande final.${notaDesempate}`;
    } else {
      estado.status = 'derrota';
      estado.motivoFim = `A diretoria demitiu o técnico após a derrota para ${nomeRival} na grande final (${placarStr}).${notaDesempate}`;
    }
  } else if (estado.derrotasSeguidas >= CAMPANHA_CONFIG.derrotasSeguidasLimite) {
    estado.status = 'derrota';
    estado.motivoFim = `A diretoria demitiu o técnico após ${CAMPANHA_CONFIG.derrotasSeguidasLimite} derrotas seguidas.`;
  }

  return {
    resultadoFinal,
    rendaBase,
    rendaPatrocinio,
    bilheteria,
    rendaTotal,
    nomesLesionados,
    jovensEvoluidos,
    resumo,
    statusCampanha: estado.status,
  };
}

/**
 * Gera 3 opções determinísticas de treino para um jogador específico:
 * combina aumentos de +3 em atributos e habilidades compatíveis (incluindo pacotes desbloqueados).
 */
export function gerarOpcoesTreinoParaJogador(estado, no, jogadorId) {
  const jogador = estado.elenco.find((j) => j.id === jogadorId);
  if (!jogador) return [];

  const mods = obterModsCampanha(estado);
  const habsPool = obterHabilidadesDisponiveis(mods.pacotesDesbloqueados);

  const rng = criarRng(`${estado.seed}::treino::${no.id}::${jogador.id}`);
  const opcoes = [];

  const habsAtuais = (jogador.extras?.habilidades || []).map((h) =>
    typeof h === 'string' ? h : h.id,
  );
  const podeAprenderHab = habsAtuais.length < 2;
  const habsElegiveis = podeAprenderHab
    ? habsPool.filter(
        (h) => !habsAtuais.includes(h.id) && jogadorPodeTerHabilidade(jogador, h),
      )
    : [];

  // Garante 1 opção de aprender habilidade se houver elegível (< 2)
  if (habsElegiveis.length > 0) {
    const escolhida = habsElegiveis[Math.floor(rng() * habsElegiveis.length)];
    opcoes.push({
      id: `hab:${escolhida.id}`,
      tipo: 'habilidade',
      habilidadeId: escolhida.id,
      titulo: `Aprender: ${escolhida.nome}`,
      descricao: escolhida.descricao,
    });
  }

  const attrsPool = jogador.ehGoleiro
    ? ['defesa', 'posicionamento', 'passe', 'dominio', 'interceptacao']
    : [...ATRIBUTOS_LINHA];

  const embaralhados = [...attrsPool];
  for (let i = embaralhados.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [embaralhados[i], embaralhados[j]] = [embaralhados[j], embaralhados[i]];
  }

  for (const attr of embaralhados) {
    if (opcoes.length >= CAMPANHA_CONFIG.opcoesTreinoSorteadas) break;
    const valorAtual = jogador.atributos[attr] ?? 70;
    if (valorAtual >= 100) continue;
    opcoes.push({
      id: `attr:${attr}`,
      tipo: 'atributo',
      atributo: attr,
      bonus: CAMPANHA_CONFIG.bonusAtributoTreino,
      titulo: `+${CAMPANHA_CONFIG.bonusAtributoTreino} ${ROTULOS_ATRIBUTOS[attr] || attr}`,
      descricao: `${ROTULOS_ATRIBUTOS[attr] || attr}: ${valorAtual} → ${Math.min(100, valorAtual + CAMPANHA_CONFIG.bonusAtributoTreino)}`,
    });
  }

  // Fallback se algum atributo estivesse no teto 100
  while (opcoes.length < CAMPANHA_CONFIG.opcoesTreinoSorteadas && embaralhados.length > 0) {
    const attr = embaralhados.pop();
    if (!opcoes.some((o) => o.atributo === attr)) {
      opcoes.push({
        id: `attr:${attr}`,
        tipo: 'atributo',
        atributo: attr,
        bonus: CAMPANHA_CONFIG.bonusAtributoTreino,
        titulo: `+${CAMPANHA_CONFIG.bonusAtributoTreino} ${ROTULOS_ATRIBUTOS[attr] || attr}`,
        descricao: `Refina ${ROTULOS_ATRIBUTOS[attr] || attr} (+${CAMPANHA_CONFIG.bonusAtributoTreino}).`,
      });
    }
  }

  return opcoes;
}

export function aplicarTreino(estado, no, jogadorId, opcaoId) {
  const jogador = estado.elenco.find((j) => j.id === jogadorId);
  if (!jogador) return { valido: false, motivo: 'Jogador não encontrado.' };

  const opcoes = gerarOpcoesTreinoParaJogador(estado, no, jogadorId);
  const opcao = opcoes.find((o) => o.id === opcaoId);
  if (!opcao) return { valido: false, motivo: 'Opção de treino inválida.' };

  let resumo = '';
  if (opcao.tipo === 'habilidade') {
    const habs = jogador.extras?.habilidades || [];
    if (habs.length >= 2) {
      return { valido: false, motivo: `${jogador.nomeCurto} já possui 2 habilidades.` };
    }
    const inst = criarInstanciaHabilidade(opcao.habilidadeId);
    if (!inst) return { valido: false, motivo: 'Habilidade inválida.' };
    jogador.extras.habilidades.push(inst);
    resumo = `${jogador.nomeCurto} aprendeu a habilidade ${opcao.titulo.replace('Aprender: ', '')}!`;
  } else {
    const ganho = ajustarAtributoClamped(jogador, opcao.atributo, opcao.bonus);
    resumo = `${jogador.nomeCurto} treinou e ganhou +${ganho} em ${ROTULOS_ATRIBUTOS[opcao.atributo]}.`;
  }

  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, resumo };
}

export function aplicarDescansoTotal(estado, no) {
  for (const j of estado.elenco) {
    if (!j.extras) j.extras = {};
    j.extras.estamina = 100;
  }
  const resumo = 'Descanso total concluído: todo o elenco voltou para 100% de estamina.';
  registrarVisitaNo(estado, no, { resumo }, { recuperarEntreNos: false });
  return { valido: true, resumo };
}

export function aplicarFisioterapia(estado, no) {
  const curados = [];
  for (const j of estado.elenco) {
    if (j.lesionado) {
      j.lesionado = false;
      curados.push(j.nomeCurto);
    }
  }
  const resumo =
    curados.length > 0
      ? `Fisioterapia concluída! Alta médica para: ${curados.join(', ')}.`
      : 'Fisioterapia concluída! Nenhum atleta estava lesionado, e o grupo recuperou +10 de estamina.';
  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, curados, resumo };
}

export function aplicarTorcida(estado, no) {
  estado.moral += CAMPANHA_CONFIG.moralTorcida;
  const resumo = `Recepção calorosa da torcida! Moral +${CAMPANHA_CONFIG.moralTorcida} em todos os atributos na próxima partida.`;
  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, moral: estado.moral, resumo };
}

export function gerarOfertasPatrocinio(estado, no) {
  const mods = obterModsCampanha(estado);
  const fatorReceita = mods.fatorReceita ?? 1;
  const rng = criarRng(`${estado.seed}::patrocinio::${no.id}`);
  const valorImediatoBase =
    Math.round(
      inteiroAleatorio(
        CAMPANHA_CONFIG.patrocinioImediatoMin,
        CAMPANHA_CONFIG.patrocinioImediatoMax,
        rng,
      ) / 10,
    ) * 10;

  let valorPorPartida =
    Math.round(
      inteiroAleatorio(
        CAMPANHA_CONFIG.patrocinioPorPartidaMin,
        CAMPANHA_CONFIG.patrocinioPorPartidaMax,
        rng,
      ) / 5,
    ) * 5;

  const partidas = CAMPANHA_CONFIG.patrocinioPartidasDuracao;
  while (valorPorPartida * partidas <= valorImediatoBase + 20) {
    valorPorPartida += 5;
  }

  const valorImediato = Math.round(valorImediatoBase * fatorReceita);
  const valorPorPartidaEfetivo = Math.round(valorPorPartida * fatorReceita);

  return [
    {
      id: 'imediato',
      nome: 'Cota Máster à Vista',
      tipo: 'imediato',
      valorImediato,
      descricao: `Receba $${valorImediato} imediatamente no caixa do clube${fatorReceita > 1 ? ' (inclui bônus Torcida)' : ''}.`,
    },
    {
      id: 'parcelado',
      nome: 'Contrato por Produtividade (4 jogos)',
      tipo: 'parcelado',
      valorPorPartida,
      valorPorPartidaEfetivo,
      partidas,
      totalPossivel: valorPorPartidaEfetivo * partidas,
      descricao: `Receba $${valorPorPartidaEfetivo} ao final de cada uma das próximas ${partidas} partidas (total $${valorPorPartidaEfetivo * partidas}).`,
    },
  ];
}

export function escolherPatrocinio(estado, no, ofertaId) {
  const ofertas = gerarOfertasPatrocinio(estado, no);
  const oferta = ofertas.find((o) => o.id === ofertaId);
  if (!oferta) return { valido: false, motivo: 'Oferta inválida.' };

  let resumo = '';
  if (oferta.tipo === 'imediato') {
    estado.dinheiro += oferta.valorImediato;
    resumo = `Patrocínio assinado: +$${oferta.valorImediato} imediatos no caixa!`;
  } else {
    estado.contratosPatrocinio.push({
      id: `${no.id}_pat`,
      nome: oferta.nome,
      valorPorPartida: oferta.valorPorPartida,
      partidasRestantes: oferta.partidas,
    });
    resumo = `Contrato assinado: +$${oferta.valorPorPartidaEfetivo} por partida pelos próximos ${oferta.partidas} jogos.`;
  }

  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, resumo };
}

/**
 * Gera 4 jogadores padrão no Mercado (100 a 400 base) + N jovens promissores da Base (45 a 55),
 * aplicando eventual desconto do técnico Negociador (−15%).
 */
export function gerarOfertasMercado(estado, no) {
  const mods = obterModsCampanha(estado);
  const habsPool = obterHabilidadesDisponiveis(mods.pacotesDesbloqueados);
  const fatorPreco = mods.fatorPrecoMercado ?? 1;
  const qtdJovens = mods.jovensNoMercado || 0;

  const rng = criarRng(`${estado.seed}::mercado::${no.id}`);
  const modelosPos = [
    { posicao: 'GOL', papel: 'GOL', setor: 'GOL', ehGoleiro: true },
    { posicao: 'ZAG', papel: 'ZAG2', setor: 'DEF', ehGoleiro: false },
    { posicao: 'LE', papel: 'LAT_E', setor: 'DEF', ehGoleiro: false },
    { posicao: 'LD', papel: 'LAT_D', setor: 'DEF', ehGoleiro: false },
    { posicao: 'VOL', papel: 'VOL', setor: 'MEI', ehGoleiro: false },
    { posicao: 'ME', papel: 'MEI_E', setor: 'MEI', ehGoleiro: false },
    { posicao: 'PE', papel: 'PONTA_E', setor: 'ATA', ehGoleiro: false },
    { posicao: 'CA', papel: 'CA', setor: 'ATA', ehGoleiro: false },
  ];

  // Escolhe 4 posições variadas
  const poolPos = [...modelosPos];
  const escolhidos = [];
  for (let i = 0; i < CAMPANHA_CONFIG.mercadoQuantidadeJogadores; i += 1) {
    const idx = Math.floor(rng() * poolPos.length);
    escolhidos.push(poolPos.splice(idx, 1)[0]);
  }

  const ofertasRegulares = escolhidos.map((spec, idx) => {
    const nivelAlvo = inteiroAleatorio(66, 86, rng);
    const nomeP = NOMES_MERCADO_P[Math.floor(rng() * NOMES_MERCADO_P.length)];
    const nomeS = NOMES_MERCADO_S[Math.floor(rng() * NOMES_MERCADO_S.length)];

    const attr = (bias = 0) =>
      Math.max(30, Math.min(96, nivelAlvo + bias + inteiroAleatorio(-6, 6, rng)));

    const atributos = {
      passe: attr(spec.setor === 'MEI' ? 5 : 0),
      dominio: attr(spec.setor !== 'DEF' ? 3 : 0),
      posicionamento: attr(2),
      marcacao: attr(spec.setor === 'DEF' ? 6 : spec.setor === 'ATA' ? -15 : 0),
      interceptacao: attr(spec.setor === 'DEF' || spec.posicao === 'VOL' ? 5 : -8),
      desarme: attr(spec.setor === 'DEF' ? 6 : spec.setor === 'ATA' ? -16 : 0),
      velocidade: attr(['LE', 'LD', 'PE', 'PD'].includes(spec.posicao) ? 7 : 0),
      tecnica: attr(spec.setor === 'MEI' || spec.setor === 'ATA' ? 5 : 0),
      finalizacao: attr(spec.setor === 'ATA' ? 7 : spec.setor === 'DEF' ? -16 : -2),
      agressividade: attr(-10),
      ...(spec.ehGoleiro ? { defesa: attr(7) } : {}),
    };

    const jogador = {
      id: `mer_${no.id}_${idx}`,
      nome: `${nomeP} ${nomeS}`,
      nomeCurto: nomeP,
      posicao: spec.posicao,
      papel: spec.papel,
      setor: spec.setor,
      ehGoleiro: spec.ehGoleiro,
      ehJovem: false,
      lesionado: false,
      iniciaComBola: false,
      zona: null,
      zonaBase: null,
      atributos,
      extras: {
        estamina: 100,
        habilidades: [],
        cartoes: { amarelos: 0, vermelho: false },
        substituido: false,
      },
    };

    const compativeis = habsPool.filter((h) => jogadorPodeTerHabilidade(jogador, h));
    if (compativeis.length > 0 && (nivelAlvo >= 75 || rng() < 0.5)) {
      const hab = compativeis[Math.floor(rng() * compativeis.length)];
      jogador.extras.habilidades.push(criarInstanciaHabilidade(hab.id));
    }

    const precoBase = calcularValorMercadoJogador(jogador);
    const preco = Math.max(40, Math.round(precoBase * fatorPreco));
    return {
      indice: idx,
      ehJovem: false,
      jogador,
      precoBase,
      preco,
      media: Math.round(calcularMediaJogador(jogador)),
    };
  });

  // Jovens promissores das Categorias de Base (atributos 45..55, preço baixo, evoluem +1/jogo)
  const ofertasJovens = [];
  const poolJovemPos = modelosPos.filter((m) => !m.ehGoleiro);
  for (let k = 0; k < qtdJovens; k += 1) {
    const spec =
      k === qtdJovens - 1 && qtdJovens >= 4
        ? modelosPos[0]
        : poolJovemPos[Math.floor(rng() * poolJovemPos.length)];
    const nomeP = NOMES_MERCADO_P[Math.floor(rng() * NOMES_MERCADO_P.length)];
    const nomeS = NOMES_MERCADO_S[Math.floor(rng() * NOMES_MERCADO_S.length)];
    const attrJovem = () => inteiroAleatorio(45, 55, rng);

    const atributos = {
      passe: attrJovem(),
      dominio: attrJovem(),
      posicionamento: attrJovem(),
      marcacao: attrJovem(),
      interceptacao: attrJovem(),
      desarme: attrJovem(),
      velocidade: attrJovem(),
      tecnica: attrJovem(),
      finalizacao: attrJovem(),
      agressividade: inteiroAleatorio(35, 55, rng),
      ...(spec.ehGoleiro ? { defesa: attrJovem() } : {}),
    };

    const jogador = {
      id: `jovem_${no.id}_${k}`,
      nome: `${nomeP} ${nomeS}`,
      nomeCurto: nomeP,
      posicao: spec.posicao,
      papel: spec.papel,
      setor: spec.setor,
      ehGoleiro: spec.ehGoleiro,
      ehJovem: true,
      lesionado: false,
      iniciaComBola: false,
      zona: null,
      zonaBase: null,
      atributos,
      extras: {
        estamina: 100,
        habilidades: [],
        cartoes: { amarelos: 0, vermelho: false },
        substituido: false,
      },
    };

    const indice = ofertasRegulares.length + k;
    const precoBase = inteiroAleatorio(45, 70, rng);
    const preco = Math.max(30, Math.round(precoBase * fatorPreco));
    ofertasJovens.push({
      indice,
      ehJovem: true,
      jogador,
      precoBase,
      preco,
      media: Math.round(calcularMediaJogador(jogador)),
    });
  }

  return [...ofertasRegulares, ...ofertasJovens];
}

export function comprarJogadorMercado(estado, no, ofertaMercado, ofertasAtuais) {
  if (!ofertaMercado || ofertaMercado.comprado) {
    return { valido: false, motivo: 'Jogador indisponível.' };
  }
  if (estado.elenco.length >= CAMPANHA_CONFIG.maxElenco) {
    return {
      valido: false,
      motivo: `Elenco cheio (${estado.elenco.length}/${CAMPANHA_CONFIG.maxElenco}). Venda um jogador antes de contratar.`,
    };
  }
  if (estado.dinheiro < ofertaMercado.preco) {
    return { valido: false, motivo: 'Dinheiro insuficiente para esta contratação.' };
  }

  estado.dinheiro -= ofertaMercado.preco;
  const contratado = structuredClone(ofertaMercado.jogador);
  contratado.id = `cmp_${no.id}_${Date.now().toString(36).slice(-4)}_${ofertaMercado.indice}`;
  estado.elenco.push(contratado);
  ofertaMercado.comprado = true;

  if (ofertasAtuais) {
    ofertasAtuais[ofertaMercado.indice] = ofertaMercado;
  }

  return {
    valido: true,
    jogador: contratado,
    resumo: `${contratado.nome} (${contratado.posicao}) contratado por $${ofertaMercado.preco}.`,
  };
}

export function calcularValorVendaElenco(estado, jogador) {
  const mods = obterModsCampanha(estado);
  const valorMercado = jogador?.ehJovem
    ? Math.max(60, calcularValorMercadoJogador(jogador))
    : calcularValorMercadoJogador(jogador);
  const fatorVenda =
    CAMPANHA_CONFIG.mercadoFatorVenda * (1 + (mods.bonusVendaMercadoPct || 0));
  return Math.round(valorMercado * fatorVenda);
}

export function venderJogadorElenco(estado, jogadorId) {
  if (estado.elenco.length <= CAMPANHA_CONFIG.minElenco) {
    return {
      valido: false,
      motivo: `Mínimo de ${CAMPANHA_CONFIG.minElenco} jogadores no elenco necessário para entrar em campo.`,
    };
  }
  const idx = estado.elenco.findIndex((j) => j.id === jogadorId);
  if (idx === -1) return { valido: false, motivo: 'Jogador não encontrado.' };

  const jogador = estado.elenco[idx];
  if (jogador.ehGoleiro) {
    const outrosGoleiros = estado.elenco.filter((j) => j.ehGoleiro && j.id !== jogador.id);
    if (outrosGoleiros.length === 0) {
      return { valido: false, motivo: 'Você precisa manter pelo menos 1 goleiro no elenco.' };
    }
  }

  const mods = obterModsCampanha(estado);
  const valorVenda = calcularValorVendaElenco(estado, jogador);

  estado.elenco.splice(idx, 1);
  estado.dinheiro += valorVenda;

  const pct = Math.round(50 * (1 + (mods.bonusVendaMercadoPct || 0)));
  return {
    valido: true,
    valorVenda,
    jogador,
    resumo: `${jogador.nome} negociado por $${valorVenda} (${pct}% do valor de mercado).`,
  };
}

export function sairDoMercado(estado, no, resumo = 'Mercado encerrado.') {
  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, resumo };
}

export function sortearEventoCampanha(estado, no) {
  const mods = obterModsCampanha(estado);
  const pool = obterEventosDisponiveis(mods.pacotesDesbloqueados);
  const rng = criarRng(`${estado.seed}::evento::${no.id}`);
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}

export function aplicarEscolhaEvento(estado, no, evento, escolhaId) {
  const escolha = evento?.escolhas?.find((e) => e.id === escolhaId);
  if (!escolha) return { valido: false, motivo: 'Escolha inválida.' };

  const rng = criarRng(`${estado.seed}::evento_exec::${no.id}::${escolhaId}`);
  const res = escolha.aplicar(estado, rng);
  if (!res?.valido) return res;

  registrarVisitaNo(estado, no, { resumo: `${evento.titulo}: ${res.resumo}` });
  return { valido: true, resumo: res.resumo };
}

/**
 * Sorteia o resultado do nó Misterioso (?) entre:
 * 'evento', 'partida' (média), 'dinheiro' (+100) ou 'descanso'.
 */
export function sortearResultadoMisterioso(estado, no) {
  const mods = obterModsCampanha(estado);
  const rng = criarRng(`${estado.seed}::misterioso::${no.id}`);
  const opcoes = CAMPANHA_CONFIG.opcoesMisterioso;
  const desfecho = opcoes[Math.floor(rng() * opcoes.length)];

  if (desfecho === 'dinheiro') {
    return {
      tipo: 'dinheiro',
      titulo: 'Patrocinador Relâmpago!',
      descricao: `Uma ação local rendeu +$${CAMPANHA_CONFIG.misteriosoBonusDinheiro} inesperados para o clube.`,
    };
  }
  if (desfecho === 'descanso') {
    return {
      tipo: 'descanso',
      titulo: 'Pousada Tranquila',
      descricao: 'O elenco encontrou um refúgio silencioso e descansou completamente (100% estamina).',
    };
  }
  if (desfecho === 'partida') {
    const forcaMedia = Math.round((estado.mediaInicialTitulares + 6 + (mods.bonusForcaRival || 0)) * 10) / 10;
    return {
      tipo: 'partida',
      forcaPersonalizada: forcaMedia,
      titulo: 'Desafio Surpresa!',
      descricao: `Um adversário de força média desafiou o ${mods.clubeNome || 'Atlético Brisa'} para uma partida extra.`,
    };
  }
  const evento = sortearEventoCampanha(estado, no);
  return {
    tipo: 'evento',
    evento,
    titulo: evento.titulo,
    descricao: evento.descricao,
  };
}

export function concluirMisteriosoDireto(estado, no, desfechoMisterioso) {
  if (desfechoMisterioso.tipo === 'dinheiro') {
    estado.dinheiro += CAMPANHA_CONFIG.misteriosoBonusDinheiro;
    const resumo = `Nó misterioso: +$${CAMPANHA_CONFIG.misteriosoBonusDinheiro} no caixa do clube.`;
    registrarVisitaNo(estado, no, { resumo });
    return { valido: true, resumo };
  }
  if (desfechoMisterioso.tipo === 'descanso') {
    for (const j of estado.elenco) {
      j.extras.estamina = 100;
    }
    const resumo = 'Nó misterioso virou descanso total: todo o elenco com 100% de estamina!';
    registrarVisitaNo(estado, no, { resumo }, { recuperarEntreNos: false });
    return { valido: true, resumo };
  }
  return { valido: false, motivo: 'Este resultado misterioso exige interação própria.' };
}

/**
 * Helper de alto nível para criar uma nova campanha já com o mapa gerado e modificadoresMeta aplicados.
 */
export function iniciarNovaCampanha(seed = null, metaEstado = null, opcoesMeta = {}) {
  const mods = modificadoresMeta(metaEstado, opcoesMeta);
  return criarEstadoCampanhaBase({
    seed,
    geradorMapa: gerarMapaCampanha,
    modificadores: mods,
  });
}
