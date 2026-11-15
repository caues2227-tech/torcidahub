<?php
/**
 * Bridge PHP das APIs Torcida no Hostinger (sem Node).
 * Usa ESPN + escudos CDN + store local.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
header("Access-Control-Allow-Origin: *");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Torcida-Time, X-Torcida-Feed, X-Torcida-Nome, X-Torcida-Cliente");
  http_response_code(204);
  exit;
}

function ok($corpo, $code = 200) {
  http_response_code($code);
  echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function baixar_json($url, $timeout = 10) {
  if (!function_exists("curl_init")) return null;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => $timeout,
    CURLOPT_USERAGENT => "TorcidaLive/1.0",
    CURLOPT_SSL_VERIFYPEER => true
  ]);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($body === false || $code >= 400) return null;
  $j = json_decode($body, true);
  return is_array($j) ? $j : null;
}

function header_time() {
  $t = $_SERVER["HTTP_X_TORCIDA_TIME"] ?? "";
  if ($t === "" && !empty($_GET["time"])) $t = (string) $_GET["time"];
  $t = rawurldecode($t);
  return $t !== "" ? $t : "Santos";
}

function hoje_sp() {
  $tz = new DateTimeZone("America/Sao_Paulo");
  return (new DateTime("now", $tz))->format("Y-m-d");
}

function add_dias($ymd, $n) {
  $d = DateTime::createFromFormat("Y-m-d", $ymd, new DateTimeZone("America/Sao_Paulo"));
  if (!$d) $d = new DateTime("now", new DateTimeZone("America/Sao_Paulo"));
  $d->modify(($n >= 0 ? "+" : "") . (int) $n . " day");
  return $d->format("Y-m-d");
}

function crest_map() {
  return [
    "Flamengo" => 819, "Palmeiras" => 2029, "Corinthians" => 874, "São Paulo" => 2026,
    "Santos" => 2674, "Fluminense" => 3445, "Botafogo" => 6086, "Vasco" => 3454,
    "Grêmio" => 6273, "Internacional" => 1936, "Atlético-MG" => 7632, "Cruzeiro" => 2022,
    "Bahia" => 9967, "Vitória" => 3457, "Athletico-PR" => 3458, "Fortaleza" => 6272,
    "Bragantino" => 6079, "Mirassol" => 9169, "Cuiabá" => 17313, "Juventude" => 6270,
    "Real Madrid" => 86, "Barcelona" => 83, "PSG" => 160, "Manchester City" => 382,
    "Manchester United" => 360, "Liverpool" => 364, "Chelsea" => 363, "Arsenal" => 359,
    "Bayern Munich" => 132, "Juventus" => 111, "Inter Milan" => 110, "AC Milan" => 103,
    "Borussia Dortmund" => 124, "Atlético Madrid" => 1068, "Tottenham" => 367,
    "Napoli" => 114, "Ajax" => 139, "Benfica" => 1929, "Porto" => 437
  ];
}

function crest($nome) {
  $map = crest_map();
  if (isset($map[$nome])) return "https://a.espncdn.com/i/teamlogos/soccer/500/" . $map[$nome] . ".png";
  $n = mb_strtolower($nome);
  foreach ($map as $k => $id) {
    if (mb_stripos($n, mb_strtolower($k)) !== false || mb_stripos(mb_strtolower($k), $n) !== false) {
      return "https://a.espncdn.com/i/teamlogos/soccer/500/" . $id . ".png";
    }
  }
  return "";
}

function nome_bate($a, $b) {
  $norm = function ($s) {
    $s = mb_strtolower(trim((string) $s));
    $s = iconv("UTF-8", "ASCII//TRANSLIT//IGNORE", $s) ?: $s;
    return preg_replace('/[^a-z0-9]+/', "", $s);
  };
  $x = $norm($a); $y = $norm($b);
  if ($x === "" || $y === "") return false;
  if ($x === $y || strpos($x, $y) !== false || strpos($y, $x) !== false) return true;
  /* aliases comuns */
  $alias = function ($n) {
    if (strpos($n, "atleticomg") !== false || strpos($n, "atleticomineiro") !== false || $n === "galo" || $n === "cam") return "atleticomg";
    if (strpos($n, "athleticopr") !== false || strpos($n, "athleticoparanaense") !== false) return "athleticopr";
    if (strpos($n, "vasco") !== false) return "vasco";
    if (strpos($n, "bragantino") !== false) return "bragantino";
    return $n;
  };
  return $alias($x) === $alias($y);
}

function status_espn($state) {
  $s = strtoupper((string) $state);
  if ($s === "IN") return "ao vivo";
  if ($s === "POST") return "encerrado";
  return "agendado";
}

function evento_jogo($ev, $timeUser) {
  $comp = $ev["competitions"][0] ?? [];
  $comps = $comp["competitors"] ?? [];
  $home = null; $away = null;
  foreach ($comps as $c) {
    if (($c["homeAway"] ?? "") === "home") $home = $c;
    if (($c["homeAway"] ?? "") === "away") $away = $c;
  }
  $state = $ev["status"]["type"]["state"] ?? "";
  $mandante = $home["team"]["displayName"] ?? "A definir";
  $visitante = $away["team"]["displayName"] ?? "A definir";
  $logoCasa = $home["team"]["logo"] ?? crest($mandante);
  $logoFora = $away["team"]["logo"] ?? crest($visitante);
  $dataIso = $ev["date"] ?? "";
  $tz = new DateTimeZone("America/Sao_Paulo");
  $data = $dataIso ? (new DateTime($dataIso))->setTimezone($tz)->format("Y-m-d") : hoje_sp();
  $horario = $dataIso ? (new DateTime($dataIso))->setTimezone($tz)->format("H:i") : "";
  $scoreCasa = isset($home["score"]) ? (is_array($home["score"]) ? ($home["score"]["value"] ?? null) : $home["score"]) : null;
  $scoreFora = isset($away["score"]) ? (is_array($away["score"]) ? ($away["score"]["value"] ?? null) : $away["score"]) : null;
  $quente = nome_bate($mandante, $timeUser) || nome_bate($visitante, $timeUser);
  return [
    "idJogo" => (string) ($ev["id"] ?? ""),
    "espnId" => (string) ($ev["id"] ?? ""),
    "mandante" => $mandante,
    "visitante" => $visitante,
    "escudoCasa" => $logoCasa,
    "escudoFora" => $logoFora,
    "escudoMandante" => $logoCasa,
    "escudoVisitante" => $logoFora,
    "data" => $data,
    "horario" => $horario,
    "status" => status_espn($state),
    "placarMandante" => strtoupper($state) === "PRE" ? null : ($scoreCasa !== null ? (int) $scoreCasa : null),
    "placarVisitante" => strtoupper($state) === "PRE" ? null : ($scoreFora !== null ? (int) $scoreFora : null),
    "minuto" => $ev["status"]["type"]["shortDetail"] ?? "",
    "quente" => $quente,
    "competicao" => $ev["league"]["name"] ?? "Brasileirão",
    "grupo" => "bra1",
    "local" => $comp["venue"]["fullName"] ?? ""
  ];
}

function scoreboard($ymd, $liga = "bra.1") {
  $url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/scoreboard?dates=" . str_replace("-", "", $ymd) . "&limit=100";
  $data = baixar_json($url);
  return $data["events"] ?? [];
}

function tabela_bra() {
  $data = baixar_json("https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings");
  if (!$data) return [];
  $entries = [];
  foreach (($data["children"] ?? []) as $ch) {
    foreach (($ch["standings"]["entries"] ?? []) as $en) $entries[] = $en;
  }
  if (!$entries && !empty($data["standings"]["entries"])) $entries = $data["standings"]["entries"];
  $out = [];
  foreach ($entries as $en) {
    $stats = [];
    foreach (($en["stats"] ?? []) as $s) $stats[$s["name"] ?? $s["abbreviation"] ?? ""] = $s["value"] ?? null;
    $nome = $en["team"]["displayName"] ?? $en["team"]["name"] ?? "";
    if ($nome === "") continue;
    $out[] = [
      "time" => $nome,
      "posicao" => isset($stats["rank"]) ? (int) $stats["rank"] : null,
      "pontos" => isset($stats["points"]) ? (int) $stats["points"] : null,
      "jogos" => isset($stats["gamesPlayed"]) ? (int) $stats["gamesPlayed"] : null,
      "vitorias" => isset($stats["wins"]) ? (int) $stats["wins"] : null,
      "empates" => isset($stats["ties"]) ? (int) $stats["ties"] : null,
      "derrotas" => isset($stats["losses"]) ? (int) $stats["losses"] : null,
      "saldo" => isset($stats["pointDifferential"]) ? (int) $stats["pointDifferential"] : null,
      "escudo" => ($en["team"]["logos"][0]["href"] ?? null) ?: crest($nome)
    ];
  }
  usort($out, function ($a, $b) { return ($a["posicao"] ?? 99) <=> ($b["posicao"] ?? 99); });
  return $out;
}

function clubes_lista() {
  $cores = [
    "Flamengo" => "#e0442f", "Palmeiras" => "#006437", "Corinthians" => "#1a1a1a",
    "São Paulo" => "#c41e3a", "Santos" => "#1e90ff", "Fluminense" => "#006437",
    "Botafogo" => "#1a1a1a", "Vasco" => "#1a1a1a", "Grêmio" => "#1e3a6e",
    "Internacional" => "#c41e3a", "Atlético-MG" => "#1a1a1a", "Cruzeiro" => "#1e5aa8",
    "Bahia" => "#1e3a6e", "Real Madrid" => "#ffffff", "Barcelona" => "#a50044",
    "PSG" => "#004170", "Manchester City" => "#6cabdd", "Liverpool" => "#c8102e",
    "Bayern Munich" => "#dc052d", "Juventus" => "#1a1a1a", "Arsenal" => "#ef0107",
    "Chelsea" => "#034694", "Manchester United" => "#da291c"
  ];
  $out = [];
  foreach (crest_map() as $nome => $id) {
    $out[] = [
      "nome" => $nome,
      "escudo" => "https://a.espncdn.com/i/teamlogos/soccer/500/" . $id . ".png",
      "pais" => in_array($nome, ["Flamengo","Palmeiras","Corinthians","São Paulo","Santos","Fluminense","Botafogo","Vasco","Grêmio","Internacional","Atlético-MG","Cruzeiro","Bahia","Vitória","Athletico-PR","Fortaleza","Bragantino","Mirassol","Cuiabá","Juventude"], true) ? "Brasil" : "Europa",
      "cor" => $cores[$nome] ?? "#1e90ff"
    ];
  }
  return $out;
}

function tema_clube($time) {
  $lista = clubes_lista();
  $achou = null;
  foreach ($lista as $c) {
    if (nome_bate($c["nome"], $time)) { $achou = $c; break; }
  }
  $accent = $achou["cor"] ?? "#1e90ff";
  return [
    "time" => $achou["nome"] ?? $time,
    "escudo" => $achou["escudo"] ?? crest($time),
    "cores" => ["accent" => $accent, "accentText" => "#ffffff"],
    "tema" => ["cores" => ["accent" => $accent]]
  ];
}

$path = parse_url($_SERVER["REQUEST_URI"] ?? "", PHP_URL_PATH);
$path = rawurldecode((string) $path);
$acao = $_GET["acao"] ?? "";
if (preg_match('#/api/(portal|hoje|agenda|tabela|tema|clubes|times|paises|busca|noticias|onboarding|jogo|coracao|avatares|resumo|feed|gnews)/?$#', $path, $m)) {
  $acao = $m[1];
}
if ($acao === "") ok(["erro" => "Rota não encontrada.", "codigo" => "nao_encontrado"], 404);

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$timeUser = header_time();

if ($acao === "paises") {
  ok(["paises" => ["Brasil", "Espanha", "Inglaterra", "França", "Alemanha", "Itália", "Portugal", "Holanda"]]);
}

if ($acao === "times" || $acao === "clubes") {
  $lista = clubes_lista();
  $pais = $_GET["pais"] ?? "";
  if ($pais !== "") {
    $lista = array_values(array_filter($lista, function ($c) use ($pais) {
      return mb_stripos($c["pais"], $pais) !== false || $pais === "Brasil" && $c["pais"] === "Brasil";
    }));
  }
  $q = trim((string) ($_GET["q"] ?? ""));
  if ($q !== "") {
    $lista = array_values(array_filter($lista, function ($c) use ($q) {
      return mb_stripos($c["nome"], $q) !== false;
    }));
  }
  ok(["clubes" => $lista, "times" => array_map(function ($c) { return $c["nome"]; }, $lista)]);
}

if ($acao === "tema") {
  ok(tema_clube($_GET["time"] ?? $timeUser));
}

if ($acao === "tabela") {
  ok(["tabela" => tabela_bra(), "via" => "espn-php"]);
}

if ($acao === "proximo") {
  $hoje = hoje_sp();
  $alvo = $_GET["time"] ?? $timeUser;
  /* Busca paralela dos próximos 25 dias (evita timeout do Hostinger) */
  $urls = [];
  for ($i = 0; $i < 25; $i++) {
    $d = add_dias($hoje, $i);
    $urls[$d] = "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=" . str_replace("-", "", $d) . "&limit=80";
  }
  $mh = curl_multi_init();
  $chs = [];
  foreach ($urls as $d => $url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => 10,
      CURLOPT_USERAGENT => "TorcidaLive/1.1",
      CURLOPT_SSL_VERIFYPEER => false,
      CURLOPT_ENCODING => ""
    ]);
    curl_multi_add_handle($mh, $ch);
    $chs[$d] = $ch;
  }
  $running = null;
  do {
    curl_multi_exec($mh, $running);
    if ($running) curl_multi_select($mh, 1.0);
  } while ($running > 0);

  $achou = null;
  $diaAchou = null;
  ksort($chs);
  foreach ($chs as $d => $ch) {
    $body = curl_multi_getcontent($ch);
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
    if ($achou || !$body) continue;
    $data = json_decode($body, true);
    foreach (($data["events"] ?? []) as $ev) {
      $j = evento_jogo($ev, $alvo);
      if (!nome_bate($j["mandante"], $alvo) && !nome_bate($j["visitante"], $alvo)) continue;
      if ($j["status"] === "encerrado") continue;
      $achou = $j;
      $diaAchou = $d;
      break;
    }
  }
  curl_multi_close($mh);

  if ($achou) {
    ok([
      "jogo" => $achou,
      "dia" => date("d/m", strtotime($diaAchou)),
      "data" => $diaAchou,
      "via" => "espn-php"
    ]);
  }
  ok(["jogo" => null, "erro" => "Sem próximo jogo na janela", "via" => "espn-php"]);
}

if ($acao === "hoje") {
  $hoje = hoje_sp();
  $evs = scoreboard($hoje);
  $jogos = array_map(function ($ev) use ($timeUser) { return evento_jogo($ev, $timeUser); }, $evs);
  ok([
    "data" => $hoje,
    "jogos" => $jogos,
    "jogosHoje" => $jogos,
    "aoVivo" => count(array_filter($jogos, function ($j) { return $j["status"] === "ao vivo"; })),
    "via" => "espn-php"
  ]);
}

if ($acao === "agenda") {
  $hoje = hoje_sp();
  $dias = [];
  for ($i = 0; $i < 25; $i++) {
    $d = add_dias($hoje, $i);
    $evs = scoreboard($d);
    $jogos = array_map(function ($ev) use ($timeUser) { return evento_jogo($ev, $timeUser); }, $evs);
    if ($jogos) $dias[] = ["data" => $d, "jogos" => $jogos];
  }
  $qtd = 0;
  foreach ($dias as $d) $qtd += count($d["jogos"]);
  ok([
    "dataHoje" => $hoje,
    "atualizadoEm" => date("c"),
    "time" => $timeUser,
    "grupos" => [["id" => "bra1", "nome" => "Brasileirão", "qtd" => $qtd]],
    "dias" => $dias,
    "via" => "espn-php"
  ]);
}

if ($acao === "portal") {
  $hoje = hoje_sp();
  $evsHoje = scoreboard($hoje);
  $jogosHoje = array_map(function ($ev) use ($timeUser) { return evento_jogo($ev, $timeUser); }, $evsHoje);
  $proximos = [];
  for ($i = 0; $i < 7 && count($proximos) < 10; $i++) {
    $d = add_dias($hoje, $i);
    foreach (scoreboard($d) as $ev) {
      $j = evento_jogo($ev, $timeUser);
      if ($j["status"] === "encerrado") continue;
      $proximos[] = $j;
    }
  }
  $tabela = tabela_bra();
  $linha = null;
  foreach ($tabela as $l) {
    if (nome_bate($l["time"], $timeUser)) { $linha = $l; break; }
  }
  $proxClube = null;
  foreach ($proximos as $j) {
    if ($j["quente"]) { $proxClube = $j; break; }
  }
  $tema = tema_clube($timeUser);
  ok([
    "data" => $hoje,
    "atualizadoEm" => date("c"),
    "aoVivo" => count(array_filter($jogosHoje, function ($j) { return $j["status"] === "ao vivo"; })),
    "jogosHoje" => $jogosHoje,
    "extra" => [],
    "proximos" => array_slice($proximos, 0, 8),
    "tabela" => $tabela,
    "meta" => ["fonte" => "ESPN", "via" => "php"],
    "noticiasMeta" => [],
    "noticias" => ["jogo" => [], "mercado" => []],
    "manchete" => null,
    "resumo" => null,
    "clube" => [
      "nome" => $timeUser,
      "escudo" => crest($timeUser),
      "tabela" => $linha,
      "proximo" => $proxClube,
      "ultimos" => []
    ],
    "tema" => $tema
  ]);
}

if ($acao === "jogo") {
  $id = (string) ($_GET["id"] ?? "");
  $hoje = hoje_sp();
  $achou = null;
  for ($i = -2; $i <= 7; $i++) {
    foreach (scoreboard(add_dias($hoje, $i)) as $ev) {
      if ((string) ($ev["id"] ?? "") === $id) {
        $achou = evento_jogo($ev, $timeUser);
        break 2;
      }
    }
  }
  if (!$achou) ok(["erro" => "Jogo não encontrado.", "codigo" => "nao_encontrado"], 404);
  ok(["jogo" => $achou, "via" => "espn-php"]);
}

if ($acao === "coracao") {
  $time = $_GET["time"] ?? $timeUser;
  $tabela = tabela_bra();
  $linha = null;
  foreach ($tabela as $l) {
    if (nome_bate($l["time"], $time)) { $linha = $l; break; }
  }
  ok([
    "time" => $time,
    "escudo" => crest($time),
    "tabela" => $linha,
    "tema" => tema_clube($time),
    "via" => "espn-php"
  ]);
}

if ($acao === "avatares") {
  $time = $_GET["time"] ?? $timeUser;
  $esc = crest($time);
  ok([
    "avatares" => [
      ["id" => "crest", "url" => $esc, "nome" => "Escudo"],
      ["id" => "inicial", "url" => "", "nome" => "Inicial"]
    ]
  ]);
}

if ($acao === "onboarding" && $method === "POST") {
  $raw = file_get_contents("php://input");
  $b = $raw ? json_decode($raw, true) : [];
  $time = trim((string) ($b["time"] ?? $b["clube"] ?? $timeUser)) ?: "Santos";
  $feed = trim((string) ($b["feedTime"] ?? $time)) ?: $time;
  $nome = trim((string) ($b["nome"] ?? "")) ?: "Torcedor";
  $tema = tema_clube($time);
  /* registra voto no ranking real (pasta persistente) */
  require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
  $store = torcida_store_dir();
  $votosFile = $store . DIRECTORY_SEPARATOR . "votos.json";
  $cid = $_SERVER["HTTP_X_TORCIDA_CLIENTE"] ?? "";
  $cid = preg_replace('/[^a-zA-Z0-9_\-.]/', "", $cid);
  if ($cid === "") $cid = "ip_" . substr(hash("sha256", $_SERVER["REMOTE_ADDR"] ?? "0"), 0, 16);
  $votos = ["votos" => []];
  if (is_file($votosFile)) {
    $j = json_decode(@file_get_contents($votosFile), true);
    if (is_array($j) && isset($j["votos"])) $votos = $j;
  }
  $votos["votos"][$cid] = ["time" => $time, "em" => date("c")];
  @file_put_contents($votosFile, json_encode($votos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);

  ok([
    "ok" => true,
    "token" => bin2hex(random_bytes(16)),
    "id" => "v_" . substr($cid, 0, 12),
    "nome" => $nome,
    "usuario" => "",
    "foto" => crest($time),
    "time" => $time,
    "feedTime" => $feed,
    "pais" => "Brasil",
    "papel" => "torcedor",
    "convidado" => true,
    "tema" => $tema
  ]);
}

if ($acao === "resumo") {
  $tabela = tabela_bra();
  $linha = null;
  foreach ($tabela as $l) {
    if (nome_bate($l["time"], $timeUser)) { $linha = $l; break; }
  }
  ok([
    "time" => $timeUser,
    "tabela" => $linha,
    "texto" => $linha
      ? ($linha["time"] . " está em " . $linha["posicao"] . "º com " . $linha["pontos"] . " pontos.")
      : ("Acompanhe o " . $timeUser . " ao vivo na Torcida.")
  ]);
}

if ($acao === "busca") {
  $q = trim((string) ($_GET["q"] ?? ""));
  $clubes = [];
  if ($q !== "") {
    foreach (clubes_lista() as $c) {
      if (mb_stripos($c["nome"], $q) !== false) $clubes[] = $c;
    }
  }
  ok(["q" => $q, "clubes" => array_slice($clubes, 0, 8), "noticias" => [], "jogos" => []]);
}

if ($acao === "noticias" || $acao === "gnews" || $acao === "feed") {
  /* Delega à lógica de noticias.php via include HTTP local seria lento — reusa ESPN direto */
  $arts = [];
  foreach (["bra.1", "esp.1", "eng.1", "usa.1", "fra.1"] as $liga) {
    $data = baixar_json("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/news");
    foreach (($data["articles"] ?? []) as $a) {
      $img = $a["images"][0]["url"] ?? null;
      if (!$img) continue;
      $title = trim((string) ($a["headline"] ?? ""));
      if ($title === "") continue;
      $desc = trim((string) ($a["description"] ?? ""));
      if ($desc === $title) $desc = "";
      $arts[] = [
        "id" => $a["id"] ?? (count($arts) + 1),
        "titulo" => $title,
        "title" => $title,
        "resumo" => $desc,
        "description" => $desc,
        "texto" => $desc,
        "url" => $a["links"]["web"]["href"] ?? "#",
        "imagem" => $img,
        "image" => $img,
        "publicadoEm" => $a["published"] ?? date("c"),
        "publishedAt" => $a["published"] ?? date("c"),
        "fonteNome" => $a["byline"] ?? "ESPN",
        "fonte" => $a["byline"] ?? "ESPN",
        "source" => $a["byline"] ?? "ESPN",
        "quando" => ""
      ];
    }
  }
  $limite = isset($_GET["limite"]) ? max(5, min(50, (int) $_GET["limite"])) : (isset($_GET["max"]) ? (int) $_GET["max"] : 24);
  $arts = array_slice($arts, 0, $limite);
  ok([
    "noticias" => $arts,
    "articles" => $arts,
    "total" => count($arts),
    "via" => "espn-php"
  ]);
}

ok(["erro" => "Método não permitido.", "codigo" => "metodo"], 405);
