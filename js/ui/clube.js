/**
 * Tela do Clube (Meta-Progressão):
 * - Melhorias permanentes: Torcida, Estádio, Categorias de base e Equipamentos (níveis 0..5)
 * - Uniformes (paletas de cor aplicadas aos chips do seu time)
 * - Desbloqueios: Clubes iniciais, Técnicos e Pacotes de conteúdo
 * - Exportar e Importar progresso em JSON
 */

import {
  LISTA_CLUBES_INICIAIS,
  LISTA_MELHORIAS_CLUBE,
  LISTA_PACOTES_CONTEUDO,
  LISTA_TECNICOS_CLUBE,
  LISTA_UNIFORMES,
} from '../meta/constantes.js';
import {
  clubeEstaDesbloqueado,
  comprarDesbloqueioClube,
  comprarDesbloqueioTecnico,
  comprarPacoteConteudo,
  pacoteEstaDesbloqueado,
  tecnicoEstaDesbloqueado,
} from '../meta/desbloqueios.js';
import {
  comprarMelhoriaClube,
  comprarOuEquiparUniforme,
  obterCustoProximaMelhoria,
  obterNivelMelhoria,
  uniformeEstaDesbloqueado,
} from '../meta/melhorias.js';
import {
  exportarMetaJson,
  importarMetaJson,
  modificadoresMeta,
  salvarMeta,
} from '../meta/meta.js';

function el(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

function resumirEfeitoMelhoria(id, mods) {
  if (id === 'torcida') {
    return `Atual: +${Math.round(mods.bonusReceitaPct * 100)}% em receitas de partidas e patrocínios.`;
  }
  if (id === 'estadio') {
    return `Atual: +$${mods.bilheteriaPorPartida} de bilheteria por partida (15 × ${mods.nivelEstadio} × ${(1 + 0.1 * mods.nivelTorcida).toFixed(2).replace('.', ',')}).`;
  }
  if (id === 'base') {
    return mods.jovensNoMercado > 0
      ? `Atual: ${mods.jovensNoMercado} jovem(ns) barato(s) por mercado, evoluindo +1 atributo por jogo.`
      : 'Atual: nenhum jovem extra no mercado.';
  }
  return `Atual: +${mods.bonusRecuperacaoEquipamentos} estamina/nó e −${Math.round(mods.reducaoCustoEstamina * 100)}% custos de estamina.`;
}

export function renderizarTelaClube(
  container,
  meta,
  { feedbackInicial = '', onMetaAtualizada, onVoltarMenu } = {},
) {
  if (!container || !meta) return;
  let feedback = feedbackInicial;
  let feedbackErro = false;

  const redesenhar = () => {
    container.innerHTML = '';
    const mods = modificadoresMeta(meta);

    // Cabeçalho
    const cab = el('header', 'meta-cabecalho');
    const esquerda = el('div', 'meta-cab-esq');
    esquerda.append(
      el('span', 'no-tipo-etiqueta', 'SEDE DO CLUBE · PROGRESSÃO PERMANENTE'),
      el('h2', 'no-titulo', `${mods.clubeNome} · Gestão do Clube`),
    );

    const direita = el('div', 'meta-cab-dir');
    const saldo = el('div', 'meta-saldo-box');
    saldo.append(
      el('span', 'meta-saldo-lbl', 'Pontos de Legado'),
      el('strong', 'meta-saldo-val num-tabular', `${meta.pontosLegado} pts`),
    );
    const btnVoltar = el('button', 'btn-secundario', 'Voltar ao Menu');
    btnVoltar.type = 'button';
    btnVoltar.id = 'btn-clube-voltar';
    btnVoltar.addEventListener('click', () => onVoltarMenu?.());
    direita.append(saldo, btnVoltar);

    cab.append(esquerda, direita);
    container.appendChild(cab);

    if (feedback) {
      const box = el(
        'div',
        `meta-feedback ${feedbackErro ? 'erro' : 'sucesso'}`,
        feedback,
      );
      box.setAttribute('role', 'status');
      container.appendChild(box);
    }

    // Seção 1: Melhorias permanentes do Clube
    const secMelhorias = el('section', 'meta-secao');
    secMelhorias.appendChild(el('h3', 'escalacao-col-titulo', 'Infraestrutura do Clube (Níveis 0 a 5)'));
    const gradeMel = el('div', 'meta-grade-2');

    for (const def of LISTA_MELHORIAS_CLUBE) {
      const nivel = obterNivelMelhoria(meta, def.id);
      const custo = obterCustoProximaMelhoria(meta, def.id);
      const noMaximo = custo === null;

      const card = el('div', 'meta-card');
      const topo = el('div', 'meta-card-topo');
      topo.append(
        el('strong', 'meta-card-titulo', def.nome),
        el('span', 'meta-nivel-badge num-tabular', `Nível ${nivel}/${def.maxNivel}`),
      );

      const barra = el('div', 'meta-barra-niveis');
      for (let i = 1; i <= def.maxNivel; i += 1) {
        const pip = el('span', `meta-nivel-pip${i <= nivel ? ' ativo' : ''}`);
        barra.appendChild(pip);
      }

      const desc = el('p', 'meta-card-desc', def.descricao);
      const efeito = el('p', 'meta-card-efeito', resumirEfeitoMelhoria(def.id, mods));

      const btn = el(
        'button',
        'btn-primario meta-btn-acao',
        noMaximo ? 'Nível Máximo' : `Melhorar p/ Nível ${nivel + 1} (${custo} pts)`,
      );
      btn.type = 'button';
      btn.dataset.melhoria = def.id;
      btn.disabled = noMaximo || meta.pontosLegado < custo;
      btn.addEventListener('click', () => {
        const res = comprarMelhoriaClube(meta, def.id);
        feedback = res.valido ? res.resumo : res.motivo;
        feedbackErro = !res.valido;
        if (res.valido) {
          salvarMeta(meta);
          onMetaAtualizada?.(meta);
        }
        redesenhar();
      });

      card.append(topo, barra, desc, efeito, btn);
      gradeMel.appendChild(card);
    }
    secMelhorias.appendChild(gradeMel);
    container.appendChild(secMelhorias);

    // Seção 2: Uniformes
    const secUni = el('section', 'meta-secao');
    secUni.appendChild(
      el('h3', 'escalacao-col-titulo', 'Uniforme Oficial (Cores em Campo)'),
    );
    const gradeUni = el('div', 'meta-grade-uniformes');

    for (const pal of LISTA_UNIFORMES) {
      const desb = uniformeEstaDesbloqueado(meta, pal.id);
      const equipado = meta.uniformeEquipado === pal.id;

      const card = el('div', `meta-uniforme-card${equipado ? ' equipado' : ''}`);

      const preview = el('div', 'uniforme-chip-preview');
      preview.style.background = pal.corPrincipal;
      preview.style.borderColor = pal.corBorda;
      preview.style.color = pal.corTexto;
      const pNome = el('span', '', 'Murilo');
      const pPos = el('span', '', 'ZAG');
      pPos.style.color = pal.corDetalhe;
      preview.append(pNome, pPos);

      const titulo = el('strong', 'meta-uni-nome', pal.nome);
      const btn = el(
        'button',
        equipado ? 'btn-finalizar meta-btn-acao' : 'btn-secundario meta-btn-acao',
        equipado
          ? 'Equipado'
          : desb
            ? 'Equipar'
            : `Desbloquear (${pal.custo} pts)`,
      );
      btn.type = 'button';
      btn.dataset.uniforme = pal.id;
      btn.disabled = equipado || (!desb && meta.pontosLegado < pal.custo);
      btn.addEventListener('click', () => {
        const res = comprarOuEquiparUniforme(meta, pal.id);
        feedback = res.valido ? res.resumo : res.motivo;
        feedbackErro = !res.valido;
        if (res.valido) {
          salvarMeta(meta);
          onMetaAtualizada?.(meta);
        }
        redesenhar();
      });

      card.append(preview, titulo, btn);
      gradeUni.appendChild(card);
    }
    secUni.appendChild(gradeUni);
    container.appendChild(secUni);

    // Seção 3: Clubes Iniciais & Técnicos
    const gradeDupla = el('div', 'meta-grade-2');

    const secClubes = el('section', 'meta-secao');
    secClubes.appendChild(el('h3', 'escalacao-col-titulo', 'Clubes Iniciais'));
    const listaClubes = el('div', 'meta-lista-vertical');
    for (const clube of LISTA_CLUBES_INICIAIS) {
      const desb = clubeEstaDesbloqueado(meta, clube.id);
      const selecionado = meta.clubeSelecionadoPadrao === clube.id;
      const card = el('div', `meta-card${selecionado ? ' ativo' : ''}`);
      card.append(
        el('div', 'meta-card-topo').appendChild(
          (() => {
            const w = el('div', 'meta-card-topo-inner');
            w.append(
              el('strong', 'meta-card-titulo', `${clube.nome} (${clube.rotuloEstilo})`),
              el(
                'span',
                'meta-nivel-badge num-tabular',
                desb ? (selecionado ? 'Padrão' : 'Desbloqueado') : `${clube.custo} pts`,
              ),
            );
            return w;
          })(),
        ),
        el('p', 'meta-card-desc', clube.descricao),
      );
      const btn = el(
        'button',
        desb ? 'btn-secundario meta-btn-acao' : 'btn-primario meta-btn-acao',
        selecionado
          ? 'Selecionado como Padrão'
          : desb
            ? 'Definir como Padrão'
            : `Desbloquear Clube (${clube.custo} pts)`,
      );
      btn.type = 'button';
      btn.dataset.clubeId = clube.id;
      btn.disabled = selecionado || (!desb && meta.pontosLegado < clube.custo);
      btn.addEventListener('click', () => {
        const res = comprarDesbloqueioClube(meta, clube.id);
        feedback = res.valido ? res.resumo : res.motivo;
        feedbackErro = !res.valido;
        if (res.valido) {
          salvarMeta(meta);
          onMetaAtualizada?.(meta);
        }
        redesenhar();
      });
      card.appendChild(btn);
      listaClubes.appendChild(card);
    }
    secClubes.appendChild(listaClubes);

    const secTecs = el('section', 'meta-secao');
    secTecs.appendChild(el('h3', 'escalacao-col-titulo', 'Técnicos Disponíveis'));
    const listaTecs = el('div', 'meta-lista-vertical');
    for (const tec of LISTA_TECNICOS_CLUBE) {
      const desb = tecnicoEstaDesbloqueado(meta, tec.id);
      const selecionado = meta.tecnicoSelecionadoPadrao === tec.id;
      const card = el('div', `meta-card${selecionado ? ' ativo' : ''}`);
      const topo = el('div', 'meta-card-topo');
      topo.append(
        el('strong', 'meta-card-titulo', tec.nome),
        el(
          'span',
          'meta-nivel-badge num-tabular',
          desb ? (selecionado ? 'Padrão' : 'Desbloqueado') : `${tec.custo} pts`,
        ),
      );
      card.append(topo, el('p', 'meta-card-desc', tec.descricao));
      const btn = el(
        'button',
        desb ? 'btn-secundario meta-btn-acao' : 'btn-primario meta-btn-acao',
        selecionado
          ? 'Selecionado como Padrão'
          : desb
            ? 'Definir como Padrão'
            : `Contratar Técnico (${tec.custo} pts)`,
      );
      btn.type = 'button';
      btn.dataset.tecnicoId = tec.id;
      btn.disabled = selecionado || (!desb && meta.pontosLegado < tec.custo);
      btn.addEventListener('click', () => {
        const res = comprarDesbloqueioTecnico(meta, tec.id);
        feedback = res.valido ? res.resumo : res.motivo;
        feedbackErro = !res.valido;
        if (res.valido) {
          salvarMeta(meta);
          onMetaAtualizada?.(meta);
        }
        redesenhar();
      });
      card.appendChild(btn);
      listaTecs.appendChild(card);
    }
    secTecs.appendChild(listaTecs);

    gradeDupla.append(secClubes, secTecs);
    container.appendChild(gradeDupla);

    // Seção 4: Pacotes de conteúdo
    const secPacotes = el('section', 'meta-secao');
    secPacotes.appendChild(el('h3', 'escalacao-col-titulo', 'Pacotes de Conteúdo'));
    const gradePac = el('div', 'meta-grade-2');
    for (const pac of LISTA_PACOTES_CONTEUDO) {
      const desb = pacoteEstaDesbloqueado(meta, pac.id);
      const card = el('div', `meta-card${desb ? ' ativo' : ''}`);
      const topo = el('div', 'meta-card-topo');
      topo.append(
        el('strong', 'meta-card-titulo', pac.nome),
        el('span', 'meta-nivel-badge num-tabular', desb ? 'Ativo' : `${pac.custo} pts`),
      );
      card.append(topo, el('p', 'meta-card-desc', pac.descricao));
      const btn = el(
        'button',
        desb ? 'btn-finalizar meta-btn-acao' : 'btn-primario meta-btn-acao',
        desb ? 'Desbloqueado' : `Desbloquear Pacote (${pac.custo} pts)`,
      );
      btn.type = 'button';
      btn.dataset.pacoteId = pac.id;
      btn.disabled = desb || meta.pontosLegado < pac.custo;
      btn.addEventListener('click', () => {
        const res = comprarPacoteConteudo(meta, pac.id);
        feedback = res.valido ? res.resumo : res.motivo;
        feedbackErro = !res.valido;
        if (res.valido) {
          salvarMeta(meta);
          onMetaAtualizada?.(meta);
        }
        redesenhar();
      });
      card.appendChild(btn);
      gradePac.appendChild(card);
    }
    secPacotes.appendChild(gradePac);
    container.appendChild(secPacotes);

    // Seção 5: Exportar e Importar JSON
    const secBackup = el('section', 'meta-secao meta-backup-box');
    secBackup.appendChild(
      el('h3', 'escalacao-col-titulo', 'Backup do Progresso (JSON)'),
    );
    secBackup.appendChild(
      el(
        'p',
        'meta-card-desc',
        'O progresso é salvo automaticamente no navegador (localStorage). Use Exportar/Importar para fazer cópia de segurança em arquivo JSON.',
      ),
    );

    const barraBackup = el('div', 'meta-backup-acoes');
    const btnExportar = el('button', 'btn-secundario', 'Exportar JSON');
    btnExportar.type = 'button';
    btnExportar.id = 'btn-exportar-meta-json';
    btnExportar.addEventListener('click', () => {
      try {
        const json = exportarMetaJson(meta);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `prancheta11-progresso-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        feedback = 'Backup JSON exportado com sucesso.';
        feedbackErro = false;
      } catch {
        feedback = 'Não foi possível gerar o download do arquivo JSON.';
        feedbackErro = true;
      }
      redesenhar();
    });

    const inputImportar = document.createElement('input');
    inputImportar.type = 'file';
    inputImportar.id = 'input-importar-meta-json';
    inputImportar.accept = '.json,application/json';
    inputImportar.hidden = true;
    inputImportar.addEventListener('change', () => {
      const arquivo = inputImportar.files?.[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        const res = importarMetaJson(String(leitor.result || ''));
        if (!res.valido) {
          feedback = res.motivo;
          feedbackErro = true;
          redesenhar();
          return;
        }
        Object.assign(meta, res.meta);
        salvarMeta(meta);
        onMetaAtualizada?.(meta);
        feedback = `Progresso importado! Saldo atual: ${meta.pontosLegado} pts.`;
        feedbackErro = false;
        redesenhar();
      };
      leitor.onerror = () => {
        feedback = 'Erro ao ler o arquivo selecionado.';
        feedbackErro = true;
        redesenhar();
      };
      leitor.readAsText(arquivo);
    });

    const btnImportar = el('button', 'btn-secundario', 'Importar JSON');
    btnImportar.type = 'button';
    btnImportar.id = 'btn-importar-meta-json';
    btnImportar.addEventListener('click', () => inputImportar.click());

    barraBackup.append(btnExportar, btnImportar, inputImportar);
    secBackup.appendChild(barraBackup);
    container.appendChild(secBackup);
  };

  redesenhar();
}
