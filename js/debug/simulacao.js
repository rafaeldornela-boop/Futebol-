/**
 * Ferramenta de equilíbrio (Modo Debug):
 * Roda N partidas automáticas (padrão 200) contra um rival de força escolhida
 * usando o algoritmo da IA (`escolherJogadaIA`) para ambos os lados.
 */

import {
  calcularMediaTitularesInicial,
  criarElencoInicialCampanha,
  criarRng,
  gerarRivalPorCamada,
} from '../campanha/estado.js';
import { montarTimeParaPartida, prepararEscalacaoPadrao } from '../campanha/nos.js';
import { modificadoresMeta } from '../meta/meta.js';
import {
  anunciarIntencaoRival,
  aplicarOrdemDefensiva,
  compilarResultadoPartida,
  criarPartida,
  executarJogada,
} from '../regras/partida.js';
import { FORMACAO_PADRAO, obterFormacao } from '../dados/formacoes.js';
import { normalizarPosturaId, POSTURA_PADRAO } from '../regras/postura.js';
import { escolherJogadaIA } from '../rival/ia.js';

function calcularMediaEstaminaCampo(jogadores) {
  if (!jogadores || jogadores.length === 0) return 0;
  const soma = jogadores.reduce(
    (acc, j) => acc + (typeof j.extras?.estamina === 'number' ? j.extras.estamina : 100),
    0,
  );
  return soma / jogadores.length;
}

export function simularPartidasEquilibrio({
  quantidade = 200,
  forcaRival = 46,
  clubeId = 'equilibrado',
  tecnicoId = 'padrao',
  formacaoMeu = FORMACAO_PADRAO,
  posturaMeu = POSTURA_PADRAO,
  formacaoRival = FORMACAO_PADRAO,
  posturaRival = POSTURA_PADRAO,
  ajusteConcentracaoMeu = 0,
  estaminaInicialMeu = 100,
  meta = null,
  seedBase = 'SIM-EQUILIBRIO',
} = {}) {
  const total = Math.max(1, Math.min(1000, Math.floor(Number(quantidade) || 200)));
  const forca = Math.max(25, Math.min(100, Number(forcaRival) || 46));
  const formMeuId = obterFormacao(formacaoMeu).id;
  const formRivalId = obterFormacao(formacaoRival).id;
  const postMeuId = normalizarPosturaId(posturaMeu);
  const postRivalId = normalizarPosturaId(posturaRival);

  const mods = modificadoresMeta(meta, {
    clubeId,
    tecnicoId,
    permitirQualquerClube: true,
    permitirQualquerTecnico: true,
  });

  const elencoBase = criarElencoInicialCampanha(mods);
  const mediaMeu = calcularMediaTitularesInicial(elencoBase);
  const esc = prepararEscalacaoPadrao(elencoBase, formMeuId);
  const campFicticia = {
    elenco: elencoBase,
    moral: 0,
    modificadoresMeta: mods,
    clubeNome: mods.clubeNome,
    clubeSigla: mods.clubeSigla,
  };
  const meuTimeModelo = montarTimeParaPartida(
    campFicticia,
    esc.titularesPorPapel,
    esc.reservasIds,
    { formacao: formMeuId, postura: postMeuId },
  );

  if (ajusteConcentracaoMeu !== 0 || estaminaInicialMeu !== 100) {
    for (const j of [...meuTimeModelo.jogadores, ...meuTimeModelo.reservas]) {
      if (ajusteConcentracaoMeu !== 0) {
        const novaConc = Math.max(
          15,
          Math.min(98, (j.atributos.concentracao ?? 45) + ajusteConcentracaoMeu),
        );
        j.atributos.concentracao = novaConc;
        if (j.mental) j.mental.concentracao = novaConc;
      }
      if (estaminaInicialMeu !== 100 && j.extras) {
        j.extras.estamina = Math.max(5, Math.min(100, estaminaInicialMeu));
      }
    }
  }

  let vitorias = 0;
  let empates = 0;
  let derrotas = 0;
  let somaGolsMeu = 0;
  let somaGolsRival = 0;
  let somaEstaminaMeu = 0;
  let somaEstaminaRival = 0;
  let somaPassesTentadosMeu = 0;
  let somaPassesCertosMeu = 0;
  let somaFinalizacoesMeu = 0;
  let somaFinalizacoesRival = 0;
  let somaInterceptacoesMeu = 0;
  let somaInterceptacoesRival = 0;
  let somaDibresMeu = 0;
  let somaDisputas = 0;
  let somaRebotes = 0;
  let somaTraves = 0;
  let somaBloqueios = 0;
  let somaDefesasGoleiro = 0;

  for (let i = 0; i < total; i += 1) {
    const rng = criarRng(`${seedBase}::p${i}::f${forca}::${formMeuId}_${postMeuId}::${formRivalId}_${postRivalId}`);
    const rival = gerarRivalPorCamada({
      seed: seedBase,
      noId: `sim_${i}`,
      camada: 5,
      ehChefao: false,
      mediaInicialTitulares: mediaMeu,
      forcaPersonalizada: forca,
      formacao: formRivalId,
    });

    const estado = criarPartida(
      {
        meuTime: structuredClone(meuTimeModelo),
        rival,
      },
      {
        modificadoresMeta: mods,
        posturaMeu: postMeuId,
        posturaRival: postRivalId,
      },
    );

    let passos = 0;
    while (!estado.encerrada && passos < 60) {
      passos += 1;
      const jogada = escolherJogadaIA(estado, rng, { rngHabilidade: rng });
      if (!jogada) break;

      if (estado.timeComBola === 'rival') {
        anunciarIntencaoRival(estado, jogada);
        aplicarOrdemDefensiva(estado, 'nenhuma', null, rng);
        const exec = executarJogada(estado, estado.defesaTurno.intencaoAtual, rng, {
          rngHabilidade: rng,
        });
        if (!exec.valido) break;
      } else {
        const exec = executarJogada(estado, jogada, rng, { rngHabilidade: rng });
        if (!exec.valido) break;
      }
    }

    const comp = compilarResultadoPartida(estado, { rngLesao: rng });
    if (comp.resultado === 'vitoria') vitorias += 1;
    else if (comp.resultado === 'empate') empates += 1;
    else derrotas += 1;

    somaGolsMeu += comp.placar.meuTime;
    somaGolsRival += comp.placar.rival;
    somaEstaminaMeu += calcularMediaEstaminaCampo(estado.times.meuTime.jogadores);
    somaEstaminaRival += calcularMediaEstaminaCampo(estado.times.rival.jogadores);

    const estMeu = estado.estatisticas?.meuTime || {};
    const estRiv = estado.estatisticas?.rival || {};
    somaPassesTentadosMeu += estMeu.passesTentados || 0;
    somaPassesCertosMeu += estMeu.passesCertos || 0;
    somaFinalizacoesMeu += estMeu.finalizacoes || 0;
    somaFinalizacoesRival += estRiv.finalizacoes || 0;
    somaInterceptacoesMeu += estMeu.interceptacoes || 0;
    somaInterceptacoesRival += estRiv.interceptacoes || 0;
    somaDibresMeu += estMeu.dibresCertos || 0;
    somaDisputas += (estMeu.disputas || 0) + (estRiv.disputas || 0);
    somaRebotes += (estMeu.rebotes || 0) + (estRiv.rebotes || 0);
    somaTraves += (estMeu.traves || 0) + (estRiv.traves || 0);
    somaBloqueios += (estMeu.bloqueios || 0) + (estRiv.bloqueios || 0);
    somaDefesasGoleiro += (estMeu.defesasGoleiro || 0) + (estRiv.defesasGoleiro || 0);
  }

  const arred2 = (v) => Number(v.toFixed(2));
  const arred1 = (v) => Number(v.toFixed(1));
  const pctPasseMeu =
    somaPassesTentadosMeu > 0
      ? arred1((somaPassesCertosMeu / somaPassesTentadosMeu) * 100)
      : 0;

  return {
    quantidade: total,
    forcaRival: forca,
    mediaMeuTime: mediaMeu,
    clubeId: mods.clubeId,
    clubeNome: mods.clubeNome,
    tecnicoId: mods.tecnicoId,
    tecnicoNome: mods.tecnicoNome,
    formacaoMeu: formMeuId,
    posturaMeu: postMeuId,
    formacaoRival: formRivalId,
    posturaRival: postRivalId,
    vitorias,
    empates,
    derrotas,
    pctVitorias: arred1((vitorias / total) * 100),
    pctEmpates: arred1((empates / total) * 100),
    pctDerrotas: arred1((derrotas / total) * 100),
    mediaGolsMeu: arred2(somaGolsMeu / total),
    mediaGolsRival: arred2(somaGolsRival / total),
    mediaEstaminaFinalMeu: arred1(somaEstaminaMeu / total),
    mediaEstaminaFinalRival: arred1(somaEstaminaRival / total),
    mediaPassesTentadosMeu: arred2(somaPassesTentadosMeu / total),
    mediaPassesCertosMeu: arred2(somaPassesCertosMeu / total),
    pctPasseMeu,
    mediaFinalizacoesMeu: arred2(somaFinalizacoesMeu / total),
    mediaFinalizacoesRival: arred2(somaFinalizacoesRival / total),
    mediaInterceptacoesMeu: arred2(somaInterceptacoesMeu / total),
    mediaInterceptacoesRival: arred2(somaInterceptacoesRival / total),
    mediaDibresMeu: arred2(somaDibresMeu / total),
    mediaDisputas: arred2(somaDisputas / total),
    mediaRebotes: arred2(somaRebotes / total),
    mediaTraves: arred2(somaTraves / total),
    mediaBloqueios: arred2(somaBloqueios / total),
    mediaDefesasGoleiro: arred2(somaDefesasGoleiro / total),
  };
}
