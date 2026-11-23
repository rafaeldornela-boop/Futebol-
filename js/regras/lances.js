/**
 * Camada de Lances Contextuais, Desfechos Intermediários, Disputa de Bola Viva
 * e Narração Natural de Futebol (pt-BR).
 *
 * Separa rigorosamente:
 * 1. Resultado técnico estruturado (desfechoTecnico)
 * 2. Consequência de jogo (posse, zona, bola parada, bônus encadeado)
 * 3. Narração de futebol natural por templates determinísticos (sem % ou números crus)
 */

import { obterCorredor, obterFaixa, zonaParaPontoDeVista } from '../dados/zonas.js';
import { obterAtributoEfetivo, obterEstamina } from './estamina.js';
import { obterAtributoMental } from '../jogador/identidade.js';

export const TIPOS_DESFECHO_TECNICO = Object.freeze({
  PASSE_PERFEITO: 'passe_perfeito',
  PASSE_BOM: 'passe_bom',
  PASSE_DIFICIL: 'passe_dificil',
  PASSE_FORTE: 'passe_forte',
  PASSE_CURTO: 'passe_curto',
  PASSE_DESVIADO: 'passe_desviado',
  INTERCEPTACAO: 'interceptacao',
  DOMINIO_RUIM: 'dominio_ruim',
  BOLA_SOLTA: 'bola_solta',
  DISPUTA: 'disputa',
  DESARME: 'desarme',
  ERRO_EXECUCAO: 'erro_execucao',
  FALTA: 'falta',
  FALTA_PERIGOSA: 'falta_perigosa',
  PENALTI: 'penalti',
  RECUPERACAO: 'recuperacao',
  SEGUNDA_BOLA: 'segunda_bola',
  DRIBLE_LIMPO: 'drible_limpo',
  VANTAGEM_CRIADA: 'vantagem_criada',
  DEFENSOR_DESLOCADO: 'defensor_deslocado',
  BOLA_ESCAPANDO: 'bola_escapando',
  GOL: 'gol',
  DEFESA: 'defesa',
  DEFESA_DIFICIL: 'defesa_dificil',
  REBOTE: 'rebote',
  BLOQUEIO: 'bloqueio',
  PARA_FORA: 'para_fora',
  FINALIZACAO_FRACA: 'finalizacao_fraca',
  FINALIZACAO_DESVIADA: 'finalizacao_desviada',
  BOLA_NA_TRAVE: 'bola_na_trave',
  CORTE: 'corte',
  DESVIO: 'desvio',
  ESCANTEIO: 'escanteio',
  CONTRA_ATAQUE: 'contra_ataque',
});

/**
 * Classificação contextual rica do passe (além do tipo geométrico curto/tras/lateral/frente/longo/invertido).
 */
export function classificarContextoPasse({
  tipoId,
  zonaOrigem,
  zonaDestino,
  timeId,
  pressaoOrigem = 0,
  pressaoDestino = 0,
  pressaoIntermediaria = 0,
}) {
  const faixaOrig = obterFaixa(zonaOrigem, timeId);
  const faixaDest = obterFaixa(zonaDestino, timeId);
  const corrOrig = obterCorredor(zonaOrigem, timeId);
  const corrDest = obterCorredor(zonaDestino, timeId);

  const sobPressao = pressaoOrigem >= 42;
  const receptorMarcado = pressaoDestino >= 42;
  const receptorLivre = pressaoDestino <= 20;

  let subtipo = 'curto_seguro';
  let rotuloContextual = 'Passe de apoio';

  if (tipoId === 'invertido') {
    subtipo = 'inversao';
    rotuloContextual = 'Virada de jogo';
  } else if (tipoId === 'longo' && faixaDest >= 4) {
    subtipo = 'profundidade';
    rotuloContextual = 'Bola em profundidade';
  } else if (tipoId === 'longo') {
    subtipo = 'longo';
    rotuloContextual = 'Lançamento longo';
  } else if (tipoId === 'frente' && (pressaoIntermediaria >= 30 || pressaoDestino >= 32) && corrDest === 'C') {
    subtipo = 'entre_linhas';
    rotuloContextual = 'Passe entre linhas';
  } else if (tipoId === 'frente' && faixaDest >= 4 && faixaDest > faixaOrig) {
    subtipo = 'vertical';
    rotuloContextual = 'Passe vertical';
  } else if (tipoId === 'frente') {
    subtipo = 'vertical';
    rotuloContextual = 'Passe em progressão';
  } else if (tipoId === 'tras') {
    subtipo = 'recuo_seguro';
    rotuloContextual = 'Passe de segurança';
  } else if (tipoId === 'lateral' && corrOrig !== corrDest) {
    subtipo = 'abertura_lateral';
    rotuloContextual = 'Abertura lateral';
  } else {
    subtipo = 'curto_seguro';
    rotuloContextual = 'Toque curto';
  }

  return {
    subtipo,
    rotuloContextual,
    sobPressao,
    receptorMarcado,
    receptorLivre,
  };
}

/**
 * Seleciona o melhor candidato de um time para disputar uma bola viva / segunda bola numa zona.
 */
function pontuarCandidatoDisputa(jogador, zonaAlvo) {
  if (!jogador || jogador.ehGoleiro || jogador.extras?.cartoes?.vermelho || !jogador.zona) {
    return -1;
  }
  const naMesmaZona = jogador.zona === zonaAlvo ? 1 : 0;
  const vel = obterAtributoEfetivo(jogador, 'velocidade');
  const pos = obterAtributoEfetivo(jogador, 'posicionamento');
  const dom = obterAtributoEfetivo(jogador, 'dominio');
  const des = obterAtributoEfetivo(jogador, 'desarme');
  const conc = obterAtributoMental(jogador, 'concentracao');
  const est = obterEstamina(jogador);
  const fatorFadigaDisputa = est < 25 ? 0.85 : est < 45 ? 0.93 : 1;

  return (
    (naMesmaZona * 32 +
      pos * 0.28 +
      vel * 0.26 +
      dom * 0.16 +
      des * 0.16 +
      conc * 0.14) *
    fatorFadigaDisputa
  );
}

/**
 * Resolve uma disputa de bola viva / segunda bola / dividida de forma unificada.
 *
 * Considera velocidade, posicionamento, domínio/desarme, concentração, estamina
 * e leve vantagem posicional de quem está mais próximo da zona.
 */
export function resolverDisputaBola({
  jogadoresAtaque,
  jogadoresDefesa,
  zonaDisputa,
  preferidoAtaque = null,
  preferidoDefesa = null,
  vantagemAtaque = 0,
  rng = Math.random,
}) {
  const rankAtaque = (jogadoresAtaque || [])
    .filter((j) => !j.ehGoleiro && !j.extras?.cartoes?.vermelho && j.zona)
    .map((j) => ({
      jogador: j,
      score:
        pontuarCandidatoDisputa(j, zonaDisputa) +
        (preferidoAtaque && j.id === preferidoAtaque.id ? 8 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const rankDefesa = (jogadoresDefesa || [])
    .filter((j) => !j.ehGoleiro && !j.extras?.cartoes?.vermelho && j.zona)
    .map((j) => ({
      jogador: j,
      score:
        pontuarCandidatoDisputa(j, zonaDisputa) +
        (preferidoDefesa && j.id === preferidoDefesa.id ? 8 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const candAtaque = rankAtaque[0]?.jogador || preferidoAtaque || null;
  const candDefesa = rankDefesa[0]?.jogador || preferidoDefesa || null;

  const forcaAtaque = (rankAtaque[0]?.score ?? 45) + vantagemAtaque;
  const forcaDefesa = rankDefesa[0]?.score ?? 45;

  const diff = forcaAtaque - forcaDefesa;
  const chanceAtaque = Math.max(18, Math.min(82, Math.round(50 + diff * 0.75)));
  const rolagem = Math.floor(rng() * 100) + 1;
  const ataqueVenceu = rolagem <= chanceAtaque;

  return {
    vencedorLado: ataqueVenceu ? 'ataque' : 'defesa',
    vencedor: ataqueVenceu ? candAtaque : candDefesa,
    perdedor: ataqueVenceu ? candDefesa : candAtaque,
    candidatoAtaque: candAtaque,
    candidatoDefesa: candDefesa,
    chanceAtaque,
    rolagem,
    zonaDisputa,
  };
}

// ============================================================================
// Narração Natural de Futebol (Templates Determinísticos, Zero Números Crus)
// ============================================================================

function escolherVariante(lista, sementeNum = 0) {
  if (!Array.isArray(lista) || lista.length === 0) return '';
  const idx = Math.abs(Math.round(sementeNum)) % lista.length;
  return lista[idx];
}

function nomeZonaNarravel(zonaId, timeId) {
  if (!zonaId) return 'meio de campo';
  const pv = zonaParaPontoDeVista(zonaId, timeId);
  const mapa = {
    GK: 'pequena área defensiva',
    GKR: 'meta adversária',
    'Z1-E': 'lateral esquerda da defesa',
    'Z1-C': 'entrada da área defensiva',
    'Z1-D': 'lateral direita da defesa',
    'Z2-E': 'corredor esquerdo da saída',
    'Z2-C': 'cabeça de área',
    'Z2-D': 'corredor direito da saída',
    'Z3-E': 'faixa esquerda do meio',
    'Z3-C': 'círculo central',
    'Z3-D': 'faixa direita do meio',
    'Z4-E': 'ponta esquerda',
    'Z4-C': 'entrada da área',
    'Z4-D': 'ponta direita',
    'Z5-E': 'linha de fundo pela esquerda',
    'Z5-C': 'grande área',
    'Z5-D': 'linha de fundo pela direita',
  };
  return mapa[pv] || zonaId;
}

/**
 * Gera narração futebolística natural a partir do desfecho técnico estruturado
 * e da consequência encadeada. Nunca imprime `%`, `chance`, `sorteio` ou fórmulas.
 */
export function narrarLance({
  desfechoTecnico,
  acao,
  passador,
  receptor = null,
  defensor = null,
  goleiro = null,
  vencedorDisputa = null,
  zonaOrigem = null,
  zonaDestino = null,
  timeAtacanteId = 'meuTime',
  timeDefensorNome = 'o adversário',
  habilidadeNome = null,
  contextoPasse = null,
  tipoChute = 'padrao',
  modoBolaParada = null,
  saidaRotulo = null,
  foiDaLinhaDeFundo = false,
  ativouContraAtaque = false,
  vooGoleiroNome = null,
  semente = 0,
}) {
  const autor = passador?.nomeCurto || 'O portador';
  const alvo = receptor?.nomeCurto || 'o companheiro';
  const marc = defensor?.nomeCurto || 'a marcação';
  const gol = goleiro?.nomeCurto || 'o goleiro';
  const regiao = nomeZonaNarravel(zonaDestino || zonaOrigem, timeAtacanteId);
  const prefHab = habilidadeNome ? `${habilidadeNome}! ` : '';
  const notaContra = ativouContraAtaque
    ? ' O time já arranca em contra-ataque com campo aberto!'
    : '';
  const notaVoo = vooGoleiroNome ? ` ${vooGoleiroNome} se esticou todo no lance!` : '';

  switch (desfechoTecnico) {
    case TIPOS_DESFECHO_TECNICO.PASSE_PERFEITO: {
      const linhaFundo = foiDaLinhaDeFundo
        ? ' Bola açucarada vinda da linha de fundo, pronta para bater de primeira!'
        : '';
      const frases = [
        `${prefHab}${autor} encontra ${alvo} com passe limpo na ${regiao}, quebrando a linha rival.${linhaFundo}`,
        `${prefHab}Que bola de ${autor}! ${alvo} domina com espaço na ${regiao} e já olha para o ataque.${linhaFundo}`,
        `${prefHab}${autor} coloca a bola no pé de ${alvo} na ${regiao} com precisão cirúrgica.${linhaFundo}`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.PASSE_BOM: {
      const sub = contextoPasse?.rotuloContextual
        ? contextoPasse.rotuloContextual.toLowerCase()
        : 'passe';
      const linhaFundo = foiDaLinhaDeFundo
        ? ' Cruzamento rasteiro perigoso na medida para finalizar!'
        : '';
      const frases = [
        `${prefHab}${autor} acerta o ${sub} para ${alvo}, que controla bem na ${regiao}.${linhaFundo}`,
        `${prefHab}${autor} gira o jogo e aciona ${alvo} na ${regiao} sem sustos.${linhaFundo}`,
        `${prefHab}Boa troca de passes: ${autor} entrega para ${alvo} dar sequência na ${regiao}.${linhaFundo}`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.PASSE_DIFICIL: {
      const frases = [
        `${prefHab}${autor} força o passe sob marcação, mas ${alvo} se vira bem e segura a bola na ${regiao}.`,
        `${prefHab}Passe apertado de ${autor}! ${alvo} estica a perna, mata no peito e mantém a posse na ${regiao}.`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.PASSE_DESVIADO: {
      const quemFicou = vencedorDisputa?.nomeCurto || marc;
      if (ativouContraAtaque) {
        return `${prefHab}${autor} tenta o passe, ${marc} desvia no meio do caminho e a bola viva sobra na disputa para ${quemFicou}.${notaContra}`;
      }
      if (vencedorDisputa && vencedorDisputa.id === receptor?.id) {
        return `${prefHab}O passe de ${autor} desvia em ${marc}, a bola fica viva na ${regiao}, mas ${alvo} chega primeiro na disputa e mantém o ataque!`;
      }
      return `${prefHab}${marc} desvia o passe de ${autor}; na briga pela segunda bola na ${regiao}, ${quemFicou} leva a melhor.`;
    }

    case TIPOS_DESFECHO_TECNICO.DOMINIO_RUIM: {
      const quemFicou = vencedorDisputa?.nomeCurto || marc;
      if (vencedorDisputa && vencedorDisputa.id === receptor?.id) {
        return `${prefHab}${autor} faz o passe, a bola quica difícil no pé de ${alvo}, mas ele consegue se recuperar na dividida e fica com ela.`;
      }
      return `${prefHab}${autor} encontra ${alvo}, mas a bola escapa no domínio sob pressão e ${quemFicou} aproveita a sobra!${notaContra}`;
    }

    case TIPOS_DESFECHO_TECNICO.PASSE_FORTE:
    case TIPOS_DESFECHO_TECNICO.PASSE_CURTO:
    case TIPOS_DESFECHO_TECNICO.ERRO_EXECUCAO: {
      if (acao === 'conduzir') {
        const frases = [
          `${prefHab}${autor} adianta demais a passada na ${regiao} e a bola sai em ${saidaRotulo || 'lateral'} para ${timeDefensorNome}.`,
          `${prefHab}${autor} perde o tempo da passada ao tentar acelerar; ${saidaRotulo || 'lateral'} para ${timeDefensorNome}.`,
        ];
        return escolherVariante(frases, semente);
      }
      const motivo =
        desfechoTecnico === TIPOS_DESFECHO_TECNICO.PASSE_FORTE
          ? `${autor} coloca força demais no passe`
          : `${autor} erra a medida do passe`;
      return `${prefHab}${motivo} buscando ${alvo} e a bola se perde em ${saidaRotulo || 'lateral'} para ${timeDefensorNome}.`;
    }

    case TIPOS_DESFECHO_TECNICO.INTERCEPTACAO: {
      const frases = [
        `${prefHab}${marc} lê a jogada antes, antecipa a linha de passe e intercepta o toque de ${autor} na ${regiao}!${notaContra}`,
        `${prefHab}Bote certeiro na linha de passe! ${marc} corta o lançamento de ${autor} e recupera para ${timeDefensorNome}.${notaContra}`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.DESARME: {
      const frases = [
        `${prefHab}${marc} fecha a porta no tempo certo e desarma ${autor} na ${regiao}!${notaContra}`,
        `${prefHab}Corte limpo de ${marc}! Tomou a frente do corpo de ${autor} e recuperou a posse.${notaContra}`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.VANTAGEM_CRIADA: {
      if (acao === 'conduzir') {
        const frases = [
          `${prefHab}${autor} encontra corredor livre, acelera com a bola colada no pé e ganha terreno até a ${regiao}.`,
          `${prefHab}${autor} carrega com personalidade e empurra a defesa rival para trás até a ${regiao}.`,
        ];
        return escolherVariante(frases, semente);
      }
      return `${prefHab}${autor} balança o corpo, vence ${marc} no um contra um na ${regiao} e abre espaço limpo para a sequência!`;
    }

    case TIPOS_DESFECHO_TECNICO.DRIBLE_LIMPO:
    case TIPOS_DESFECHO_TECNICO.DEFENSOR_DESLOCADO: {
      const frases = [
        `Que drible! ${autor} deixa ${marc} no chão na ${regiao} e fica livre para decidir o lance.`,
        `${autor} corta seco para cima de ${marc}, desloca o marcador na ${regiao} e ganha vantagem clara!`,
        `Fila na ${regiao}! ${autor} passa liso por ${marc} e incendeia o ataque.`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.BOLA_ESCAPANDO:
    case TIPOS_DESFECHO_TECNICO.BOLA_SOLTA:
    case TIPOS_DESFECHO_TECNICO.DISPUTA: {
      const quemFicou = vencedorDisputa?.nomeCurto || marc;
      if (vencedorDisputa && vencedorDisputa.id === passador?.id) {
        return `${prefHab}${marc} chega a tocar na bola, mas na dividida na ${regiao} ${autor} leva a melhor e segue com a jogada!`;
      }
      return `${prefHab}${marc} dá o toque no lance e a bola escapa; na dividida na ${regiao}, ${quemFicou} chega antes e fica com a sobra!${notaContra}`;
    }

    case TIPOS_DESFECHO_TECNICO.PENALTI: {
      return `PÊNALTI! ${autor} encara ${marc} dentro da grande área e é derrubado na hora do corte! O árbitro aponta imediatamente para a marca da cal!`;
    }

    case TIPOS_DESFECHO_TECNICO.FALTA_PERIGOSA: {
      return `Falta perigosa! ${marc} chega atrasado no drible de ${autor} na ${regiao} e o árbitro para o jogo. Ótima oportunidade na bola parada!`;
    }

    case TIPOS_DESFECHO_TECNICO.FALTA: {
      return `Falta sofrida por ${autor}! ${marc} derrubou o atacante na ${regiao} para frear a jogada.`;
    }

    case TIPOS_DESFECHO_TECNICO.GOL: {
      if (acao === 'cruzar') {
        const frases = [
          `GOL DE CABEÇA! ${autor} capricha no cruzamento e ${alvo} sobe no segundo andar para testar firme sem chance para ${gol}!${notaVoo}`,
          `GOL! Levantamento na medida de ${autor} na área e ${alvo} completa de primeira para estufar a rede!${notaVoo}`,
        ];
        return escolherVariante(frases, semente);
      }
      if (modoBolaParada === 'penalti') {
        return `GOL DE PÊNALTI! ${autor} desloca ${gol} com frieza e manda no fundo da rede!${notaVoo}`;
      }
      if (modoBolaParada === 'falta_direta') {
        return `GOLAÇO DE FALTA! ${autor} bate com curva por cima da barreira e vence ${gol}!${notaVoo}`;
      }
      if (tipoChute === 'bomba') {
        return `${prefHab}GOLAÇO! ${autor} solta uma bomba da ${regiao} e fuzila ${gol}!${notaVoo}`;
      }
      if (tipoChute === 'colocado') {
        return `${prefHab}GOL! ${autor} tira de ${gol} com categoria no canto, batendo colocado da ${regiao}!${notaVoo}`;
      }
      return `${prefHab}GOL! ${autor} finaliza firme da ${regiao} e coloca a bola no fundo das redes!${notaVoo}`;
    }

    case TIPOS_DESFECHO_TECNICO.BOLA_NA_TRAVE: {
      const quemFicou = vencedorDisputa?.nomeCurto;
      if (quemFicou) {
        return `${prefHab}NA TRAVE! ${autor} acerta o poste com violência e a bola volta viva na área — ${quemFicou} briga pela sobra!`;
      }
      return `${prefHab}NA TRAVE! ${autor} solta a finalização e carimba o travessão de ${gol}! A bola sai pela linha de fundo.`;
    }

    case TIPOS_DESFECHO_TECNICO.BLOQUEIO: {
      const quemFicou = vencedorDisputa?.nomeCurto;
      if (saidaRotulo === 'escanteio') {
        return `${prefHab}${autor} prepara o chute, mas ${marc} se joga na frente, bloqueia o arremate e manda para escanteio!`;
      }
      if (quemFicou) {
        return `${prefHab}Bloqueio de ${marc} na hora do chute de ${autor}! A bola explode na zaga e ${quemFicou} fica com a sobra na disputa!${notaContra}`;
      }
      return `${prefHab}${marc} trava a finalização de ${autor} no momento exato e alivia o perigo!`;
    }

    case TIPOS_DESFECHO_TECNICO.REBOTE: {
      const quemFicou = vencedorDisputa?.nomeCurto || alvo;
      return `${prefHab}${gol} espalma no reflexo o chute de ${autor} e solta na pequena área! ${quemFicou} chega inteiro no rebote para tentar de primeira!${notaVoo}`;
    }

    case TIPOS_DESFECHO_TECNICO.ESCANTEIO: {
      if (acao === 'cruzar') {
        return `Defesaça de ${gol}! ${alvo} testou firme após cruzamento de ${autor} e o goleiro desviou com a ponta dos dedos para escanteio!${notaVoo}`;
      }
      return `${prefHab}Que defesa de ${gol}! Se esticou todo para mandar o chute de ${autor} pela linha de fundo: escanteio!${notaVoo}`;
    }

    case TIPOS_DESFECHO_TECNICO.DEFESA_DIFICIL: {
      return `${prefHab}Grande intervenção de ${gol}! ${autor} acertou um chute perigoso, mas o goleiro encaixou com segurança.${notaVoo}`;
    }

    case TIPOS_DESFECHO_TECNICO.DEFESA: {
      return `${prefHab}${gol} cai bem no canto e segura a finalização de ${autor} sem dar rebote.${notaVoo}`;
    }

    case TIPOS_DESFECHO_TECNICO.FINALIZACAO_FRACA: {
      return `${prefHab}${autor} pega mascado na bola sob pressão e ${gol} encaixa com tranquilidade.`;
    }

    case TIPOS_DESFECHO_TECNICO.PARA_FORA: {
      if (acao === 'cruzar') {
        return `${autor} levanta na área e ${alvo} testa por cima do travessão! Tiro de meta para ${gol}.`;
      }
      const frases = [
        `${prefHab}${autor} busca o ângulo, mas pega aberto demais e a bola sai pela linha de fundo.`,
        `${prefHab}Finalização de ${autor} passa raspando a trave! Tiro de meta para ${gol}.`,
      ];
      return escolherVariante(frases, semente);
    }

    case TIPOS_DESFECHO_TECNICO.CORTE: {
      return `${marc} sobe mais alto na grande área e corta de cabeça o cruzamento de ${autor}!${notaContra}`;
    }

    case TIPOS_DESFECHO_TECNICO.DESVIO: {
      const quemFicou = vencedorDisputa?.nomeCurto || alvo;
      return `Corte parcial de ${marc} no cruzamento de ${autor}! A bola fica viva na área e ${quemFicou} ganha a segunda bola!${notaContra}`;
    }

    default:
      return `${prefHab}${autor} executa a jogada na ${regiao}.`;
  }
}
