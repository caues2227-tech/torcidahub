// Dois tipos de identificação de clube, ambos conferidos (os que existiam antes eram escritos de memória e estavam
// trocados: o id 129 da API-Football era o Ceará, não o Internacional, e o escudo saía errado).
//
// 1) IDS: id do clube na API-Football, usado para consultar elenco, técnico e agenda. Só os clubes brasileiros estão
//    aqui, conferidos na própria API (/teams?league=71 e 72). Os demais não têm id fixo: o servidor pesquisa o clube
//    pelo nome na primeira vez e guarda o resultado (db.afIds), em vez de arriscar um id errado.
// 2) ESPN: id do clube na ESPN, de onde vem o escudo (escudos-espn.js). Foi achado pela busca da própria ESPN pelo
//    nome do clube, descartando times de base e femininos.
const ESPN = require("./escudos-espn");
const ESPN_PAIS = { "Olimpia|Honduras": 884 }; // nomes repetidos entre países

const IDS = {
  Palmeiras: 121, Flamengo: 127, "Athletico-PR": 134, Fluminense: 124, Cruzeiro: 135,
  Bahia: 118, Bragantino: 794, Coritiba: 147, "Atlético-MG": 1062, Corinthians: 131,
  Botafogo: 120, Vitória: 136, "São Paulo": 126, Santos: 128, Grêmio: 130,
  Internacional: 119, Mirassol: 7848, Vasco: 133, Chapecoense: 132,
  Fortaleza: 154, Ceará: 129, Sport: 123,
  Paysandu: 149, Goiás: 151, "Atlético-GO": 144, Cuiabá: 1193, "América-MG": 125,
  Juventude: 152, Criciúma: 140, Avaí: 145, "Ponte Preta": 139,
  Guarani: 138, CRB: 146, "Operário-PR": 1223,
  Novorizontino: 7834, Amazonas: 10862, "Vila Nova": 142
};

const CORES = {
  Palmeiras: "#006437", Flamengo: "#e30613", "Athletico-PR": "#c8102e", Fluminense: "#7a003c",
  Cruzeiro: "#2b4c9b", Bahia: "#0066b3", Bragantino: "#d4a017", Coritiba: "#1a7a3a",
  "Atlético-MG": "#c5a028", Corinthians: "#f4f1ea", Botafogo: "#f4f1ea", Vitória: "#c8102e",
  "São Paulo": "#c41e3a", Santos: "#1e90ff", Grêmio: "#0d4ea6", Internacional: "#e30613",
  Mirassol: "#e8b923", Remo: "#1f4d2a", Vasco: "#c8102e", Chapecoense: "#1a7a3a",
  Fortaleza: "#c8102e", Ceará: "#1a1a1a", Sport: "#c8102e", Náutico: "#c8102e",
  "Santa Cruz": "#c8102e", Paysandu: "#1a7a3a", Goiás: "#1a7a3a", "Atlético-GO": "#c8102e",
  Cuiabá: "#e8b923", "América-MG": "#1a7a3a", Juventude: "#1a7a3a", Criciúma: "#e8b923",
  Avaí: "#1e6bb8", Figueirense: "#1a1a1a", "Ponte Preta": "#f4f1ea", Guarani: "#1a7a3a",
  Portuguesa: "#c8102e", CRB: "#c8102e", CSA: "#1e6bb8", "Operário-PR": "#1a1a1a",
  Novorizontino: "#e8b923", Amazonas: "#cf7a12",
  "River Plate": "#e30613", "Boca Juniors": "#003b8e", Racing: "#1e6bb8", Independiente: "#c8102e",
  "San Lorenzo": "#1a1a1a", Estudiantes: "#c8102e", Lanús: "#5c1a1a", Vélez: "#f4f1ea",
  "Rosario Central": "#1e6bb8", "Newell's": "#c8102e", "Argentinos Juniors": "#c8102e", Talleres: "#1e6bb8",
  Huracán: "#f4f1ea", Banfield: "#1a7a3a", Gimnasia: "#f4f1ea",
  Nacional: "#1e6bb8", Peñarol: "#e8b923", "Defensor Sporting": "#4a2c82", Danubio: "#1a1a1a",
  "Colo-Colo": "#f4f1ea", "Universidad de Chile": "#1e6bb8", "Universidad Católica": "#f4f1ea", Palestino: "#c8102e",
  "Atlético Nacional": "#1a7a3a", Millonarios: "#1e6bb8", "América de Cali": "#c8102e", "Deportivo Cali": "#1a7a3a", Junior: "#c8102e",
  "Barcelona SC": "#e8b923", "Independiente del Valle": "#1a1a1a", "LDU Quito": "#f4f1ea", Emelec: "#1e6bb8",
  Olimpia: "#f4f1ea", "Cerro Porteño": "#c8102e", Libertad: "#1a1a1a", Guaraní: "#1a7a3a",
  Universitario: "#c41e3a", "Alianza Lima": "#1e6bb8", "Sporting Cristal": "#3db5e6",
  Bolívar: "#1e6bb8", "The Strongest": "#e8b923", "Always Ready": "#c8102e",
  Caracas: "#c8102e", "Deportivo Táchira": "#e8b923", Zamora: "#1a1a1a",
  América: "#e8b923", Guadalajara: "#c8102e", "Cruz Azul": "#1e6bb8", Monterrey: "#1e6bb8",
  Tigres: "#e8b923", Pumas: "#1a1a1a", "Santos Laguna": "#1a7a3a", Toluca: "#c8102e",
  Pachuca: "#1e6bb8", León: "#1a7a3a", Tijuana: "#c8102e", Necaxa: "#c8102e",
  "Inter Miami": "#f7b5c8", LAFC: "#1a1a1a", "LA Galaxy": "#e8b923", "New York City": "#6fb8e8",
  "Atlanta United": "#c8102e", "Seattle Sounders": "#5ee2b5", "Austin FC": "#1a7a3a",
  "Columbus Crew": "#e8b923", "Philadelphia Union": "#1e3a5f", "FC Cincinnati": "#3c2a7a",
  "CF Montréal": "#1e6bb8", "Toronto FC": "#c8102e", "Vancouver Whitecaps": "#f4f1ea",
  Arsenal: "#ef0107", Chelsea: "#034694", Liverpool: "#c8102e", "Manchester City": "#6cabdd",
  "Manchester United": "#da291c", Tottenham: "#132257", Newcastle: "#1a1a1a", "Aston Villa": "#670e36",
  "West Ham": "#7a263a", Brighton: "#0057b8", "Crystal Palace": "#1b458f", Everton: "#003399",
  "Nottingham Forest": "#e53233", Wolves: "#fdb913", Fulham: "#f4f1ea", Brentford: "#e30613",
  Bournemouth: "#da291c", Leicester: "#003090", Leeds: "#f4f1ea", Southampton: "#d71920",
  "Real Madrid": "#f4f1ea", Barcelona: "#a50044", "Atlético de Madrid": "#c8102e", Sevilla: "#f4f1ea",
  Valencia: "#ee3524", "Real Sociedad": "#0067b1", Villarreal: "#e8b923", "Athletic Bilbao": "#ee2523",
  "Real Betis": "#0b8a3e", Girona: "#c8102e", Osasuna: "#c8102e", "Celta de Vigo": "#8ac4e8",
  Mallorca: "#c8102e", "Rayo Vallecano": "#f4f1ea", Getafe: "#0057b8", Espanyol: "#1e6bb8",
  Alavés: "#1e6bb8", "Las Palmas": "#e8b923",
  Juventus: "#f4f1ea", Milan: "#ac001a", Inter: "#010e80", Napoli: "#12a0d7", Roma: "#8e1f2f",
  Lazio: "#87d8f7", Atalanta: "#1e3a8a", Fiorentina: "#4824a1", Bologna: "#1a1a1a", Torino: "#8b1e1e",
  Genoa: "#c8102e", Udinese: "#1a1a1a", Sassuolo: "#1a7a3a", Cagliari: "#c8102e", Lecce: "#e8b923", Parma: "#f4f1ea",
  "Bayern de Munique": "#dc052d", "Borussia Dortmund": "#fde100", "RB Leipzig": "#dd0741",
  "Bayer Leverkusen": "#e32221", "Eintracht Frankfurt": "#c8102e", Stuttgart: "#f4f1ea", Wolfsburg: "#65b32e",
  "Borussia Mönchengladbach": "#1a7a3a", "Union Berlin": "#c8102e", Freiburg: "#c8102e", Hoffenheim: "#1e6bb8",
  "Werder Bremen": "#1a7a3a", Mainz: "#c8102e", Köln: "#c8102e",
  PSG: "#004170", Marseille: "#2fa8e0", Lyon: "#d4001e", Monaco: "#c8102e", Lille: "#e1012d", Nice: "#c8102e",
  Rennes: "#c8102e", Lens: "#e8b923", Strasbourg: "#1e6bb8", Toulouse: "#4a2c82", Nantes: "#e8b923", Reims: "#c8102e",
  Benfica: "#ed1c24", Porto: "#003087", Sporting: "#008057", Braga: "#c8102e", "Vitória de Guimarães": "#f4f1ea",
  Boavista: "#1a1a1a", Famalicão: "#1e6bb8", Moreirense: "#1a7a3a", "Casa Pia": "#1a1a1a",
  Ajax: "#d2122e", PSV: "#e30613", Feyenoord: "#e30613", "AZ Alkmaar": "#c8102e", Twente: "#c8102e",
  "Club Brugge": "#1e3a8a", Anderlecht: "#4a2c82", Genk: "#1e6bb8", Antwerp: "#c8102e",
  Galatasaray: "#e8b923", Fenerbahçe: "#1e6bb8", Beşiktaş: "#1a1a1a", Trabzonspor: "#6fb8e8",
  Olympiacos: "#c8102e", Panathinaikos: "#1a7a3a", "AEK Atenas": "#e8b923", PAOK: "#1a1a1a",
  Celtic: "#1a7a3a", Rangers: "#1e6bb8", Aberdeen: "#c8102e", Hearts: "#8b1e1e",
  "Red Bull Salzburg": "#c8102e", "Rapid Viena": "#1a7a3a", "Sturm Graz": "#1a1a1a",
  "Young Boys": "#e8b923", Basel: "#c8102e", Zürich: "#1e6bb8",
  "Dinamo Zagreb": "#1e6bb8", "Hajduk Split": "#1e6bb8", Rijeka: "#1e6bb8",
  "Estrela Vermelha": "#c8102e", Partizan: "#1a1a1a",
  "Sparta Praga": "#c8102e", "Slavia Praga": "#c8102e", "Viktoria Plzeň": "#c8102e",
  "Legia Varsóvia": "#1a7a3a", "Lech Poznań": "#1e6bb8",
  Copenhagen: "#f4f1ea", Brøndby: "#e8b923", Midtjylland: "#1a1a1a",
  Malmö: "#1e6bb8", AIK: "#1a1a1a", Hammarby: "#1a7a3a",
  "Bodø/Glimt": "#e8b923", Rosenborg: "#1a1a1a", Molde: "#1e6bb8",
  "Shakhtar Donetsk": "#cf7a12", "Dínamo de Kiev": "#1e6bb8",
  "Al Hilal": "#1e6bb8", "Al Nassr": "#e8b923", "Al Ittihad": "#1a1a1a", "Al Ahli": "#1a7a3a",
  "Al Sadd": "#f4f1ea", "Al Duhail": "#c8102e", "Al Rayyan": "#c8102e",
  "Al Ain": "#4a2c82", "Al Nassr Dubai": "#1e6bb8", "Shabab Al Ahli": "#c8102e",
  "Al Ahly": "#c8102e", Zamalek: "#f4f1ea", Pyramids: "#1e6bb8",
  Wydad: "#c8102e", "Raja Casablanca": "#1a7a3a", ASFAR: "#1a7a3a",
  Espérance: "#e8b923", "Club Africain": "#c8102e", "Étoile du Sahel": "#c8102e",
  "Mamelodi Sundowns": "#e8b923", "Kaizer Chiefs": "#e8b923", "Orlando Pirates": "#1a1a1a",
  "Urawa Red Diamonds": "#c8102e", "Kashima Antlers": "#c8102e", "Yokohama F. Marinos": "#1e6bb8",
  "Kawasaki Frontale": "#1e6bb8", "Vissel Kobe": "#8b1e1e", "Sanfrecce Hiroshima": "#4a2c82",
  "Ulsan HD": "#1e6bb8", Jeonbuk: "#1a7a3a", "FC Seoul": "#c8102e", "Pohang Steelers": "#c8102e",
  "Shanghai Port": "#c8102e", "Shanghai Shenhua": "#1e6bb8", "Beijing Guoan": "#1a7a3a",
  "Melbourne Victory": "#1e6bb8", "Sydney FC": "#6fb8e8", "Melbourne City": "#6cabdd", "Western Sydney": "#1a1a1a",
  "Mumbai City": "#6fb8e8", "Mohun Bagan": "#1a7a3a", Bengaluru: "#1e6bb8",
  Saprissa: "#4a2c82", Alajuelense: "#1a1a1a", Herediano: "#e8b923", Motagua: "#1e6bb8"
};

function hexRgb(hex) {
  const n = String(hex || "#5ee2b5").replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16) || 94,
    g: parseInt(n.slice(2, 4), 16) || 226,
    b: parseInt(n.slice(4, 6), 16) || 181
  };
}

function corHash(nome) {
  const paleta = ["#c8102e", "#1e6bb8", "#1a7a3a", "#e8b923", "#4a2c82", "#cf7a12", "#0d4ea6", "#006437"];
  let h = 0;
  for (let i = 0; i < String(nome || "").length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return paleta[h % paleta.length];
}

// Contraste (WCAG) entre duas cores hexadecimais.
function luzRelativa(hex) {
  const { r, g, b } = hexRgb(hex);
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a, b) {
  const la = luzRelativa(a);
  const lb = luzRelativa(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function paraHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

// Mistura a cor com branco até ficar legível (contraste mínimo 4,5) sobre o fundo escuro do site.
function corLegivel(hex, fundo) {
  let atual = hex;
  for (let passo = 0; passo < 12 && contraste(atual, fundo) < 4.5; passo++) {
    const { r, g, b } = hexRgb(atual);
    atual = paraHex({ r: r + (255 - r) * 0.14, g: g + (255 - g) * 0.14, b: b + (255 - b) * 0.14 });
  }
  return atual;
}

const FUNDO_ESCURO = "#0b0b0d";
const TINTA_ESCURA = "#0e1116";
const TINTA_CLARA = "#f4f1ea";

function coresDoClube(nome) {
  const accent = CORES[nome] || corHash(nome);
  const { r, g, b } = hexRgb(accent);
  // texto sobre o destaque: escolhe a tinta (escura ou clara) com mais contraste, em vez de assumir branco
  const ink = contraste(accent, TINTA_ESCURA) >= contraste(accent, TINTA_CLARA) ? TINTA_ESCURA : TINTA_CLARA;
  return {
    accent,
    dim: `rgba(${r},${g},${b},.18)`,
    glow: `rgba(${r},${g},${b},.22)`,
    wash: `rgba(${r},${g},${b},.1)`,
    ink,
    // o destaque usado como COR DE TEXTO sobre fundo escuro (links, rótulos): clareado se precisar
    text: corLegivel(accent, FUNDO_ESCURO),
    line: `rgba(${r},${g},${b},.35)`
  };
}

function idDoClube(nome) {
  return IDS[nome] || 0;
}

function escudoSvg(nome, cores) {
  const c = cores || coresDoClube(nome);
  const letra = String(nome || "T").charAt(0).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "T");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".22"/><stop offset="100%" stop-color="#000000" stop-opacity=".18"/></linearGradient></defs>
    <path d="M32 4L56 14v20c0 16-11.5 27.5-24 31.5C19.5 61.5 8 50 8 34V14z" fill="${c.accent}"/>
    <path d="M32 4L56 14v20c0 16-11.5 27.5-24 31.5C19.5 61.5 8 50 8 34V14z" fill="url(#g)"/>
    <path d="M32 4L56 14v20c0 16-11.5 27.5-24 31.5C19.5 61.5 8 50 8 34V14z" fill="none" stroke="${c.ink}" stroke-width="2.2"/>
    <text x="32" y="40" text-anchor="middle" font-size="22" font-family="Georgia,serif" font-weight="700" fill="${c.ink}">${letra}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\s+/g, " ").trim());
}

function escudoDoClube(nome, pais) {
  const id = (pais && ESPN_PAIS[nome + "|" + pais]) || ESPN[nome];
  if (id) return "https://a.espncdn.com/i/teamlogos/soccer/500/" + id + ".png";
  return escudoSvg(nome, coresDoClube(nome));
}

function marcaDoClube(nome, pais) {
  const cores = coresDoClube(nome);
  return {
    logo: escudoDoClube(nome, pais),
    logoFall: escudoSvg(nome, cores),
    cores,
    idApiFootball: idDoClube(nome) || null
  };
}

module.exports = { IDS, CORES, coresDoClube, escudoDoClube, escudoSvg, marcaDoClube, idDoClube };
