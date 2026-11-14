function lista(pais, liga, nomes) {
  return nomes.map((nome) => ({ pais, liga, nome }));
}

const CLUBES = [
  ...lista("Brasil", "Série A", [
    "Palmeiras", "Flamengo", "Athletico-PR", "Fluminense", "Cruzeiro",
    "Bahia", "Bragantino", "Coritiba", "Atlético-MG", "Corinthians",
    "Botafogo", "Vitória", "São Paulo", "Santos", "Grêmio",
    "Internacional", "Mirassol", "Remo", "Vasco", "Chapecoense"
  ]),
  ...lista("Brasil", "Brasileirão", [
    "Fortaleza", "Ceará", "Sport", "Náutico", "Santa Cruz", "Paysandu",
    "Goiás", "Atlético-GO", "Cuiabá", "América-MG", "Juventude",
    "Criciúma", "Avaí", "Figueirense", "Ponte Preta", "Guarani",
    "Portuguesa", "CRB", "CSA", "Operário-PR", "Novorizontino", "Amazonas"
  ]),
  ...lista("Argentina", "Liga Profesional", [
    "River Plate", "Boca Juniors", "Racing", "Independiente", "San Lorenzo",
    "Estudiantes", "Lanús", "Vélez", "Rosario Central", "Newell's",
    "Argentinos Juniors", "Talleres", "Huracán", "Banfield", "Gimnasia"
  ]),
  ...lista("Uruguai", "Primera División", ["Nacional", "Peñarol", "Defensor Sporting", "Danubio"]),
  ...lista("Chile", "Primera División", ["Colo-Colo", "Universidad de Chile", "Universidad Católica", "Palestino"]),
  ...lista("Colômbia", "Primera A", ["Atlético Nacional", "Millonarios", "América de Cali", "Deportivo Cali", "Junior"]),
  ...lista("Equador", "LigaPro", ["Barcelona SC", "Independiente del Valle", "LDU Quito", "Emelec"]),
  ...lista("Paraguai", "Primera División", ["Olimpia", "Cerro Porteño", "Libertad", "Guaraní"]),
  ...lista("Peru", "Liga 1", ["Universitario", "Alianza Lima", "Sporting Cristal"]),
  ...lista("Bolívia", "División Profesional", ["Bolívar", "The Strongest", "Always Ready"]),
  ...lista("Venezuela", "Liga FUTVE", ["Caracas", "Deportivo Táchira", "Zamora"]),
  ...lista("México", "Liga MX", [
    "América", "Guadalajara", "Cruz Azul", "Monterrey", "Tigres", "Pumas",
    "Santos Laguna", "Toluca", "Pachuca", "León", "Tijuana", "Necaxa"
  ]),
  ...lista("Estados Unidos", "MLS", [
    "Inter Miami", "LAFC", "LA Galaxy", "New York City", "Atlanta United",
    "Seattle Sounders", "Austin FC", "Columbus Crew", "Philadelphia Union", "FC Cincinnati"
  ]),
  ...lista("Canadá", "MLS", ["CF Montréal", "Toronto FC", "Vancouver Whitecaps"]),
  ...lista("Inglaterra", "Premier League", [
    "Arsenal", "Chelsea", "Liverpool", "Manchester City", "Manchester United",
    "Tottenham", "Newcastle", "Aston Villa", "West Ham", "Brighton",
    "Crystal Palace", "Everton", "Nottingham Forest", "Wolves", "Fulham",
    "Brentford", "Bournemouth", "Leicester", "Leeds", "Southampton"
  ]),
  ...lista("Espanha", "La Liga", [
    "Real Madrid", "Barcelona", "Atlético de Madrid", "Sevilla", "Valencia",
    "Real Sociedad", "Villarreal", "Athletic Bilbao", "Real Betis", "Girona",
    "Osasuna", "Celta de Vigo", "Mallorca", "Rayo Vallecano", "Getafe",
    "Espanyol", "Alavés", "Las Palmas"
  ]),
  ...lista("Itália", "Serie A", [
    "Juventus", "Milan", "Inter", "Napoli", "Roma", "Lazio",
    "Atalanta", "Fiorentina", "Bologna", "Torino", "Genoa", "Udinese",
    "Sassuolo", "Cagliari", "Lecce", "Parma"
  ]),
  ...lista("Alemanha", "Bundesliga", [
    "Bayern de Munique", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
    "Eintracht Frankfurt", "Stuttgart", "Wolfsburg", "Borussia Mönchengladbach",
    "Union Berlin", "Freiburg", "Hoffenheim", "Werder Bremen", "Mainz", "Köln"
  ]),
  ...lista("França", "Ligue 1", [
    "PSG", "Marseille", "Lyon", "Monaco", "Lille", "Nice",
    "Rennes", "Lens", "Strasbourg", "Toulouse", "Nantes", "Reims"
  ]),
  ...lista("Portugal", "Primeira Liga", [
    "Benfica", "Porto", "Sporting", "Braga", "Vitória de Guimarães",
    "Boavista", "Famalicão", "Moreirense", "Casa Pia"
  ]),
  ...lista("Países Baixos", "Eredivisie", ["Ajax", "PSV", "Feyenoord", "AZ Alkmaar", "Twente"]),
  ...lista("Bélgica", "Pro League", ["Club Brugge", "Anderlecht", "Genk", "Antwerp"]),
  ...lista("Turquia", "Süper Lig", ["Galatasaray", "Fenerbahçe", "Beşiktaş", "Trabzonspor"]),
  ...lista("Grécia", "Super League", ["Olympiacos", "Panathinaikos", "AEK Atenas", "PAOK"]),
  ...lista("Escócia", "Premiership", ["Celtic", "Rangers", "Aberdeen", "Hearts"]),
  ...lista("Áustria", "Bundesliga", ["Red Bull Salzburg", "Rapid Viena", "Sturm Graz"]),
  ...lista("Suíça", "Super League", ["Young Boys", "Basel", "Zürich"]),
  ...lista("Croácia", "HNL", ["Dinamo Zagreb", "Hajduk Split", "Rijeka"]),
  ...lista("Sérvia", "SuperLiga", ["Estrela Vermelha", "Partizan"]),
  ...lista("República Tcheca", "First League", ["Sparta Praga", "Slavia Praga", "Viktoria Plzeň"]),
  ...lista("Polônia", "Ekstraklasa", ["Legia Varsóvia", "Lech Poznań"]),
  ...lista("Dinamarca", "Superliga", ["Copenhagen", "Brøndby", "Midtjylland"]),
  ...lista("Suécia", "Allsvenskan", ["Malmö", "AIK", "Hammarby"]),
  ...lista("Noruega", "Eliteserien", ["Bodø/Glimt", "Rosenborg", "Molde"]),
  ...lista("Ucrânia", "Premier League", ["Shakhtar Donetsk", "Dínamo de Kiev"]),
  ...lista("Arábia Saudita", "Saudi Pro League", ["Al Hilal", "Al Nassr", "Al Ittihad", "Al Ahli"]),
  ...lista("Catar", "Stars League", ["Al Sadd", "Al Duhail", "Al Rayyan"]),
  ...lista("Emirados Árabes", "UAE Pro League", ["Al Ain", "Al Nassr Dubai", "Shabab Al Ahli"]),
  ...lista("Egito", "Premier League", ["Al Ahly", "Zamalek", "Pyramids"]),
  ...lista("Marrocos", "Botola", ["Wydad", "Raja Casablanca", "ASFAR"]),
  ...lista("Tunísia", "Ligue 1", ["Espérance", "Club Africain", "Étoile du Sahel"]),
  ...lista("África do Sul", "Premiership", ["Mamelodi Sundowns", "Kaizer Chiefs", "Orlando Pirates"]),
  ...lista("Japão", "J1 League", ["Urawa Red Diamonds", "Kashima Antlers", "Yokohama F. Marinos", "Kawasaki Frontale", "Vissel Kobe", "Sanfrecce Hiroshima"]),
  ...lista("Coreia do Sul", "K League", ["Ulsan HD", "Jeonbuk", "FC Seoul", "Pohang Steelers"]),
  ...lista("China", "Super League", ["Shanghai Port", "Shanghai Shenhua", "Beijing Guoan"]),
  ...lista("Austrália", "A-League", ["Melbourne Victory", "Sydney FC", "Melbourne City", "Western Sydney"]),
  ...lista("Índia", "Indian Super League", ["Mumbai City", "Mohun Bagan", "Bengaluru"]),
  ...lista("Costa Rica", "Primera División", ["Saprissa", "Alajuelense", "Herediano"]),
  ...lista("Honduras", "Liga Nacional", ["Olimpia", "Motagua"])
];

const BANDEIRAS = {
  "Brasil": "🇧🇷",
  "Argentina": "🇦🇷",
  "Uruguai": "🇺🇾",
  "Chile": "🇨🇱",
  "Colômbia": "🇨🇴",
  "Equador": "🇪🇨",
  "Paraguai": "🇵🇾",
  "Peru": "🇵🇪",
  "Bolívia": "🇧🇴",
  "Venezuela": "🇻🇪",
  "México": "🇲🇽",
  "Estados Unidos": "🇺🇸",
  "Canadá": "🇨🇦",
  "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Espanha": "🇪🇸",
  "Itália": "🇮🇹",
  "Alemanha": "🇩🇪",
  "França": "🇫🇷",
  "Portugal": "🇵🇹",
  "Países Baixos": "🇳🇱",
  "Bélgica": "🇧🇪",
  "Turquia": "🇹🇷",
  "Grécia": "🇬🇷",
  "Escócia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Áustria": "🇦🇹",
  "Suíça": "🇨🇭",
  "Croácia": "🇭🇷",
  "Sérvia": "🇷🇸",
  "República Tcheca": "🇨🇿",
  "Polônia": "🇵🇱",
  "Dinamarca": "🇩🇰",
  "Suécia": "🇸🇪",
  "Noruega": "🇳🇴",
  "Ucrânia": "🇺🇦",
  "Arábia Saudita": "🇸🇦",
  "Catar": "🇶🇦",
  "Emirados Árabes": "🇦🇪",
  "Egito": "🇪🇬",
  "Marrocos": "🇲🇦",
  "Tunísia": "🇹🇳",
  "África do Sul": "🇿🇦",
  "Japão": "🇯🇵",
  "Coreia do Sul": "🇰🇷",
  "China": "🇨🇳",
  "Austrália": "🇦🇺",
  "Índia": "🇮🇳",
  "Costa Rica": "🇨🇷",
  "Honduras": "🇭🇳"
};

// Clubes cadastrados pelo administrador (RF27). Ficam no banco e são registrados aqui ao iniciar.
let EXTRAS = [];

function definirExtras(lista) {
  EXTRAS = (lista || []).filter((c) => c && c.nome && c.pais).map((c) => ({
    pais: c.pais, liga: c.liga || "Cadastro manual", nome: c.nome, sigla: c.sigla || "", extra: true
  }));
}

function todos() {
  return EXTRAS.length ? CLUBES.concat(EXTRAS) : CLUBES;
}

function paises() {
  const visto = [];
  for (const c of todos()) {
    if (!visto.includes(c.pais)) visto.push(c.pais);
  }
  return visto.map((pais) => ({
    pais,
    bandeira: BANDEIRAS[pais] || "🏳️",
    qtd: todos().filter((c) => c.pais === pais).length
  }));
}

function clubePorNome(nome) {
  return todos().find((c) => c.nome === nome) || null;
}

function clubesDoPais(pais) {
  if (!pais) return todos().slice();
  return todos().filter((c) => c.pais === pais);
}

function buscarClubes(q, pais) {
  let lista = pais ? clubesDoPais(pais) : todos().slice();
  const n = String(q || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!n) return lista;
  return lista.filter((c) => {
    const t = (c.nome + " " + c.liga + " " + c.pais).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes(n);
  });
}

module.exports = { CLUBES, BANDEIRAS, paises, clubePorNome, clubesDoPais, buscarClubes, definirExtras };
