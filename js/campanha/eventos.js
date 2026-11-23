/**
 * Catálogo guiado por dados dos eventos da campanha (8 eventos no total).
 * Cada escolha exibe resumo explícito das consequências e uma função pura aplicar(estado, rng).
 */

import { ajustarAtributoClamped } from './estado.js';

function alterarEstaminaElenco(estado, delta) {
  for (const j of estado.elenco) {
    const atual = typeof j.extras?.estamina === 'number' ? j.extras.estamina : 100;
    j.extras.estamina = Math.max(0, Math.min(100, atual + delta));
  }
}

function escolherJogadoresPorSetor(estado, setores, quantidade = 2) {
  const candidatos = estado.elenco.filter((j) => setores.includes(j.setor) && !j.lesionado);
  const base = candidatos.length > 0 ? candidatos : estado.elenco;
  return base.slice(0, quantidade);
}

export const EVENTOS_CAMPANHA = Object.freeze([
  {
    id: 'onibus_quebrado',
    titulo: 'Ônibus Quebrado na Serra',
    descricao:
      'A delegação ficou retida na estrada a poucas horas da concentração. Você precisa decidir a logística da viagem.',
    escolhas: [
      {
        id: 'voo_fretado',
        rotulo: 'Fretar transporte executivo urgente',
        consequencia: '−80 dinheiro · +5 estamina em todo o elenco',
        aplicar(estado) {
          if (estado.dinheiro < 80) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $80).' };
          }
          estado.dinheiro -= 80;
          alterarEstaminaElenco(estado, 5);
          return {
            valido: true,
            resumo: 'Transporte fretado a tempo! Caixa −$80 e +5 de estamina no elenco.',
          };
        },
      },
      {
        id: 'esperar_mecanico',
        rotulo: 'Aguardar o conserto no acostamento',
        consequencia: 'Sem custo · −10 estamina em todo o elenco',
        aplicar(estado) {
          alterarEstaminaElenco(estado, -10);
          return {
            valido: true,
            resumo: 'A viagem atrasou e cansou o grupo: −10 de estamina no elenco.',
          };
        },
      },
    ],
  },
  {
    id: 'amistoso_beneficente',
    titulo: 'Convite para Jogo-Treino Beneficente',
    descricao:
      'Um clube da região propôs um jogo festivo com boa bilheteria antes da próxima rodada oficial.',
    escolhas: [
      {
        id: 'forca_maxima',
        rotulo: 'Entrar com força total pela renda cheia',
        consequencia: '+120 dinheiro · −12 estamina no elenco',
        aplicar(estado) {
          estado.dinheiro += 120;
          alterarEstaminaElenco(estado, -12);
          return {
            valido: true,
            resumo: 'Estádio cheio! +$120 no caixa, mas o elenco perdeu 12 de estamina.',
          };
        },
      },
      {
        id: 'ritmo_leve',
        rotulo: 'Fazer partida curta e controlada',
        consequencia: '+50 dinheiro · −5 estamina no elenco',
        aplicar(estado) {
          estado.dinheiro += 50;
          alterarEstaminaElenco(estado, -5);
          return {
            valido: true,
            resumo: 'Evento tranquilo: +$50 no caixa e −5 de estamina.',
          };
        },
      },
      {
        id: 'recusar_poupar',
        rotulo: 'Agradecer e manter o elenco em repouso',
        consequencia: '+5 estamina no elenco · 0 dinheiro',
        aplicar(estado) {
          alterarEstaminaElenco(estado, 5);
          return {
            valido: true,
            resumo: 'O grupo agradeceu a folga: +5 de estamina em todos os jogadores.',
          };
        },
      },
    ],
  },
  {
    id: 'crise_vestiario',
    titulo: 'Tensão no Vestiário',
    descricao:
      'Após cobranças internas sobre o esquema tático, o grupo aguarda uma postura firme da comissão técnica.',
    escolhas: [
      {
        id: 'bicho_uniao',
        rotulo: 'Pagar premiação extra pela união do elenco',
        consequencia: '−70 dinheiro · +4 moral no próximo jogo',
        aplicar(estado) {
          if (estado.dinheiro < 70) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $70).' };
          }
          estado.dinheiro -= 70;
          estado.moral += 4;
          return {
            valido: true,
            resumo: 'Vestiário fechado com o técnico! −$70 e Moral +4 no próximo jogo.',
          };
        },
      },
      {
        id: 'treino_fechado',
        rotulo: 'Chamar reunião longa e corrigir posicionamento',
        consequencia: '+2 moral no próximo jogo · −6 estamina no elenco',
        aplicar(estado) {
          estado.moral += 2;
          alterarEstaminaElenco(estado, -6);
          return {
            valido: true,
            resumo: 'Ajustes feitos: Moral +2 no próximo jogo e −6 de estamina.',
          };
        },
      },
      {
        id: 'deixar_seguir',
        rotulo: 'Evitar atritos e manter a rotina',
        consequencia: 'Sem alterações',
        aplicar() {
          return {
            valido: true,
            resumo: 'A rotina seguiu normalmente sem mudanças no elenco ou caixa.',
          };
        },
      },
    ],
  },
  {
    id: 'clinica_regenerativa',
    titulo: 'Clínica Parceira de Recuperação',
    descricao:
      'Um centro esportivo ofereceu horários promocionais para recuperação muscular e tratamento médico.',
    escolhas: [
      {
        id: 'pacote_completo',
        rotulo: 'Contratar pacote médico completo',
        consequencia: '−100 dinheiro · Cura 1 lesionado + 18 estamina no elenco',
        aplicar(estado) {
          if (estado.dinheiro < 100) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $100).' };
          }
          estado.dinheiro -= 100;
          const lesionado = estado.elenco.find((j) => j.lesionado);
          if (lesionado) lesionado.lesionado = false;
          alterarEstaminaElenco(estado, 18);
          return {
            valido: true,
            resumo: lesionado
              ? `−$100: ${lesionado.nomeCurto} recebeu alta e todo o elenco ganhou +18 de estamina!`
              : '−$100: todo o elenco ganhou +18 de estamina!',
          };
        },
      },
      {
        id: 'crioterapia_basica',
        rotulo: 'Sessão básica de crioterapia',
        consequencia: '−40 dinheiro · +8 estamina no elenco',
        aplicar(estado) {
          if (estado.dinheiro < 40) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $40).' };
          }
          estado.dinheiro -= 40;
          alterarEstaminaElenco(estado, 8);
          return {
            valido: true,
            resumo: '−$40 e +8 de estamina em todo o elenco.',
          };
        },
      },
      {
        id: 'nao_contratar',
        rotulo: 'Economizar recursos para o mercado',
        consequencia: 'Sem alterações',
        aplicar() {
          return {
            valido: true,
            resumo: 'Caixa preservado para futuras contratações.',
          };
        },
      },
    ],
  },
  {
    id: 'olheiro_clinica_tecnica',
    titulo: 'Intercâmbio com Analista Tático',
    descricao:
      'Um ex-treinador da liga está na cidade e aceitou fazer uma clínica rápida de fundamentos com seus atletas.',
    escolhas: [
      {
        id: 'clinica_ofensiva',
        rotulo: 'Focar em passe e finalização dos atacantes',
        consequencia: '−75 dinheiro · +2 passe e +2 finalização em 2 atacantes',
        aplicar(estado) {
          if (estado.dinheiro < 75) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $75).' };
          }
          estado.dinheiro -= 75;
          const alvos = escolherJogadoresPorSetor(estado, ['ATA', 'MEI'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'passe', 2);
            ajustarAtributoClamped(j, 'finalizacao', 2);
          }
          return {
            valido: true,
            resumo: `−$75: ${alvos.map((a) => a.nomeCurto).join(' e ')} evoluíram +2 em passe e finalização.`,
          };
        },
      },
      {
        id: 'clinica_defensiva',
        rotulo: 'Focar em marcação e desarme dos defensores',
        consequencia: '−75 dinheiro · +2 marcação e +2 desarme em 2 defensores',
        aplicar(estado) {
          if (estado.dinheiro < 75) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $75).' };
          }
          estado.dinheiro -= 75;
          const alvos = escolherJogadoresPorSetor(estado, ['DEF'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'marcacao', 2);
            ajustarAtributoClamped(j, 'desarme', 2);
          }
          return {
            valido: true,
            resumo: `−$75: ${alvos.map((a) => a.nomeCurto).join(' e ')} evoluíram +2 em marcação e desarme.`,
          };
        },
      },
      {
        id: 'palestra_gratuita',
        rotulo: 'Apenas assistir à palestra gratuita',
        consequencia: '+1 moral no próximo jogo',
        aplicar(estado) {
          estado.moral += 1;
          return {
            valido: true,
            resumo: 'Ideias anotadas na prancheta: Moral +1 para o próximo jogo.',
          };
        },
      },
    ],
  },
  // 3 novos eventos
  {
    id: 'chuva_pesada',
    titulo: 'Temporal Antes da Rodada',
    descricao:
      'Uma chuva intensa alagou o campo principal do CT. O treino precisa ser adaptado imediatamente.',
    escolhas: [
      {
        id: 'quadra_coberta',
        rotulo: 'Alugar campo society coberto para posse de bola',
        consequencia: '−45 dinheiro · +2 posicionamento em 2 meias',
        aplicar(estado) {
          if (estado.dinheiro < 45) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $45).' };
          }
          estado.dinheiro -= 45;
          const alvos = escolherJogadoresPorSetor(estado, ['MEI'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'posicionamento', 2);
          }
          return {
            valido: true,
            resumo: `−$45: ${alvos.map((a) => a.nomeCurto).join(' e ')} ganharam +2 em posicionamento.`,
          };
        },
      },
      {
        id: 'treino_na_lama',
        rotulo: 'Treinar sob chuva para ganhar imposição física',
        consequencia: '+2 desarme em 2 defensores · −8 estamina no elenco',
        aplicar(estado) {
          const alvos = escolherJogadoresPorSetor(estado, ['DEF'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'desarme', 2);
          }
          alterarEstaminaElenco(estado, -8);
          return {
            valido: true,
            resumo: `${alvos.map((a) => a.nomeCurto).join(' e ')} ganharam +2 desarme, mas o elenco perdeu 8 de estamina.`,
          };
        },
      },
      {
        id: 'sessao_video',
        rotulo: 'Substituir o campo por análise de vídeo',
        consequencia: '+6 estamina no elenco',
        aplicar(estado) {
          alterarEstaminaElenco(estado, 6);
          return {
            valido: true,
            resumo: 'Descanso ativo com vídeo: +6 de estamina em todo o elenco.',
          };
        },
      },
    ],
  },
  {
    id: 'coletiva_quente',
    titulo: 'Coletiva de Imprensa Acirrada',
    descricao:
      'Os jornalistas provocaram o Atlético Brisa perguntando se o time aguenta a pressão da fase decisiva.',
    escolhas: [
      {
        id: 'rebater_confianca',
        rotulo: 'Responder com firmeza e inflamar a torcida',
        consequencia: '−50 dinheiro (multa da liga) · +4 moral no próximo jogo',
        aplicar(estado) {
          if (estado.dinheiro < 50) {
            return { valido: false, motivo: 'Dinheiro insuficiente para cobrir multa ($50).' };
          }
          estado.dinheiro -= 50;
          estado.moral += 4;
          return {
            valido: true,
            resumo: 'Declaração forte rendeu multa (−$50), mas o elenco ganhou Moral +4!',
          };
        },
      },
      {
        id: 'discurso_equilibrado',
        rotulo: 'Manter discurso sereno e elogiar o grupo',
        consequencia: '+2 moral no próximo jogo',
        aplicar(estado) {
          estado.moral += 2;
          return {
            valido: true,
            resumo: 'Postura serena elevou a confiança: Moral +2 para a próxima partida.',
          };
        },
      },
    ],
  },
  {
    id: 'fornecedor_material',
    titulo: 'Ação Promocional de Material Esportivo',
    descricao:
      'Uma marca local ofereceu um lote relâmpago de camisas comemorativas antes da próxima viagem.',
    escolhas: [
      {
        id: 'aceitar_promocao',
        rotulo: 'Aceitar o lote promocional imediatamente',
        consequencia: '+100 dinheiro · −1 moral no próximo jogo (tecido pesado)',
        aplicar(estado) {
          estado.dinheiro += 100;
          estado.moral -= 1;
          return {
            valido: true,
            resumo: '+$100 no caixa, mas o uniforme pesado derrubou a moral em 1 ponto.',
          };
        },
      },
      {
        id: 'encomendar_linha_pro',
        rotulo: 'Pagar pela linha leve de alto rendimento',
        consequencia: '−60 dinheiro · +2 moral + 1 velocidade em 2 pontas/laterais',
        aplicar(estado) {
          if (estado.dinheiro < 60) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $60).' };
          }
          estado.dinheiro -= 60;
          estado.moral += 2;
          const velozes = estado.elenco
            .filter((j) => ['LE', 'LD', 'PE', 'PD'].includes(j.posicao))
            .slice(0, 2);
          for (const j of velozes) {
            ajustarAtributoClamped(j, 'velocidade', 1);
          }
          return {
            valido: true,
            resumo: `−$60: Moral +2 e +1 velocidade para ${velozes.map((v) => v.nomeCurto).join(' e ')}.`,
          };
        },
      },
      {
        id: 'manter_uniforme',
        rotulo: 'Seguir com o fardamento oficial atual',
        consequencia: 'Sem alterações',
        aplicar() {
          return {
            valido: true,
            resumo: 'O clube manteve o uniforme tradicional.',
          };
        },
      },
    ],
  },
]);

export const EVENTOS_PACOTES = Object.freeze([
  // Pacote de Eventos I (pacote_ev_1)
  {
    id: 'peneira_aberta',
    pacoteId: 'pacote_ev_1',
    titulo: 'Peneira Aberta no Estádio',
    descricao:
      'Jovens da região chamaram a atenção da comissão técnica durante os testes da semana.',
    escolhas: [
      {
        id: 'promover_destaque',
        rotulo: 'Integrar treino específico com o elenco principal',
        consequencia: '−40 dinheiro · +2 velocidade e +1 técnica em 2 jovens/pontas',
        aplicar(estado) {
          if (estado.dinheiro < 40) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $40).' };
          }
          estado.dinheiro -= 40;
          const alvos = escolherJogadoresPorSetor(estado, ['ATA', 'MEI'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'velocidade', 2);
            ajustarAtributoClamped(j, 'tecnica', 1);
          }
          return {
            valido: true,
            resumo: `−$40: ${alvos.map((a) => a.nomeCurto).join(' e ')} ganharam +2 velocidade e +1 técnica.`,
          };
        },
      },
      {
        id: 'cobrar_taxa_evento',
        rotulo: 'Transformar a peneira em festival aberto',
        consequencia: '+80 dinheiro · −4 estamina no elenco',
        aplicar(estado) {
          estado.dinheiro += 80;
          alterarEstaminaElenco(estado, -4);
          return {
            valido: true,
            resumo: 'Festival movimentado! +$80 em caixa e −4 de estamina no elenco.',
          };
        },
      },
    ],
  },
  {
    id: 'treino_noturno',
    pacoteId: 'pacote_ev_1',
    titulo: 'Treino Tático Noturno',
    descricao:
      'Com o calendário apertado, você pode estender os trabalhos à noite sob os refletores.',
    escolhas: [
      {
        id: 'compactacao_noturna',
        rotulo: 'Ensaiar compactação defensiva e linha de passe',
        consequencia: '+2 interceptação em 2 defensores/meias · −7 estamina no elenco',
        aplicar(estado) {
          const alvos = escolherJogadoresPorSetor(estado, ['DEF', 'MEI'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'interceptacao', 2);
          }
          alterarEstaminaElenco(estado, -7);
          return {
            valido: true,
            resumo: `Compactação afiada: ${alvos.map((a) => a.nomeCurto).join(' e ')} +2 interceptação (−7 estamina).`,
          };
        },
      },
      {
        id: 'poupar_refletores',
        rotulo: 'Liberar os jogadores mais cedo para descanso',
        consequencia: '+7 estamina no elenco',
        aplicar(estado) {
          alterarEstaminaElenco(estado, 7);
          return {
            valido: true,
            resumo: 'Noite leve no CT: +7 de estamina em todo o elenco.',
          };
        },
      },
    ],
  },
  {
    id: 'visita_idolo',
    pacoteId: 'pacote_ev_1',
    titulo: 'Visita de Ídolo Histórico',
    descricao:
      'Um ex-capitão multicampeão visitou o centro de treinamento antes da próxima partida.',
    escolhas: [
      {
        id: 'conversa_atacantes',
        rotulo: 'Pedir orientação específica para finalizadores',
        consequencia: '+2 finalização em 2 atacantes · +1 moral',
        aplicar(estado) {
          const alvos = escolherJogadoresPorSetor(estado, ['ATA'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'finalizacao', 2);
          }
          estado.moral += 1;
          return {
            valido: true,
            resumo: `Dicas de artilheiro! ${alvos.map((a) => a.nomeCurto).join(' e ')} +2 finalização e Moral +1.`,
          };
        },
      },
      {
        id: 'jantar_elenco',
        rotulo: 'Organizar jantar motivacional com todo o grupo',
        consequencia: '−45 dinheiro · +3 moral e +6 estamina no elenco',
        aplicar(estado) {
          if (estado.dinheiro < 45) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $45).' };
          }
          estado.dinheiro -= 45;
          estado.moral += 3;
          alterarEstaminaElenco(estado, 6);
          return {
            valido: true,
            resumo: '−$45: Ambiente excelente! Moral +3 e +6 estamina no elenco.',
          };
        },
      },
    ],
  },
  // Pacote de Eventos II (pacote_ev_2)
  {
    id: 'gramado_seco',
    pacoteId: 'pacote_ev_2',
    titulo: 'Gramado Rápido e Seco',
    descricao:
      'O próximo estádio tem grama bem aparada, favorecendo toques rápidos e bolas enfiadas.',
    escolhas: [
      {
        id: 'ajustar_passe',
        rotulo: 'Treinar domínio orientado e passe de primeira',
        consequencia: '+2 passe e +1 domínio em 2 meias · −5 estamina no elenco',
        aplicar(estado) {
          const alvos = escolherJogadoresPorSetor(estado, ['MEI'], 2);
          for (const j of alvos) {
            ajustarAtributoClamped(j, 'passe', 2);
            ajustarAtributoClamped(j, 'dominio', 1);
          }
          alterarEstaminaElenco(estado, -5);
          return {
            valido: true,
            resumo: `${alvos.map((a) => a.nomeCurto).join(' e ')} afiaram o toque (+2 passe, +1 domínio; −5 estamina).`,
          };
        },
      },
      {
        id: 'hidratar_grupo',
        rotulo: 'Priorizar hidratação e recuperação muscular',
        consequencia: '+8 estamina no elenco',
        aplicar(estado) {
          alterarEstaminaElenco(estado, 8);
          return {
            valido: true,
            resumo: 'Grupo 100% hidratado: +8 de estamina no elenco.',
          };
        },
      },
    ],
  },
  {
    id: 'premio_fair_play',
    pacoteId: 'pacote_ev_2',
    titulo: 'Premiação Fair Play da Liga',
    descricao:
      'A federação destacou o comportamento disciplinado da sua equipe na competição.',
    escolhas: [
      {
        id: 'reinvestir_caixa',
        rotulo: 'Receber o bônus financeiro direto no caixa',
        consequencia: '+95 dinheiro',
        aplicar(estado) {
          estado.dinheiro += 95;
          return {
            valido: true,
            resumo: 'Prêmio recebido: +$95 no caixa do clube!',
          };
        },
      },
      {
        id: 'repartir_com_elenco',
        rotulo: 'Repartir parte do bônus como incentivo ao elenco',
        consequencia: '+45 dinheiro · +3 moral no próximo jogo',
        aplicar(estado) {
          estado.dinheiro += 45;
          estado.moral += 3;
          return {
            valido: true,
            resumo: '+$45 no caixa e Moral +3 para a próxima partida!',
          };
        },
      },
    ],
  },
  {
    id: 'concentracao_especial',
    pacoteId: 'pacote_ev_2',
    titulo: 'Concentração em Hotel Fazenda',
    descricao:
      'Uma rede hoteleira parceira ofereceu diária especial para blindar o elenco antes da reta final.',
    escolhas: [
      {
        id: 'fechar_hotel',
        rotulo: 'Reservar diária completa para recuperação e foco',
        consequencia: '−65 dinheiro · +15 estamina + 2 moral',
        aplicar(estado) {
          if (estado.dinheiro < 65) {
            return { valido: false, motivo: 'Dinheiro insuficiente (precisa de $65).' };
          }
          estado.dinheiro -= 65;
          alterarEstaminaElenco(estado, 15);
          estado.moral += 2;
          return {
            valido: true,
            resumo: '−$65: Elenco renovado (+15 estamina e Moral +2)!',
          };
        },
      },
      {
        id: 'treinar_no_ct',
        rotulo: 'Ficar no CT padrão e economizar a verba',
        consequencia: '+4 estamina no elenco',
        aplicar(estado) {
          alterarEstaminaElenco(estado, 4);
          return {
            valido: true,
            resumo: 'Rotina preservada no CT (+4 estamina no elenco).',
          };
        },
      },
    ],
  },
]);

export const TODOS_EVENTOS_CAMPANHA = Object.freeze([
  ...EVENTOS_CAMPANHA,
  ...EVENTOS_PACOTES,
]);

export function obterEventosDisponiveis(pacotesDesbloqueados = []) {
  const pacotesSet = new Set(Array.isArray(pacotesDesbloqueados) ? pacotesDesbloqueados : []);
  return TODOS_EVENTOS_CAMPANHA.filter(
    (ev) => !ev.pacoteId || pacotesSet.has(ev.pacoteId),
  );
}
