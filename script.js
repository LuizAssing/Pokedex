const SUPABASE_URL = 'https://gxgfvpevsgokfhtadspu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4Z2Z2cGV2c2dva2ZodGFkc3B1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjQ1MjksImV4cCI6MjEwODUwMDUyOX0.Pg249Sm5IXWDMq9uDGD-nRGZ1kCMvyrzxHB4N0mXAso';
const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const API_BASE_URL = 'https://pokeapi.co/api/v2';
const POKEMONS_PER_PAGE = 20;
let pokemons = [];
let currentOffset = 0;
let isLoading = false;
let hasMorePokemons = true;
let currentDetailId = null;
// Tela de onde o usuário abriu os detalhes (para o botão Voltar)
let telaAnterior = 'lista';
// Tradução e classes de cores para todos os tipos de Pokémon
const TYPE_LABELS = {
  grass: { label: 'Grama', cls: 't-grass' },
  poison: { label: 'Veneno', cls: 't-poison' },
  fire: { label: 'Fogo', cls: 't-fire' },
  water: { label: 'Água', cls: 't-water' },
  electric: { label: 'Elétrico', cls: 't-electric' },
  normal: { label: 'Normal', cls: 't-normal' },
  rock: { label: 'Pedra', cls: 't-rock' },
  ground: { label: 'Terra', cls: 't-ground' },
  fairy: { label: 'Fada', cls: 't-fairy' },
  bug: { label: 'Inseto', cls: 't-bug' },
  ghost: { label: 'Fantasma', cls: 't-ghost' },
  steel: { label: 'Aço', cls: 't-steel' },
  psychic: { label: 'Psíquico', cls: 't-psychic' },
  ice: { label: 'Gelo', cls: 't-ice' },
  dragon: { label: 'Dragão', cls: 't-dragon' },
  fighting: { label: 'Lutador', cls: 't-fighting' },
  flying: { label: 'Voador', cls: 't-flying' },
  dark: { label: 'Sombrio', cls: 't-dark' }
};
// Todos os Pokémons cujos detalhes já foram baixados (lista, busca ou favoritos), por id
const pokemonCache = new Map();
// Índice leve com { id, name } de TODOS os Pokémons da API (baixado uma vez, na primeira busca)
let pokemonIndex = null;
// Ids de cada tipo, vindos de /type/{tipo} (ex.: typeIdsCache.water = Set de ids)
const typeIdsCache = {};
// Quantos resultados mostrar na busca (cresce com o botão "Carregar mais")
let limiteBusca = POKEMONS_PER_PAGE;
// Evita que uma busca antiga (mais lenta) sobrescreva o resultado de uma mais nova
let buscaToken = 0;

async function fetchPokemonDetails(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Erro ao buscar dados do Pokémon');
  return await response.json();
}

function idDaUrl(url) {
  const match = url.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

async function fetchPokemonById(id) {
  if (pokemonCache.has(id)) return pokemonCache.get(id);
  const p = await fetchPokemonDetails(`${API_BASE_URL}/pokemon/${id}`);
  pokemonCache.set(p.id, p);
  return p;
}

async function carregarIndice() {
  if (pokemonIndex) return pokemonIndex;
  const response = await fetch(`${API_BASE_URL}/pokemon?limit=2000`);
  if (!response.ok) throw new Error('Falha ao baixar a lista de Pokémons');
  const data = await response.json();
  pokemonIndex = data.results.map(item => ({ id: idDaUrl(item.url), name: item.name }));
  return pokemonIndex;
}

async function carregarIdsDoTipo(tipo) {
  if (typeIdsCache[tipo]) return typeIdsCache[tipo];
  const response = await fetch(`${API_BASE_URL}/type/${tipo}`);
  if (!response.ok) throw new Error('Falha ao buscar o tipo');
  const data = await response.json();
  typeIdsCache[tipo] = new Set(data.pokemon.map(item => idDaUrl(item.pokemon.url)));
  return typeIdsCache[tipo];
}
async function fetchPokemonBatch(offset = 0, limit = POKEMONS_PER_PAGE) {
  if (isLoading) return [];
  isLoading = true;
  const statusMsg = document.getElementById('statusMsg');
  if (statusMsg && pokemons.length === 0) {
    statusMsg.textContent = 'Carregando Pokémons da PokéAPI...';
    statusMsg.hidden = false;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/pokemon?offset=${offset}&limit=${limit}`);
    if (!response.ok) throw new Error('Falha ao conectar com a PokéAPI');
    const data = await response.json();
    if (!data.next) {
      hasMorePokemons = false;
    }
    // Busca os dados completos de todos os Pokémons da página em paralelo
    const detailPromises = data.results.map(item => fetchPokemonById(idDaUrl(item.url)));
    const newPokemons = await Promise.all(detailPromises);
    pokemons = [...pokemons, ...newPokemons];
    currentOffset += limit;
    if (statusMsg) statusMsg.hidden = true;
    return newPokemons;
  } catch (error) {
    console.error('Erro ao consumir PokeAPI:', error);
    if (statusMsg) {
      statusMsg.textContent = 'Erro ao carregar dados da PokéAPI. Verifique sua conexão à internet.';
      statusMsg.hidden = false;
    }
    return [];
  } finally {
    isLoading = false;
  }
}

// Nomes dos stats da API para os ids usados nas barras de detalhe.
const STAT_BARS = [
  ['hp', 'statHp', 'statHpVal'],
  ['attack', 'statAtk', 'statAtkVal'],
  ['defense', 'statDef', 'statDefVal'],
  ['special-attack', 'statSpAtk', 'statSpAtkVal'],
  ['special-defense', 'statSpDef', 'statSpDefVal'],
  ['speed', 'statSpeed', 'statSpeedVal']
];


const STORAGE_FAVORITES_KEY = 'pokedex_favoritos_v1';
// Cada treinador tem sua própria chave (a chave base + o id do usuário no Supabase)
let favoritesKey = STORAGE_FAVORITES_KEY;
// Recupera os favoritos salvos no navegador (ou inicia com Pikachu #25 se for a primeira vez)
function loadFavorites() {
  try {
    const salvo = localStorage.getItem(favoritesKey);
    if (salvo) {
      const ids = JSON.parse(salvo);
      return new Set(ids);
    }
  } catch (erro) {
    console.error('Erro ao ler favoritos do localStorage:', erro);
  }
  return new Set([25]);
}
function saveFavorites() {
  try {
    localStorage.setItem(favoritesKey, JSON.stringify(Array.from(favorites)));
  } catch (erro) {
    console.error('Erro ao salvar favoritos no localStorage:', erro);
  }
}
let favorites = loadFavorites();
// Troca a lista de favoritos para a do treinador logado (ou volta à padrão ao sair)
function usarFavoritosDoUsuario(userId) {
  favoritesKey = userId ? `${STORAGE_FAVORITES_KEY}_${userId}` : STORAGE_FAVORITES_KEY;
  favorites = loadFavorites();
}

// Busca os favoritos do treinador na tabela "favoritos" do Supabase (vale em qualquer computador)
async function carregarFavoritosDaNuvem(userId) {
  usarFavoritosDoUsuario(userId);
  if (!db || !userId) return;
  const { data, error } = await db.from('favoritos').select('pokemon_id');
  if (error) {
    console.error('Erro ao carregar favoritos da nuvem:', error);
    return;
  }
  favorites = new Set(data.map(f => f.pokemon_id));
  saveFavorites();
}

// Envia para o Supabase a inclusão ou remoção de um favorito
async function sincronizarFavorito(id, adicionando) {
  if (!db) return;
  const { data } = await db.auth.getSession();
  if (!data.session) return;
  const { error } = adicionando
    ? await db.from('favoritos').insert({ pokemon_id: id })
    : await db.from('favoritos').delete().eq('pokemon_id', id);
  // 23505 = favorito já existia na nuvem, pode ignorar
  if (error && error.code !== '23505') console.error('Erro ao sincronizar favorito:', error);
}

function findPokemon(id) {
  return pokemonCache.get(id);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function artworkUrl(p) {
  return p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default || '';
}

function getStat(p, statName) {
  const found = p.stats.find(s => s.stat.name === statName);
  return found ? found.base_stat : 0;
}

function typesHtml(p) {
  return p.types
    .map(t => {
      const info = TYPE_LABELS[t.type.name] || { label: capitalize(t.type.name), cls: 't-normal' };
      return `<span class="type-tag ${info.cls}">${info.label}</span>`;
    })
    .join('');
}

function cardHtml(p) {
  const isFav = favorites.has(p.id);
  return `
    <li class="poke-card" data-id="${p.id}">
      <button type="button" class="fav-icon ${isFav ? 'on' : ''}" data-fav="${p.id}" aria-label="Favoritar ${capitalize(p.name)}">${isFav ? '★' : '☆'}</button>
      <button type="button" class="card-open">
        <img src="${artworkUrl(p)}" alt="${capitalize(p.name)}">
        <div class="dex-no">#${String(p.id).padStart(3, '0')}</div>
        <h2 class="poke-name">${capitalize(p.name)}</h2>
        ${typesHtml(p)}
      </button>
    </li>`;
}

function lerFiltros() {
  const searchInput = document.getElementById('buscaPokemon');
  const typeSelect = document.getElementById('filtroTipo');
  const termo = searchInput ? searchInput.value.trim().toLowerCase().replace(/^#/, '') : '';
  const tipo = typeSelect ? typeSelect.value : '';
  return { termo, tipo };
}

// Mesma regra de antes: bate pelo nome ou pelo número (com ou sem zeros à esquerda)
function combinaComTermo(p, termo) {
  if (!termo) return true;
  return p.name.toLowerCase().includes(termo) ||
    String(p.id).includes(termo) ||
    String(p.id).padStart(3, '0').includes(termo);
}

// Procura na Pokédex inteira (índice completo da API), não só no que já foi carregado
async function buscarNaPokedexInteira(termo, tipo) {
  let candidatos = await carregarIndice();
  if (tipo) {
    const idsDoTipo = await carregarIdsDoTipo(tipo);
    candidatos = candidatos.filter(p => idsDoTipo.has(p.id));
  }
  candidatos = candidatos.filter(p => combinaComTermo(p, termo));

  const pagina = candidatos.slice(0, limiteBusca);
  const statusMsg = document.getElementById('statusMsg');
  const precisaBaixar = pagina.some(p => !pokemonCache.has(p.id));
  if (statusMsg && precisaBaixar) {
    statusMsg.textContent = 'Buscando Pokémons...';
    statusMsg.hidden = false;
  }
  try {
    const resultados = await Promise.all(pagina.map(p => fetchPokemonById(p.id)));
    return { resultados, temMais: candidatos.length > pagina.length };
  } finally {
    if (statusMsg && precisaBaixar) statusMsg.hidden = true;
  }
}

// Busca antiga (só no que já foi carregado), usada se a PokéAPI não responder ao índice
function filtrarCarregados(termo, tipo) {
  return pokemons.filter(p =>
    combinaComTermo(p, termo) && (!tipo || p.types.some(t => t.type.name === tipo))
  );
}

function atualizarBotaoMais(temMais, filtrando) {
  const wrap = document.getElementById('loadMoreWrap');
  const btn = document.getElementById('btnCarregarMais');
  if (!wrap || !btn) return;
  if (filtrando) {
    wrap.hidden = !temMais;
    btn.disabled = false;
    btn.textContent = 'Carregar mais resultados';
    return;
  }
  wrap.hidden = false;
  btn.disabled = !temMais;
  btn.textContent = temMais ? 'Carregar mais Pokémons' : 'Todos os Pokémons foram carregados';
}

function desenharCards(lista) {
  const cardGrid = document.getElementById('cardGrid');
  if (lista.length === 0) {
    cardGrid.innerHTML = '<li class="sub" style="grid-column: 1 / -1; text-align: center; padding: 40px 16px;">Nenhum Pokémon encontrado.</li>';
    return;
  }
  cardGrid.innerHTML = lista.map(cardHtml).join('');
}

async function renderList() {
  const { termo, tipo } = lerFiltros();
  const filtrando = Boolean(termo || tipo);

  if (!filtrando) {
    buscaToken++;
    desenharCards(pokemons);
    atualizarBotaoMais(hasMorePokemons, false);
    return;
  }

  const token = ++buscaToken;
  try {
    const { resultados, temMais } = await buscarNaPokedexInteira(termo, tipo);
    if (token !== buscaToken) return;
    desenharCards(resultados);
    atualizarBotaoMais(temMais, true);
  } catch (erro) {
    console.error('Erro na busca completa, usando só os já carregados:', erro);
    if (token !== buscaToken) return;
    desenharCards(filtrarCarregados(termo, tipo));
    atualizarBotaoMais(false, true);
  }
}


async function renderFavorites() {
  const grid = document.getElementById('favGrid');

  try {
    await Promise.all(Array.from(favorites).map(id => fetchPokemonById(id)));
  } catch (e) {
    console.error('Erro ao carregar favoritos da PokéAPI:', e);
  }

  const favPokemons = Array.from(favorites)
    .map(id => pokemonCache.get(id))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);

  if (favPokemons.length === 0) {
    grid.innerHTML = '<li class="sub">Você ainda não favoritou nenhum Pokémon.</li>';
    return;
  }

  grid.innerHTML = favPokemons
    .map(p => `
      <li class="fav-list-item" data-id="${p.id}">
        <img src="${artworkUrl(p)}" alt="${capitalize(p.name)}">
        <div class="meta">
          <div class="dex-no">#${String(p.id).padStart(3, '0')}</div>
          <h2 class="poke-name">${capitalize(p.name)}</h2>
        </div>
        <button type="button" class="remove-x" data-fav="${p.id}" aria-label="Remover ${capitalize(p.name)} dos favoritos">✕</button>
      </li>`)
    .join('');
}

// 255 é o maior valor de status base que existe nos jogos (HP da Blissey)
const MAIOR_STATUS_POSSIVEL = 255;
const URL_ARTE_OFICIAL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

// A PokéAPI não tem textos em português, então usamos espanhol e, se faltar, inglês
const IDIOMAS_DESCRICAO = ['es', 'en'];

const REGIOES_POR_GERACAO = {
  'generation-i': '1ª geração · Kanto',
  'generation-ii': '2ª geração · Johto',
  'generation-iii': '3ª geração · Hoenn',
  'generation-iv': '4ª geração · Sinnoh',
  'generation-v': '5ª geração · Unova',
  'generation-vi': '6ª geração · Kalos',
  'generation-vii': '7ª geração · Alola',
  'generation-viii': '8ª geração · Galar',
  'generation-ix': '9ª geração · Paldea'
};

const NOMES_HABITAT = {
  cave: 'Cavernas',
  forest: 'Florestas',
  grassland: 'Campos',
  mountain: 'Montanhas',
  rare: 'Raro',
  'rough-terrain': 'Terreno acidentado',
  sea: 'Mar',
  urban: 'Cidades',
  'waters-edge': 'Beira d\'água'
};

const cacheRelacoesTipo = {};
let totalEspeciesDetalhe = null;

function formatarNome(nome) {
  return nome.split('-').map(capitalize).join(' ');
}

async function obterTotalEspecies() {
  if (totalEspeciesDetalhe === null) {
    const data = await fetchPokemonDetails(`${API_BASE_URL}/pokemon-species?limit=1`);
    totalEspeciesDetalhe = data.count;
  }
  return totalEspeciesDetalhe;
}

async function relacoesDoTipo(tipo) {
  if (!cacheRelacoesTipo[tipo]) {
    const data = await fetchPokemonDetails(`${API_BASE_URL}/type/${tipo}`);
    cacheRelacoesTipo[tipo] = data.damage_relations;
  }
  return cacheRelacoesTipo[tipo];
}

// Multiplica o dano de cada tipo atacante pelos tipos do Pokémon (ex.: Charizard leva 4x de Pedra)
async function calcularEficacia(p) {
  const multiplicadores = {};
  Object.keys(TYPE_LABELS).forEach(tipo => {
    multiplicadores[tipo] = 1;
  });

  const relacoes = await Promise.all(p.types.map(t => relacoesDoTipo(t.type.name)));
  relacoes.forEach(rel => {
    rel.double_damage_from.forEach(t => { if (t.name in multiplicadores) multiplicadores[t.name] *= 2; });
    rel.half_damage_from.forEach(t => { if (t.name in multiplicadores) multiplicadores[t.name] *= 0.5; });
    rel.no_damage_from.forEach(t => { if (t.name in multiplicadores) multiplicadores[t.name] = 0; });
  });
  return multiplicadores;
}

function tagsDeEficacia(multiplicadores, condicao) {
  const textoMultiplicador = { 4: '×4', 2: '×2', 0.5: '×½', 0.25: '×¼', 0: '×0' };
  const tags = Object.entries(multiplicadores)
    .filter(([, valor]) => condicao(valor))
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, valor]) => {
      const info = TYPE_LABELS[tipo];
      return `<span class="type-tag ${info.cls}">${info.label} ${textoMultiplicador[valor] || ''}</span>`;
    });
  return tags.length ? tags.join('') : '<span class="sub">Nenhum</span>';
}

function renderEficacia(multiplicadores) {
  document.getElementById('detailFraquezas').innerHTML = tagsDeEficacia(multiplicadores, v => v > 1);
  document.getElementById('detailResistencias').innerHTML = tagsDeEficacia(multiplicadores, v => v > 0 && v < 1);
  document.getElementById('detailImunidades').innerHTML = tagsDeEficacia(multiplicadores, v => v === 0);
}

function textoCondicaoEvolucao(detalhe) {
  if (!detalhe) return '';
  if (detalhe.min_level) return `Nível ${detalhe.min_level}`;
  if (detalhe.item) return formatarNome(detalhe.item.name);
  if (detalhe.trigger?.name === 'trade') return 'Troca';
  if (detalhe.min_happiness) return 'Amizade alta';
  if (detalhe.known_move) return `Conhecer ${formatarNome(detalhe.known_move.name)}`;
  return 'Condição especial';
}

// Transforma a árvore da evolution-chain em etapas: [[Bulbasaur], [Ivysaur], [Venusaur]]
function etapasDaEvolucao(no, etapa = 0, etapas = []) {
  if (!etapas[etapa]) etapas[etapa] = [];
  etapas[etapa].push({
    id: idDaUrl(no.species.url),
    nome: no.species.name,
    condicao: textoCondicaoEvolucao(no.evolution_details[0])
  });
  no.evolves_to.forEach(filho => etapasDaEvolucao(filho, etapa + 1, etapas));
  return etapas;
}

function renderEvolucoes(cadeia, idAtual) {
  const lista = document.getElementById('detailEvolucoes');
  const etapas = etapasDaEvolucao(cadeia);

  if (etapas.length === 1) {
    lista.innerHTML = '<li class="sub">Este Pokémon não evolui.</li>';
    return;
  }

  lista.innerHTML = etapas
    .map(etapa => `
      <li class="evo-etapa">
        ${etapa.map(evo => `
          <button type="button" class="evo-item ${evo.id === idAtual ? 'atual' : ''}" data-evo-id="${evo.id}">
            <img src="${URL_ARTE_OFICIAL}/${evo.id}.png" alt="" loading="lazy">
            <span class="dex-no">Nº ${String(evo.id).padStart(4, '0')}</span>
            <strong>${formatarNome(evo.nome)}</strong>
            ${evo.condicao ? `<small>${evo.condicao}</small>` : ''}
          </button>`).join('')}
      </li>`)
    .join('');
}

function renderEspecie(especie) {
  const genero = especie.genera.find(g => IDIOMAS_DESCRICAO.includes(g.language.name));
  document.getElementById('detailCategoria').textContent = genero ? genero.genus : '';

  // pega a descrição do jogo mais recente no primeiro idioma disponível
  let descricao = null;
  for (const idioma of IDIOMAS_DESCRICAO) {
    const textos = especie.flavor_text_entries.filter(f => f.language.name === idioma);
    if (textos.length) {
      descricao = textos[textos.length - 1];
      break;
    }
  }
  document.getElementById('detailDescricao').textContent = descricao
    ? descricao.flavor_text.replace(/[\n\f\u00ad]/g, ' ')
    : 'Sem descrição disponível.';
  document.getElementById('detailFonte').textContent = descricao
    ? `Texto oficial de Pokémon ${formatarNome(descricao.version.name)} (${descricao.language.name === 'es' ? 'espanhol' : 'inglês'}).`
    : '';

  document.getElementById('detailGeracao').textContent = REGIOES_POR_GERACAO[especie.generation.name] || especie.generation.name;
  document.getElementById('detailHabitat').textContent = especie.habitat ? (NOMES_HABITAT[especie.habitat.name] || especie.habitat.name) : 'Não informado';
  document.getElementById('detailCaptura').textContent = `${especie.capture_rate} de 255`;

  if (especie.gender_rate === -1) {
    document.getElementById('detailGenero').textContent = 'Sem gênero';
  } else {
    const femea = especie.gender_rate * 12.5;
    document.getElementById('detailGenero').textContent =
      `♂ ${(100 - femea).toLocaleString('pt-BR')}% · ♀ ${femea.toLocaleString('pt-BR')}%`;
  }

  let raridade = '';
  if (especie.is_legendary) raridade = 'Lendário';
  if (especie.is_mythical) raridade = 'Mítico';
  if (especie.is_baby) raridade = 'Bebê';
  document.getElementById('detailRaridade').innerHTML = raridade ? `<span class="raridade">${raridade}</span>` : '';
}

function limparDadosEspecie() {
  ['detailCategoria', 'detailDescricao', 'detailFonte', 'detailGeracao', 'detailHabitat',
    'detailCaptura', 'detailGenero', 'detailRaridade', 'detailFraquezas', 'detailResistencias',
    'detailImunidades', 'detailEvolucoes'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  document.getElementById('detailDescricao').textContent = 'Carregando...';
}

async function atualizarNavegacaoDetalhe(id) {
  const anterior = document.getElementById('detailAnterior');
  const proximo = document.getElementById('detailProximo');
  document.getElementById('detailAnteriorNo').textContent = 'Nº ' + String(id - 1).padStart(4, '0');
  document.getElementById('detailProximoNo').textContent = 'Nº ' + String(id + 1).padStart(4, '0');
  anterior.hidden = id <= 1;
  try {
    proximo.hidden = id >= await obterTotalEspecies();
  } catch (erro) {
    proximo.hidden = false;
  }
}

async function renderDetail(id) {
  currentDetailId = id;
  window.scrollTo(0, 0);

  let p;
  try {
    p = await fetchPokemonById(id);
  } catch (erro) {
    console.error('Erro ao carregar Pokémon:', erro);
    document.getElementById('detailName').textContent = 'Não foi possível carregar este Pokémon.';
    return;
  }
  // se o usuário já clicou em outro Pokémon enquanto carregava, ignora este
  if (currentDetailId !== id) return;

  document.getElementById('detailImg').src = artworkUrl(p);
  document.getElementById('detailImg').alt = capitalize(p.name);
  document.getElementById('detailNo').textContent = 'Nº ' + String(p.id).padStart(4, '0');
  document.getElementById('detailName').textContent = formatarNome(p.name);
  document.getElementById('detailTypes').innerHTML = typesHtml(p);
  // altura e peso vêm da API em decímetros e hectogramas
  document.getElementById('detailHeight').textContent = (p.height / 10).toLocaleString('pt-BR') + ' m';
  document.getElementById('detailWeight').textContent = (p.weight / 10).toLocaleString('pt-BR') + ' kg';
  document.getElementById('detailAbilities').textContent = p.abilities
    .map(a => formatarNome(a.ability.name) + (a.is_hidden ? ' (oculta)' : ''))
    .join(', ');
  document.getElementById('detailExperiencia').textContent = p.base_experience ?? '—';
  updateFavBtn();
  atualizarNavegacaoDetalhe(id);

  let total = 0;
  STAT_BARS.forEach(([statName, barId, valId]) => {
    const val = getStat(p, statName);
    total += val;
    const barra = document.getElementById(barId);
    barra.style.width = (val / MAIOR_STATUS_POSSIVEL) * 100 + '%';
    // faixas parecidas com as do PokémonDB: vermelho = baixo, amarelo = médio, verde = alto
    barra.className = 'stat-fill ' + (val < 60 ? 'baixo' : val < 90 ? 'medio' : 'alto');
    document.getElementById(valId).textContent = val;
  });
  document.getElementById('statTotal').textContent = total;

  limparDadosEspecie();
  try {
    const especie = await fetchPokemonDetails(p.species.url);
    if (currentDetailId !== id) return;
    renderEspecie(especie);

    const [cadeia, eficacia] = await Promise.all([
      fetchPokemonDetails(especie.evolution_chain.url),
      calcularEficacia(p)
    ]);
    if (currentDetailId !== id) return;
    renderEvolucoes(cadeia.chain, id);
    renderEficacia(eficacia);
  } catch (erro) {
    console.error('Erro ao carregar dados da espécie:', erro);
    document.getElementById('detailDescricao').textContent = 'Não foi possível carregar a descrição e a evolução.';
  }
}


function updateFavBtn() {
  const btn = document.getElementById('detailFavBtn');
  const isFav = favorites.has(currentDetailId);
  btn.textContent = isFav ? '★ Favoritado' : '☆ Favoritar';
}

const btnCarregarMais = document.getElementById('btnCarregarMais');
if (btnCarregarMais) {
  btnCarregarMais.addEventListener('click', async () => {
    if (isLoading) return;
    const { termo, tipo } = lerFiltros();
    const filtrando = Boolean(termo || tipo);
    if (!filtrando && !hasMorePokemons) return;

    btnCarregarMais.disabled = true;
    btnCarregarMais.textContent = 'Carregando Pokémons...';
    if (filtrando) {
      limiteBusca += POKEMONS_PER_PAGE;
    } else {
      await fetchPokemonBatch(currentOffset, POKEMONS_PER_PAGE);
    }
    await renderList();
  });
}
  function toggleFavorite(id) {
    const adicionando = !favorites.has(id);
    if (adicionando) {
      favorites.add(id);
    } else {
      favorites.delete(id);
    }
    saveFavorites();
    sincronizarFavorito(id, adicionando);
  }

    async function showScreen(name) {
      document.querySelectorAll('.screen').forEach(s => {
        s.hidden = true;
      });
      document.getElementById(name).hidden = false;
      if (name === 'lista') {
        if (pokemons.length === 0) {
          await fetchPokemonBatch(0, POKEMONS_PER_PAGE);
        }
        renderList();
      }
      if (name === 'favoritos') renderFavorites();
    }

  // ============ AUTENTICAÇÃO COM SUPABASE ============
  let modoAuth = 'entrar';
  const loginFeedback = document.getElementById('loginFeedback');
  const campoNomeWrap = document.getElementById('campoNomeWrap');
  const inputNome = document.getElementById('loginNome');
  const inputEmail = document.getElementById('loginEmail');
  const inputSenha = document.getElementById('loginSenha');
  const tabEntrar = document.getElementById('tabEntrar');
  const tabCriarConta = document.getElementById('tabCriarConta');
  const btnAcaoPrincipal = document.getElementById('btnEntrar');
  const btnAlternarModo = document.getElementById('btnAlternarModo');
  const aceiteTermos = document.getElementById('aceiteTermos');

  // Mensagens do Supabase traduzidas para português
  const ERROS_AUTH = {
    user_already_exists: 'Este e-mail já está cadastrado!',
    email_address_invalid: 'E-mail inválido. Verifique o endereço digitado.',
    weak_password: 'Senha fraca. Use pelo menos 8 caracteres.',
    over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  };

  function traduzirErroAuth(error) {
    if (error.message === 'User already registered') return ERROS_AUTH.user_already_exists;
    return ERROS_AUTH[error.code] || 'Não foi possível criar a conta. Tente novamente.';
  }

  function exibirFeedback(mensagem, tipo = 'erro') {
    if (!loginFeedback) return;
    loginFeedback.textContent = mensagem;
    loginFeedback.className = `feedback-msg ${tipo}`;
    loginFeedback.hidden = false;
  }

  function limparFeedback() {
    if (loginFeedback) loginFeedback.hidden = true;
  }

  function alternarAba(modo) {
    modoAuth = modo;
    limparFeedback();

    if (modo === 'entrar') {
      tabEntrar.classList.add('on');
      tabEntrar.setAttribute('aria-selected', 'true');
      tabCriarConta.classList.remove('on');
      tabCriarConta.setAttribute('aria-selected', 'false');

      campoNomeWrap.hidden = true;
      document.getElementById('loginTitle').textContent = 'Olá, treinador';
      document.getElementById('loginSub').textContent = 'Entre para acessar seus favoritos.';
      btnAcaoPrincipal.textContent = 'Entrar';
      btnAlternarModo.innerHTML = 'Não tem conta? <b>Criar conta</b>';
    } else {
      tabCriarConta.classList.add('on');
      tabCriarConta.setAttribute('aria-selected', 'true');
      tabEntrar.classList.remove('on');
      tabEntrar.setAttribute('aria-selected', 'false');

      campoNomeWrap.hidden = false;
      document.getElementById('loginTitle').textContent = 'Crie sua conta';
      document.getElementById('loginSub').textContent = 'Cadastre-se na nuvem para iniciar sua jornada.';
      btnAcaoPrincipal.textContent = 'Criar conta';
      btnAlternarModo.innerHTML = 'Já tem conta? <b>Entrar</b>';
    }
  }

  tabEntrar.addEventListener('click', () => alternarAba('entrar'));
  tabCriarConta.addEventListener('click', () => alternarAba('criar'));
  btnAlternarModo.addEventListener('click', () => alternarAba(modoAuth === 'entrar' ? 'criar' : 'entrar'));

  function atualizarNomeUsuario(nome) {
    document.querySelectorAll('.user-greet').forEach(el => {
      el.textContent = `Olá, ${nome}`;
    });
  }

  // Botão Principal (Entrar ou Criar Conta via Supabase)
  btnAcaoPrincipal.addEventListener('click', async () => {
    const email = inputEmail.value.trim().toLowerCase();
    const senha = inputSenha.value.trim();
    const nome = inputNome.value.trim();

    if (!email || !senha) {
      exibirFeedback('Preencha o e-mail e a senha.');
      return;
    }

    if (!inputEmail.checkValidity()) {
      exibirFeedback('Informe um e-mail válido (ex.: nome@exemplo.com).');
      return;
    }

    if (modoAuth === 'criar' && senha.length < 8) {
      exibirFeedback('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (modoAuth === 'criar' && !aceiteTermos.checked) {
      exibirFeedback('Você precisa aceitar os termos de uso para criar a conta.');
      return;
    }

    btnAcaoPrincipal.disabled = true;
    const textoOriginal = btnAcaoPrincipal.textContent;
    btnAcaoPrincipal.textContent = 'Conectando ao banco...';

    try {
      if (modoAuth === 'criar') {
        if (!nome) {
          exibirFeedback('Por favor, informe seu nome de treinador.');
          btnAcaoPrincipal.disabled = false;
          btnAcaoPrincipal.textContent = textoOriginal;
          return;
        }

        const { data, error } = await db.auth.signUp({
          email: email,
          password: senha,
          options: {
            data: { nome_treinador: nome }
          }
        });

        if (error) {
          exibirFeedback(traduzirErroAuth(error));
          return;
        }

        await carregarFavoritosDaNuvem(data.user?.id);
        exibirFeedback('Conta criada com sucesso na nuvem! Entrando...', 'sucesso');
        setTimeout(() => {
          atualizarNomeUsuario(nome);
          showScreen('lista');
        }, 1000);

      } else {
        const { data, error } = await db.auth.signInWithPassword({
          email: email,
          password: senha
        });

        if (error) {
          exibirFeedback('E-mail ou senha incorretos.');
          return;
        }

        const nomeTreinador = data.user?.user_metadata?.nome_treinador || email.split('@')[0];
        await carregarFavoritosDaNuvem(data.user?.id);
        atualizarNomeUsuario(nomeTreinador);
        limparFeedback();
        inputEmail.value = '';
        inputSenha.value = '';
        showScreen('lista');
      }
    } catch (err) {
      console.error('Erro na autenticação:', err);
      exibirFeedback('Erro de conexão com o banco. Verifique sua internet.');
    } finally {
      btnAcaoPrincipal.disabled = false;
      btnAcaoPrincipal.textContent = textoOriginal;
    }
  });

  // Botão Sair (desloga do Supabase)
  document.querySelectorAll('[data-nav="login"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (db) await db.auth.signOut();
      usarFavoritosDoUsuario(null);
      atualizarNomeUsuario('Ash');
      showScreen('login');
    });
  });

  // Navegação (navbar / botão voltar)
  document.querySelectorAll('[data-nav]').forEach(el => {
    if (el.dataset.nav !== 'login') {
      el.addEventListener('click', () => showScreen(el.dataset.nav));
    }
  });

  document.getElementById('backBtn').addEventListener('click', () => showScreen(telaAnterior));

  // Cards da lista: clique abre detalhes, clique na estrela favorita
  document.getElementById('cardGrid').addEventListener('click', (e) => {
    const favEl = e.target.closest('[data-fav]');
    if (favEl) {
      toggleFavorite(Number(favEl.dataset.fav));
      renderList();
      return;
    }

    const card = e.target.closest('.poke-card');
    if (card) {
      telaAnterior = 'lista';
      renderDetail(Number(card.dataset.id));
      showScreen('detalhes');
    }
  });

  document.getElementById('detailFavBtn').addEventListener('click', () => {
    toggleFavorite(currentDetailId);
    updateFavBtn();
  });

  
  // Detalhes: botões anterior / próximo e clique em uma evolução
  document.getElementById('detailAnterior').addEventListener('click', () => {
    if (currentDetailId > 1) renderDetail(currentDetailId - 1);
  });

  document.getElementById('detailProximo').addEventListener('click', () => {
    renderDetail(currentDetailId + 1);
  });

  document.getElementById('detailEvolucoes').addEventListener('click', (e) => {
    const evo = e.target.closest('[data-evo-id]');
    if (evo) renderDetail(Number(evo.dataset.evoId));
  });


  // Favoritos: clique no ✕ remove, clique no item abre os detalhes
  document.getElementById('favGrid').addEventListener('click', (e) => {
    const removeEl = e.target.closest('[data-fav]');
    if (removeEl) {
      toggleFavorite(Number(removeEl.dataset.fav));
      renderFavorites();
      return;
    }

    const item = e.target.closest('.fav-list-item');
    if (item) {
      telaAnterior = 'favoritos';
      renderDetail(Number(item.dataset.id));
      showScreen('detalhes');
    }
  });

  // Filtros da lista: busca por texto e seleção de tipo
  const buscaInput = document.getElementById('buscaPokemon');
  // Espera o usuário parar de digitar (300 ms) antes de buscar, para não disparar uma busca por letra
  let esperaDigitacao = null;
  if (buscaInput) {
    buscaInput.addEventListener('input', () => {
      clearTimeout(esperaDigitacao);
      esperaDigitacao = setTimeout(() => {
        limiteBusca = POKEMONS_PER_PAGE;
        renderList();
      }, 300);
    });
  }

  const filtroTipoSelect = document.getElementById('filtroTipo');
  if (filtroTipoSelect) {
    filtroTipoSelect.addEventListener('change', () => {
      limiteBusca = POKEMONS_PER_PAGE;
      renderList();
    });
  }

  // Mantém o treinador logado ao recarregar a página (F5)
  async function restaurarSessao() {
    if (!db) return;
    const { data } = await db.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    await carregarFavoritosDaNuvem(user.id);
    atualizarNomeUsuario(user.user_metadata?.nome_treinador || user.email.split('@')[0]);
    showScreen('lista');
  }

  restaurarSessao();
