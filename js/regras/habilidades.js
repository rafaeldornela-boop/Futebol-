/**
 * Motor de habilidades especiais guiado pelos modificadores declarativos em `js/dados/habilidades.js`.
 *
 * Responsável por:
 * - Normalizar instâncias de habilidades nos jogadores (máx. 2, nível inicial 1, usos por partida)
 * - Consultar modificadores passivos (atributos, aura em campo, interceptação, bônus de passe, redução de custo)
 * - Avaliar aplicabilidade, custo efetivo e disponibilidade de habilidades ativas ofensivas e defensivas
 * - Consumir usos de habilidades ativas e registrar habilidades aplicadas para depuração
 */

import {
  obterDefinicaoHabilidade,
  TIPOS_HABILIDADE,
} from '../dados/habilidades.js';
import {
  obterDistanciaZonas,
  obterFaixa,
  ZONAS,
} from '../dados/zonas.js';

export const MAX_HABILIDADES_POR_JOGADOR = 2;

/**
 * Converte uma entrada (string ID ou objeto) na instância de habilidade do jogador.
 */
export function criarInstanciaHabilidade(entrada) {
  const id = typeof entrada === 'string' ? entrada : entrada?.id;
  const def = obterDefinicaoHabilidade(id);
  if (!def) return null;

  const usosTotais = def.tipo === TIPOS_HABILIDADE.ATIVA ? def.usos ?? 1 : null;
  const usosRestantes =
    def.tipo === TIPOS_HABILIDADE.ATIVA
      ? typeof entrada === 'object' && typeof entrada.usosRestantes === 'number'
        ? Math.max(0, entrada.usosRestantes)
        : usosTotais
      : null;

  return {
    id: def.id,
    nivel: typeof entrada === 'object' && entrada.nivel ? entrada.nivel : def.nivel,
    usosTotais,
    usosRestantes,
  };
}

/**
 * Retorna a lista de habilidades de um jogador já enriquecida com a definição do catálogo.
 */
export function obterHabilidadesJogador(jogador) {
  const lista = jogador?.extras?.habilidades;
  if (!Array.isArray(lista) || lista.length === 0) return [];

  const resultado = [];
  for (const entrada of lista.slice(0, MAX_HABILIDADES_POR_JOGADOR)) {
    const inst = criarInstanciaHabilidade(entrada);
    if (!inst) continue;
    const def = obterDefinicaoHabilidade(inst.id);
    resultado.push({
      ...def,
      nivel: inst.nivel,
      usosTotais: inst.usosTotais,
      usosRestantes: inst.usosRestantes,
      instancia: typeof entrada === 'object' ? entrada : inst,
    });
  }
  return resultado;
}

export function jogadorTemHabilidade(jogador, habilidadeId) {
  return obterHabilidadesJogador(jogador).some((h) => h.id === habilidadeId);
}

/**
 * Garante que todas as entradas em `jogador.extras.habilidades` sejam objetos mutáveis com `usosRestantes`.
 */
export function inicializarHabilidadesJogador(jogador) {
  if (!jogador) return;
  if (!jogador.extras) jogador.extras = {};
  const bruta = Array.isArray(jogador.extras.habilidades)
    ? jogador.extras.habilidades
    : [];
  jogador.extras.habilidades = bruta
    .slice(0, MAX_HABILIDADES_POR_JOGADOR)
    .map(criarInstanciaHabilidade)
    .filter(Boolean);
}

export function inicializarHabilidadesTimes(times) {
  for (const time of Object.values(times || {})) {
    for (const j of time?.jogadores || []) inicializarHabilidadesJogador(j);
    for (const r of time?.reservas || []) inicializarHabilidadesJogador(r);
  }
}

/**
 * Consulta o multiplicador de redução de custo de estamina (ex.: Fôlego = -20%) e o aplica ao custo bruto.
 */
export function calcularCustoEstaminaComHabilidades(
  jogador,
  custoBruto,
  reducaoMeta = 0,
) {
  if (!custoBruto || custoBruto <= 0) {
    return { custoFinal: 0, reducao: 0, habilidades: [] };
  }

  let reducaoTotal = 0;
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(jogador)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'reducao_custo_estamina'
    ) {
      reducaoTotal = Math.min(0.8, reducaoTotal + (hab.efeito.reducaoPercentual || 0));
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: jogador.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  const redMetaVal = Math.max(0, Number(reducaoMeta) || 0);
  let custoFinal = custoBruto;

  if (redMetaVal > 0) {
    const fator = Math.max(0.15, 1 - reducaoTotal - redMetaVal);
    custoFinal = Math.max(0.25, Math.round(custoBruto * fator * 100) / 100);
  } else if (reducaoTotal > 0) {
    custoFinal = Math.max(1, Math.floor(custoBruto * (1 - reducaoTotal) + 1e-9));
  }

  return {
    custoFinal,
    reducao: reducaoTotal + redMetaVal,
    habilidades: aplicadas,
  };
}

/**
 * Coleta bônus passivos de aura coletiva (ex.: Liderança enquanto jogador ativo está em campo).
 */
export function coletarModificadoresPassivosTime(jogadores) {
  const bonusAtributosLinha = {};
  const habilidadesAura = [];

  for (const j of jogadores || []) {
    if (!j || j.extras?.cartoes?.vermelho || !j.zona) continue;
    for (const hab of obterHabilidadesJogador(j)) {
      if (
        hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
        hab.efeito?.tipo === 'aura_atributo_linha'
      ) {
        const attr = hab.efeito.atributo;
        bonusAtributosLinha[attr] =
          (bonusAtributosLinha[attr] || 0) + (hab.efeito.bonus || 0);
        habilidadesAura.push({
          id: hab.id,
          nome: hab.nome,
          jogador: j.nomeCurto,
          tipo: 'passiva',
          atributo: attr,
          bonus: hab.efeito.bonus,
          detalhe: `+${hab.efeito.bonus} ${attr} (em campo)`,
        });
      }
    }
  }

  return {
    bonusAtributosLinha,
    habilidadesAura,
  };
}

/**
 * Retorna o multiplicador de força de interceptação (linha de passe) de um defensor.
 */
export function obterModificadorInterceptacaoJogador(defensor) {
  let multiplicador = 1;
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(defensor)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'multiplicador_forca_interceptacao'
    ) {
      multiplicador *= hab.efeito.multiplicador || 1;
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: defensor.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { multiplicador, habilidades: aplicadas };
}

/**
 * Retorna os bônus diretos de chance (%) para passes concedidos por habilidades passivas do passador.
 */
export function obterBonusPassivosPasse(passador, tipoPasseId) {
  const ajustes = [];
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(passador)) {
    if (
      hab.tipo !== TIPOS_HABILIDADE.PASSIVA ||
      hab.efeito?.tipo !== 'bonus_chance_passe'
    ) {
      continue;
    }
    const permitidos = hab.efeito.tiposPassePermitidos;
    if (!permitidos || permitidos.includes(tipoPasseId)) {
      ajustes.push({
        rotulo: hab.nome,
        valor: hab.efeito.bonusChance || 0,
      });
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: passador.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { ajustes, habilidades: aplicadas };
}

/**
 * Retorna o multiplicador de força no portador de um defensor (ex.: Muralha defensiva).
 */
export function obterModificadorPortadorJogador(defensor) {
  let multiplicador = 1;
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(defensor)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'multiplicador_forca_portador'
    ) {
      multiplicador *= hab.efeito.multiplicador || 1;
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: defensor.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { multiplicador, habilidades: aplicadas };
}

/**
 * Redução passiva da pressão no portador ao passar a bola (ex.: Sangue frio).
 */
export function obterReducaoPressaoPortadorPasse(passador) {
  let reducao = 0;
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(passador)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'reducao_pressao_portador_passe'
    ) {
      reducao = Math.min(0.8, reducao + (hab.efeito.reducao || 0));
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: passador.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { reducao, habilidades: aplicadas };
}

/**
 * Bônus passivo de chance para condução (ex.: Drible curto).
 */
export function obterBonusPassivosConducao(portador) {
  const ajustes = [];
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(portador)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'bonus_chance_conducao'
    ) {
      ajustes.push({
        rotulo: hab.nome,
        valor: hab.efeito.bonusChance || 0,
      });
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: portador.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { ajustes, habilidades: aplicadas };
}

/**
 * Bônus passivo de chance para finalização (ex.: Olho clínico).
 */
export function obterBonusPassivosFinalizacao(atacante) {
  const ajustes = [];
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(atacante)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'bonus_chance_finalizacao'
    ) {
      ajustes.push({
        rotulo: hab.nome,
        valor: hab.efeito.bonusChance || 0,
      });
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: atacante.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { ajustes, habilidades: aplicadas };
}

/**
 * Bônus passivo de defesa do goleiro (ex.: Reflexo felino).
 */
export function obterBonusPassivoDefesaGoleiro(goleiro) {
  let bonusDefesa = 0;
  const aplicadas = [];

  for (const hab of obterHabilidadesJogador(goleiro)) {
    if (
      hab.tipo === TIPOS_HABILIDADE.PASSIVA &&
      hab.efeito?.tipo === 'bonus_passivo_defesa_goleiro'
    ) {
      bonusDefesa += hab.efeito.bonusDefesa || 0;
      aplicadas.push({
        id: hab.id,
        nome: hab.nome,
        jogador: goleiro.nomeCurto,
        tipo: 'passiva',
        detalhe: hab.efeito.rotuloCurto,
      });
    }
  }

  return { bonusDefesa, habilidades: aplicadas };
}

/**
 * Verifica se uma habilidade ativa ofensiva pode ser aplicada no contexto atual (zona/alvos)
 * e retorna disponibilidade + custo com Fôlego aplicado.
 */
export function avaliarHabilidadeOfensivaPortador(estado, jogador, habilidadeId) {
  const hab = obterHabilidadesJogador(jogador).find(
    (h) =>
      h.id === habilidadeId &&
      h.tipo === TIPOS_HABILIDADE.ATIVA &&
      h.subtipo === 'ofensiva',
  );
  if (!hab) return null;

  const estaminaAtual =
    typeof jogador?.extras?.estamina === 'number' ? jogador.extras.estamina : 100;
  const timeId = estado.timeComBola;
  const reducaoMeta =
    timeId === 'meuTime' ? estado?.modificadoresMeta?.reducaoCustoEstamina || 0 : 0;
  const { custoFinal, habilidades: habsCusto } =
    calcularCustoEstaminaComHabilidades(jogador, hab.custo, reducaoMeta);
  const jaUsada = (hab.usosRestantes ?? 0) <= 0;
  const semEstamina = estaminaAtual < custoFinal;
  let aplicavel = true;
  let motivoIndisponivel = '';

  if (hab.efeito?.tipo === 'finalizacao_faixas') {
    const faixa = obterFaixa(jogador.zona, timeId);
    const permitidas = hab.efeito.faixasPermitidas || [3, 4];
    if (!permitidas.includes(faixa)) {
      aplicavel = false;
      motivoIndisponivel = `Disponível nas faixas ${permitidas.join(' e ')}`;
    }
  } else if (hab.efeito?.tipo === 'conducao_distancia') {
    const distExata = hab.efeito.distanciaExata || 2;
    const destinos = Object.keys(ZONAS).filter(
      (zId) =>
        !ZONAS[zId].foraDaGrade &&
        obterDistanciaZonas(jogador.zona, zId) === distExata,
    );
    if (destinos.length === 0) {
      aplicavel = false;
      motivoIndisponivel = 'Sem zona válida a 2 casas';
    }
  } else if (hab.efeito?.tipo === 'passe_ignora_pressao_destino') {
    const companheiros = (estado.times[timeId]?.jogadores || []).filter(
      (c) => c.id !== jogador.id && !c.extras?.cartoes?.vermelho && c.zona,
    );
    if (companheiros.length === 0) {
      aplicavel = false;
      motivoIndisponivel = 'Sem companheiro disponível';
    }
  }

  if (jaUsada) {
    motivoIndisponivel = 'Já usada na partida';
  } else if (semEstamina) {
    motivoIndisponivel = `Precisa de ${custoFinal} de estamina`;
  }

  return {
    habilidade: hab,
    jogador,
    custo: custoFinal,
    custoBase: hab.custo,
    estaminaAtual,
    usosRestantes: hab.usosRestantes ?? 0,
    usosTotais: hab.usosTotais ?? 1,
    jaUsada,
    semEstamina,
    aplicavel,
    disponivel: !jaUsada && !semEstamina && aplicavel,
    motivoIndisponivel,
    habilidadesCusto: habsCusto,
  };
}

/**
 * Lista todas as habilidades ativas ofensivas do portador atual com status de disponibilidade.
 */
export function listarHabilidadesOfensivasPortador(estado, portador) {
  if (!estado || !portador) return [];
  const lista = [];
  for (const hab of obterHabilidadesJogador(portador)) {
    if (hab.tipo === TIPOS_HABILIDADE.ATIVA && hab.subtipo === 'ofensiva') {
      const info = avaliarHabilidadeOfensivaPortador(estado, portador, hab.id);
      if (info) lista.push(info);
    }
  }
  return lista;
}

/**
 * Lista todas as habilidades ativas defensivas de jogadores ativos do time informado.
 */
export function listarHabilidadesDefensivasTime(
  estado,
  timeId = 'meuTime',
  intencaoAtacante = null,
) {
  const time = estado.times?.[timeId];
  if (!time) return [];

  const lista = [];
  for (const jogador of time.jogadores) {
    if (jogador.extras?.cartoes?.vermelho || !jogador.zona) continue;
    for (const hab of obterHabilidadesJogador(jogador)) {
      if (hab.tipo !== TIPOS_HABILIDADE.ATIVA || hab.subtipo !== 'defensiva') {
        continue;
      }

      const estaminaAtual =
        typeof jogador.extras?.estamina === 'number' ? jogador.extras.estamina : 100;
      const reducaoMeta =
        timeId === 'meuTime' ? estado?.modificadoresMeta?.reducaoCustoEstamina || 0 : 0;
      const { custoFinal, habilidades: habsCusto } =
        calcularCustoEstaminaComHabilidades(jogador, hab.custo, reducaoMeta);
      const jaUsada = (hab.usosRestantes ?? 0) <= 0;
      const semEstamina = estaminaAtual < custoFinal;

      let aplicavel = true;
      let motivoIndisponivel = '';

      if (hab.efeito?.somenteFinalizacao && intencaoAtacante?.acao !== 'finalizar') {
        aplicavel = false;
        motivoIndisponivel = 'Aplicável apenas em finalização do rival';
      }

      if (jaUsada) {
        motivoIndisponivel = 'Já usada na partida';
      } else if (semEstamina) {
        motivoIndisponivel = `Precisa de ${custoFinal} de estamina`;
      }

      lista.push({
        chaveOrdem: `hab:${hab.id}:${jogador.id}`,
        habilidade: hab,
        jogador,
        custo: custoFinal,
        custoBase: hab.custo,
        estaminaAtual,
        estaminaDepois: Math.max(0, estaminaAtual - custoFinal),
        usosRestantes: hab.usosRestantes ?? 0,
        usosTotais: hab.usosTotais ?? 1,
        jaUsada,
        semEstamina,
        aplicavel,
        disponivel: !jaUsada && !semEstamina && aplicavel,
        motivoIndisponivel,
        habilidadesCusto: habsCusto,
      });
    }
  }

  return lista;
}

/**
 * Consome 1 uso de uma habilidade ativa do jogador.
 */
export function consumirUsoHabilidade(jogador, habilidadeId) {
  if (!jogador?.extras?.habilidades) return false;
  const entrada = jogador.extras.habilidades.find(
    (h) => (typeof h === 'string' ? h : h.id) === habilidadeId,
  );
  if (!entrada || typeof entrada !== 'object') return false;
  if (typeof entrada.usosRestantes !== 'number' || entrada.usosRestantes <= 0) {
    return false;
  }
  entrada.usosRestantes -= 1;
  return true;
}
