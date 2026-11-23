/**
 * Controlador visual e de temporização do Relógio de Decisão por turno do usuário.
 *
 * - Pausa automaticamente em modais (Substituição, Postura, Pausa) e enquanto o
 *   jogador inspeciona "Detalhes do cálculo".
 * - Dispara `onTickDesconto(desconto)` somente quando o desconto inteiro (0..10%)
 *   muda, mantendo prévia e painel de cálculo sincronizados ao vivo.
 * - Dispara `onTimeout(faseTipo)` quando o tempo restante chega a 0.
 */

import {
  avancarRelogio,
  criarEstadoRelogio,
  obterChaveTurnoRelogio,
  reiniciarRelogioParaTurno,
} from '../regras/relogio.js';

const ROTULOS_PAUSA = Object.freeze({
  pausa: 'Partida pausada',
  sub: 'Substituição aberta',
  postura: 'Escolhendo postura',
  depuracao: 'Detalhes do cálculo',
  rival: 'Aguardando rival',
  modal: 'Menu aberto',
});

export function criarControladorRelogio({
  elBarraWrap,
  elBarraFill,
  elTempoTexto,
  elDescontoTexto,
  elStatusPausa,
  onTickDesconto,
  onTimeout,
} = {}) {
  let relogio = criarEstadoRelogio({ dificuldade: 0, relogioDesligado: false });
  const bloqueiosPausa = new Set();
  let intervalId = null;
  let ultimoTimestamp = 0;
  let timeoutDisparadoChave = null;

  function estaPausado() {
    return bloqueiosPausa.size > 0;
  }

  function atualizarPausaInterna() {
    relogio.pausado = estaPausado();
    relogio.motivosPausa = [...bloqueiosPausa];
  }

  function renderizar() {
    if (!elBarraWrap) return;

    if (!relogio.ativo) {
      elBarraWrap.dataset.ativo = 'false';
      elBarraWrap.dataset.pausado = 'false';
      elBarraWrap.dataset.faixa = 'desligado';
      if (elBarraFill) elBarraFill.style.width = '0%';
      if (elTempoTexto) {
        elTempoTexto.textContent = relogio.desligadoPorOpcao
          ? 'Relógio desligado (Opções)'
          : `Sem relógio (Nív. ${relogio.dificuldade})`;
      }
      if (elDescontoTexto) {
        elDescontoTexto.textContent = '';
        elDescontoTexto.hidden = true;
      }
      if (elStatusPausa) {
        elStatusPausa.textContent = '';
        elStatusPausa.hidden = true;
      }
      return;
    }

    elBarraWrap.dataset.ativo = 'true';
    elBarraWrap.dataset.pausado = String(relogio.pausado);

    const pct =
      relogio.tempoTotal > 0
        ? Math.max(0, Math.min(100, (relogio.tempoRestante / relogio.tempoTotal) * 100))
        : 0;
    const emSegundaMetade = relogio.tempoRestante <= relogio.tempoTotal * 0.5;
    const critico = relogio.tempoRestante <= Math.min(5, relogio.tempoTotal * 0.25);
    const faixa = critico ? 'critico' : emSegundaMetade ? 'atencao' : 'seguro';
    elBarraWrap.dataset.faixa = faixa;

    if (elBarraFill) {
      elBarraFill.style.width = `${pct.toFixed(1)}%`;
    }

    if (elTempoTexto) {
      const segs = Math.ceil(relogio.tempoRestante);
      const faseRot =
        relogio.faseTipo === 'defesa'
          ? 'Defesa'
          : relogio.faseTipo === 'ataque'
            ? 'Ataque'
            : 'Turno';
      elTempoTexto.textContent = relogio.chaveTurno
        ? `Relógio (${faseRot}): ${segs}s / ${relogio.tempoTotal}s`
        : `Relógio: ${relogio.tempoTotal}s por turno`;
    }

    if (elDescontoTexto) {
      elDescontoTexto.hidden = false;
      if (relogio.descontoAtual > 0) {
        elDescontoTexto.textContent = `−${relogio.descontoAtual}% chance`;
        elDescontoTexto.dataset.penalidade = 'true';
      } else if (emSegundaMetade && relogio.chaveTurno) {
        elDescontoTexto.textContent = '2ª metade (−1%/s até −10%)';
        elDescontoTexto.dataset.penalidade = 'false';
      } else {
        elDescontoTexto.textContent = 'Sem desconto';
        elDescontoTexto.dataset.penalidade = 'false';
      }
    }

    if (elStatusPausa) {
      if (relogio.pausado && relogio.chaveTurno) {
        const primeiroMotivo = [...bloqueiosPausa][0];
        elStatusPausa.textContent = `Pausado: ${ROTULOS_PAUSA[primeiroMotivo] || primeiroMotivo}`;
        elStatusPausa.hidden = false;
      } else {
        elStatusPausa.textContent = '';
        elStatusPausa.hidden = true;
      }
    }
  }

  function tickLoop() {
    const agora =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const deltaSeg = ultimoTimestamp > 0 ? (agora - ultimoTimestamp) / 1000 : 0.1;
    ultimoTimestamp = agora;

    if (!relogio.ativo || relogio.pausado || !relogio.chaveTurno) {
      return;
    }

    const res = avancarRelogio(relogio, deltaSeg);
    renderizar();

    if (res.mudouDesconto) {
      onTickDesconto?.(res.desconto);
    }

    if (res.esgotado && timeoutDisparadoChave !== relogio.chaveTurno) {
      timeoutDisparadoChave = relogio.chaveTurno;
      const faseTipo = relogio.faseTipo;
      relogio.chaveTurno = null;
      pararLoop();
      renderizar();
      onTimeout?.(faseTipo);
    }
  }

  function garantirLoop() {
    if (intervalId !== null) return;
    ultimoTimestamp =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    intervalId = window.setInterval(tickLoop, 100);
  }

  function pararLoop() {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    ultimoTimestamp = 0;
  }

  return {
    configurar({ dificuldade = 0, relogioDesligado = false } = {}) {
      relogio = criarEstadoRelogio({ dificuldade, relogioDesligado });
      timeoutDisparadoChave = null;
      atualizarPausaInterna();
      if (!relogio.ativo) {
        pararLoop();
      }
      renderizar();
      return this.obterEstado();
    },

    sincronizarTurno(estado, { rivalPensando = false } = {}) {
      if (!relogio.ativo) {
        relogio.chaveTurno = null;
        relogio.faseTipo = null;
        relogio.descontoAtual = 0;
        if (estado) estado.descontoRelogioAtual = 0;
        pararLoop();
        renderizar();
        return;
      }

      const info = obterChaveTurnoRelogio(estado, rivalPensando);
      if (!info) {
        relogio.chaveTurno = null;
        relogio.faseTipo = null;
        pararLoop();
        renderizar();
        return;
      }

      if (info.chave !== relogio.chaveTurno) {
        timeoutDisparadoChave = null;
        reiniciarRelogioParaTurno(relogio, {
          chaveTurno: info.chave,
          faseTipo: info.faseTipo,
        });
        if (estado) estado.descontoRelogioAtual = 0;
        onTickDesconto?.(0);
      }

      garantirLoop();
      renderizar();
    },

    definirPausa(motivo, ativo) {
      if (!motivo) return;
      if (ativo) bloqueiosPausa.add(motivo);
      else bloqueiosPausa.delete(motivo);

      atualizarPausaInterna();
      ultimoTimestamp =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      renderizar();
    },

    limparPausas() {
      bloqueiosPausa.clear();
      atualizarPausaInterna();
      ultimoTimestamp =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      renderizar();
    },

    parar() {
      pararLoop();
      relogio.chaveTurno = null;
      relogio.faseTipo = null;
      relogio.descontoAtual = 0;
      renderizar();
    },

    renderizar,

    obterEstado() {
      return {
        ativo: relogio.ativo,
        dificuldade: relogio.dificuldade,
        desligadoPorOpcao: relogio.desligadoPorOpcao,
        tempoTotal: relogio.tempoTotal,
        tempoRestante: relogio.tempoRestante,
        descontoAtual: relogio.descontoAtual,
        chaveTurno: relogio.chaveTurno,
        faseTipo: relogio.faseTipo,
        pausado: relogio.pausado,
        motivosPausa: [...bloqueiosPausa],
      };
    },
  };
}
