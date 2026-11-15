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
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_ENCODING => ""
  ]);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($body === false || $code >= 400) return null;
  $j = json_decode($body, true);
  return is_array($j) ? $j : null;
}

/** Várias URLs JSON em paralelo. $urls = [chave => url]. */
function baixar_json_multi($urls, $timeout = 8) {
  $out = [];
  foreach ($urls as $k => $_) $out[$k] = null;
  if (!$urls || !function_exists("curl_multi_init")) {
    foreach ($urls as $k => $url) $out[$k] = baixar_json($url, $timeout);
    return $out;
  }
  $mh = curl_multi_init();
  $chs = [];
  foreach ($urls as $k => $url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_USERAGENT => "TorcidaLive/1.3",
      CURLOPT_SSL_VERIFYPEER => true,
      CURLOPT_ENCODING => ""
    ]);
    curl_multi_add_handle($mh, $ch);
    $chs[$k] = $ch;
  }
  $running = null;
  do {
    curl_multi_exec($mh, $running);
    if ($running) curl_multi_select($mh, 0.5);
  } while ($running > 0);
  foreach ($chs as $k => $ch) {
    $body = curl_multi_getcontent($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
    if ($body === false || $code >= 400) continue;
    $j = json_decode($body, true);
    if (is_array($j)) $out[$k] = $j;
  }
  curl_multi_close($mh);
  return $out;
}

function store_cache_get($nome, $ttlSec) {
  require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
  $f = torcida_store_dir() . DIRECTORY_SEPARATOR . $nome;
  if (!is_file($f) || (time() - filemtime($f)) >= $ttlSec) return null;
  $j = json_decode(@file_get_contents($f), true);
  return is_array($j) ? $j : null;
}

function store_cache_put($nome, $data) {
  require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
  $f = torcida_store_dir() . DIRECTORY_SEPARATOR . $nome;
  @file_put_contents($f, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function api_cache_headers($sec = 30) {
  header("Cache-Control: public, max-age=" . (int) $sec . ", s-maxage=" . (int) $sec, true);
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
    "Bahia" => 9967, "Vitória" => 3457, "Athletico-PR" => 3458, "Athletico Paranaense" => 3458,
    "CAP" => 3458, "Fortaleza" => 6272,
    "Bragantino" => 6079, "Mirassol" => 9169, "Cuiabá" => 17313, "Juventude" => 6270,
    "Real Madrid" => 86, "Barcelona" => 83, "PSG" => 160, "Manchester City" => 382,
    "Manchester United" => 360, "Liverpool" => 364, "Chelsea" => 363, "Arsenal" => 359,
    "Bayern Munich" => 132, "Juventus" => 111, "Inter Milan" => 110, "AC Milan" => 103,
    "Borussia Dortmund" => 124, "Atlético Madrid" => 1068, "Tottenham" => 367,
    "Napoli" => 114, "Ajax" => 139, "Benfica" => 1929, "Porto" => 437
  ];
}

function crest_id($nome) {
  $map = crest_map();
  if (isset($map[$nome])) return (int) $map[$nome];
  /* Aliases (Athletico Paranaense ↔ Athletico-PR, etc.) */
  foreach ($map as $k => $id) {
    if (nome_bate($k, $nome)) return (int) $id;
  }
  $n = mb_strtolower(trim((string) $nome));
  foreach ($map as $k => $id) {
    if (mb_stripos($n, mb_strtolower($k)) !== false || mb_stripos(mb_strtolower($k), $n) !== false) {
      return (int) $id;
    }
  }
  return null;
}

function crest($nome) {
  $id = crest_id($nome);
  return $id ? ("https://a.espncdn.com/i/teamlogos/soccer/500/" . $id . ".png") : "";
}

function espn_liga_time($nome) {
  static $europa = [
    "Real Madrid", "Barcelona", "PSG", "Manchester City", "Manchester United",
    "Liverpool", "Chelsea", "Arsenal", "Bayern Munich", "Juventus", "Inter Milan",
    "AC Milan", "Borussia Dortmund", "Atlético Madrid", "Tottenham", "Napoli",
    "Ajax", "Benfica", "Porto"
  ];
  foreach ($europa as $t) {
    if (nome_bate($t, $nome)) {
      if (nome_bate($nome, "Real Madrid") || nome_bate($nome, "Barcelona") || nome_bate($nome, "Atlético Madrid")) return "esp.1";
      if (nome_bate($nome, "PSG")) return "fra.1";
      if (nome_bate($nome, "Bayern") || nome_bate($nome, "Dortmund")) return "ger.1";
      if (nome_bate($nome, "Juventus") || nome_bate($nome, "Milan") || nome_bate($nome, "Napoli") || nome_bate($nome, "Inter")) return "ita.1";
      if (nome_bate($nome, "Ajax")) return "ned.1";
      if (nome_bate($nome, "Benfica") || nome_bate($nome, "Porto")) return "por.1";
      return "eng.1";
    }
  }
  return "bra.1";
}

/** Baixa vários scoreboards ESPN em paralelo. */
function scoreboards_multi($datas, $liga = "bra.1", $timeout = 10) {
  if (!function_exists("curl_multi_init")) {
    $out = [];
    foreach ($datas as $d) $out[$d] = scoreboard($d, $liga);
    return $out;
  }
  $mh = curl_multi_init();
  $chs = [];
  foreach ($datas as $d) {
    $url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/scoreboard?dates=" . str_replace("-", "", $d) . "&limit=100";
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_USERAGENT => "TorcidaLive/1.2",
      CURLOPT_SSL_VERIFYPEER => false,
      CURLOPT_ENCODING => ""
    ]);
    curl_multi_add_handle($mh, $ch);
    $chs[$d] = $ch;
  }
  $running = null;
  do {
    curl_multi_exec($mh, $running);
    if ($running) curl_multi_select($mh, 0.8);
  } while ($running > 0);
  $out = [];
  foreach ($chs as $d => $ch) {
    $body = curl_multi_getcontent($ch);
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
    $data = $body ? json_decode($body, true) : null;
    $out[$d] = is_array($data) ? ($data["events"] ?? []) : [];
  }
  curl_multi_close($mh);
  return $out;
}

function letra_resultado($j, $time) {
  $casa = nome_bate($j["mandante"], $time);
  $pc = (int) ($j["placarMandante"] ?? 0);
  $pf = (int) ($j["placarVisitante"] ?? 0);
  if ($pc === $pf) return "E";
  if ($casa) return $pc > $pf ? "V" : "D";
  return $pf > $pc ? "V" : "D";
}

function norm_nome_jogador($s) {
  $s = mb_strtolower(trim((string) $s));
  $s = iconv("UTF-8", "ASCII//TRANSLIT//IGNORE", $s) ?: $s;
  return preg_replace('/[^a-z0-9]+/', "", $s);
}

function avatar_data_uri($nome, $hex = "1e90ff") {
  $parts = preg_split('/\s+/', trim((string) $nome));
  $ini = "?";
  if ($parts && $parts[0] !== "") {
    $a = mb_strtoupper(mb_substr($parts[0], 0, 1));
    $b = count($parts) > 1 ? mb_strtoupper(mb_substr($parts[count($parts) - 1], 0, 1)) : "";
    $ini = $a . $b;
  }
  $hex = ltrim($hex, "#");
  if (!preg_match('/^[0-9a-fA-F]{6}$/', $hex)) $hex = "1e90ff";
  $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' .
    '<rect width="128" height="128" rx="64" fill="#' . $hex . '"/>' .
    '<text x="64" y="72" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#f4f6fb">' .
    htmlspecialchars($ini, ENT_QUOTES, "UTF-8") . "</text></svg>";
  return "data:image/svg+xml;base64," . base64_encode($svg);
}

/** Agenda do time: 1 request ESPN schedule → últimos + próximos. */
function agenda_do_clube($time, $dataSched = null) {
  $id = crest_id($time);
  if (!$id) return ["ultimos" => [], "proximos" => [], "proximo" => null];
  $cacheNome = "agenda_v1_" . $id . ".json";
  if ($dataSched === null) {
    $cached = store_cache_get($cacheNome, 90);
    if (is_array($cached) && isset($cached["ultimos"])) return $cached;
    $liga = espn_liga_time($time);
    $dataSched = baixar_json("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/teams/" . $id . "/schedule", 8);
  }
  $ultimos = [];
  $proximos = [];
  foreach (($dataSched["events"] ?? []) as $ev) {
    $j = evento_jogo($ev, $time);
    if ($j["status"] === "encerrado") {
      if ($j["placarMandante"] === null || $j["placarVisitante"] === null) continue;
      $j["letra"] = letra_resultado($j, $time);
      $ultimos[] = $j;
    } else {
      $proximos[] = $j;
    }
  }
  usort($ultimos, function ($a, $b) { return strcmp($b["data"], $a["data"]); });
  usort($proximos, function ($a, $b) { return strcmp($a["data"] . $a["horario"], $b["data"] . $b["horario"]); });
  $pack = [
    "ultimos" => array_slice($ultimos, 0, 10),
    "proximos" => array_slice($proximos, 0, 8),
    "proximo" => $proximos[0] ?? null
  ];
  store_cache_put($cacheNome, $pack);
  return $pack;
}

function ultimos_do_clube($time, $dias = 18) {
  return agenda_do_clube($time)["ultimos"];
}

function fotos_sportsdb($time) {
  $map = [];
  $q = rawurlencode($time);
  $teams = baixar_json("https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=" . $q, 6);
  $tid = null;
  foreach (($teams["teams"] ?? []) as $t) {
    $league = (string) ($t["strLeague"] ?? "");
    if (stripos($league, "Serie A") !== false || stripos($league, "Brasileiro") !== false || nome_bate($t["strTeam"] ?? "", $time)) {
      $tid = $t["idTeam"] ?? null;
      if (stripos($league, "Serie A") !== false) break;
    }
  }
  if (!$tid) return $map;
  $pack = baixar_json("https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=" . $tid, 8);
  foreach (($pack["player"] ?? []) as $p) {
    $nome = trim((string) ($p["strPlayer"] ?? ""));
    $foto = $p["strCutout"] ?: ($p["strThumb"] ?: "");
    if ($nome === "" || $foto === "") continue;
    $map[norm_nome_jogador($nome)] = $foto;
    /* também chave pelo último sobrenome */
    $parts = preg_split('/\s+/', $nome);
    if (count($parts) > 1) {
      $map[norm_nome_jogador($parts[count($parts) - 1])] = $foto;
    }
  }
  return $map;
}

function stat_jogador($athlete, $nomeStat) {
  $cats = $athlete["statistics"]["splits"]["categories"] ?? [];
  foreach ($cats as $c) {
    foreach (($c["stats"] ?? []) as $s) {
      if (($s["name"] ?? "") === $nomeStat) return (int) ($s["value"] ?? 0);
    }
  }
  return 0;
}

function posicao_pt($athlete) {
  $pos = $athlete["position"] ?? [];
  $abbr = strtoupper((string) ($pos["abbreviation"] ?? ""));
  $name = (string) ($pos["displayName"] ?? $pos["name"] ?? "");
  $map = [
    "G" => "Goleiro", "GK" => "Goleiro", "GOALKEEPER" => "Goleiro",
    "D" => "Zagueiro", "DEFENDER" => "Zagueiro", "CENTER-BACK" => "Zagueiro",
    "M" => "Meia", "MIDFIELDER" => "Meia",
    "F" => "Atacante", "FORWARD" => "Atacante", "ATTACKER" => "Atacante"
  ];
  if (isset($map[$abbr])) return $map[$abbr];
  $u = strtoupper($name);
  foreach ($map as $k => $v) {
    if (strpos($u, $k) !== false) return $v;
  }
  return $name ?: "Jogador";
}

function elenco_espn($time) {
  require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
  $id = crest_id($time);
  if (!$id) return ["jogadores" => [], "artilharia" => [], "via" => "sem-id"];

  $store = torcida_store_dir();
  $cacheFile = $store . DIRECTORY_SEPARATOR . "elenco_v3_" . $id . ".json";
  if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < 6 * 3600) {
    $cached = json_decode(@file_get_contents($cacheFile), true);
    if (is_array($cached) && !empty($cached["jogadores"])) return $cached;
  }

  $liga = espn_liga_time($time);
  $data = baixar_json("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/teams/" . $id . "/roster", 12);
  $athletes = $data["athletes"] ?? [];
  if ($athletes && isset($athletes[0]["items"])) {
    $flat = [];
    foreach ($athletes as $grp) {
      foreach (($grp["items"] ?? []) as $a) $flat[] = $a;
    }
    $athletes = $flat;
  }

  $fotosDb = fotos_sportsdb($time);
  $tema = tema_clube($time);
  $hex = preg_replace('/[^0-9a-fA-F]/', "", (string) ($tema["cores"]["accent"] ?? "1e90ff"));
  if (strlen($hex) !== 6) $hex = "1e90ff";

  $jogadores = [];
  foreach ($athletes as $a) {
    $nome = trim((string) ($a["displayName"] ?? $a["fullName"] ?? ""));
    if ($nome === "") continue;
    $pid = (string) ($a["id"] ?? "");
    $foto = "";
    if (!empty($a["headshot"]["href"])) $foto = $a["headshot"]["href"];
    if ($foto === "") {
      $k = norm_nome_jogador($nome);
      if (isset($fotosDb[$k])) $foto = $fotosDb[$k];
      else {
        $parts = preg_split('/\s+/', $nome);
        $ult = norm_nome_jogador($parts[count($parts) - 1] ?? "");
        if ($ult && isset($fotosDb[$ult])) $foto = $fotosDb[$ult];
      }
    }
    /* Sem foto real: avatar SVG colorido (sempre carrega) */
    $fotoReal = $foto !== "";
    if ($foto === "") $foto = avatar_data_uri($nome, $hex);

    $gols = stat_jogador($a, "totalGoals");
    $assist = stat_jogador($a, "goalAssists");
    $apps = stat_jogador($a, "appearances");
    $jogadores[] = [
      "id" => $pid,
      "nome" => $nome,
      "posicao" => posicao_pt($a),
      "numero" => (string) ($a["jersey"] ?? ""),
      "foto" => $foto,
      "fotoReal" => $fotoReal,
      "gols" => $gols,
      "assistencias" => $assist,
      "jogos" => $apps
    ];
  }

  usort($jogadores, function ($x, $y) {
    $ordem = ["Goleiro" => 1, "Zagueiro" => 2, "Meia" => 3, "Atacante" => 4];
    $ox = $ordem[$x["posicao"]] ?? 5;
    $oy = $ordem[$y["posicao"]] ?? 5;
    if ($ox !== $oy) return $ox <=> $oy;
    return strcmp($x["nome"], $y["nome"]);
  });

  $art = $jogadores;
  usort($art, function ($x, $y) {
    if (($y["gols"] ?? 0) !== ($x["gols"] ?? 0)) return ($y["gols"] ?? 0) <=> ($x["gols"] ?? 0);
    return ($y["assistencias"] ?? 0) <=> ($x["assistencias"] ?? 0);
  });
  $artilharia = array_values(array_filter($art, function ($j) {
    return ($j["gols"] ?? 0) > 0 || ($j["assistencias"] ?? 0) > 0;
  }));
  $artilharia = array_slice($artilharia, 0, 10);

  $pack = [
    "time" => $time,
    "jogadores" => $jogadores,
    "artilharia" => $artilharia,
    "via" => "espn-roster+fotos",
    "atualizadoEm" => date("c")
  ];
  if ($jogadores) {
    @file_put_contents($cacheFile, json_encode($pack, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
  }
  return $pack;
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

function score_num($raw) {
  if ($raw === null || $raw === "") return null;
  if (is_array($raw)) {
    if (isset($raw["value"]) && $raw["value"] !== "" && $raw["value"] !== null) return (int) $raw["value"];
    if (isset($raw["displayValue"]) && $raw["displayValue"] !== "" && is_numeric($raw["displayValue"])) return (int) $raw["displayValue"];
    return null;
  }
  if (is_numeric($raw)) return (int) $raw;
  return null;
}

function evento_jogo($ev, $timeUser) {
  $comp = $ev["competitions"][0] ?? [];
  $comps = $comp["competitors"] ?? [];
  $home = null; $away = null;
  foreach ($comps as $c) {
    if (($c["homeAway"] ?? "") === "home") $home = $c;
    if (($c["homeAway"] ?? "") === "away") $away = $c;
  }
  /* scoreboard: status no evento; schedule do time: status na competition */
  $state = $ev["status"]["type"]["state"]
    ?? $comp["status"]["type"]["state"]
    ?? $ev["status"]["type"]["name"]
    ?? "";
  $mandante = $home["team"]["displayName"] ?? "A definir";
  $visitante = $away["team"]["displayName"] ?? "A definir";
  $logoCasa = $home["team"]["logo"] ?? crest($mandante);
  $logoFora = $away["team"]["logo"] ?? crest($visitante);
  $dataIso = $ev["date"] ?? "";
  $tz = new DateTimeZone("America/Sao_Paulo");
  $data = $dataIso ? (new DateTime($dataIso))->setTimezone($tz)->format("Y-m-d") : hoje_sp();
  $horario = $dataIso ? (new DateTime($dataIso))->setTimezone($tz)->format("H:i") : "";
  $scoreCasa = score_num($home["score"] ?? null);
  $scoreFora = score_num($away["score"] ?? null);
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
  $cacheNome = "sb_" . preg_replace('/[^a-z0-9.]+/i', "_", $liga) . "_" . $ymd . ".json";
  $cached = store_cache_get($cacheNome, 45);
  if (is_array($cached) && array_key_exists("events", $cached)) return $cached["events"];
  $url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/scoreboard?dates=" . str_replace("-", "", $ymd) . "&limit=100";
  $data = baixar_json($url, 8);
  $events = $data["events"] ?? [];
  store_cache_put($cacheNome, ["events" => $events]);
  return $events;
}

function parse_tabela_espn($data) {
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

function tabela_bra() {
  $cached = store_cache_get("tabela_bra_v1.json", 120);
  if ($cached) return $cached;
  $data = baixar_json("https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings", 8);
  $out = parse_tabela_espn($data);
  if ($out) store_cache_put("tabela_bra_v1.json", $out);
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
  $liga = espn_liga_time($timeUser);
  $evs = scoreboard($hoje, $liga);
  $jogos = array_map(function ($ev) use ($timeUser) { return evento_jogo($ev, $timeUser); }, $evs);
  api_cache_headers(30);
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
  $cacheNome = "agenda_bra_" . $hoje . ".json";
  $cached = store_cache_get($cacheNome, 90);
  if ($cached && isset($cached["dias"])) {
    $cached["time"] = $timeUser;
    $cached["cache"] = true;
    api_cache_headers(30);
    ok($cached);
  }
  $datas = [];
  for ($i = 0; $i < 14; $i++) $datas[] = add_dias($hoje, $i);
  $boards = scoreboards_multi($datas, "bra.1", 8);
  $dias = [];
  foreach ($datas as $d) {
    $jogos = array_map(function ($ev) use ($timeUser) { return evento_jogo($ev, $timeUser); }, $boards[$d] ?? []);
    if ($jogos) $dias[] = ["data" => $d, "jogos" => $jogos];
  }
  $qtd = 0;
  foreach ($dias as $d) $qtd += count($d["jogos"]);
  $pack = [
    "dataHoje" => $hoje,
    "atualizadoEm" => date("c"),
    "time" => $timeUser,
    "grupos" => [["id" => "bra1", "nome" => "Brasileirão", "qtd" => $qtd]],
    "dias" => $dias,
    "via" => "espn-php-paralelo",
    "cache" => false
  ];
  store_cache_put($cacheNome, $pack);
  api_cache_headers(30);
  ok($pack);
}

if ($acao === "portal") {
  require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
  $hoje = hoje_sp();
  $cacheKey = "portal_v3_" . preg_replace('/[^a-z0-9]+/i', "_", mb_strtolower($timeUser)) . "_" . $hoje . ".json";
  $cacheFile = torcida_store_dir() . DIRECTORY_SEPARATOR . $cacheKey;
  if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < 90) {
    $cached = json_decode(@file_get_contents($cacheFile), true);
    if (is_array($cached) && isset($cached["jogosHoje"])) {
      $cached["cache"] = true;
      api_cache_headers(30);
      ok($cached);
    }
  }

  /* ESPN em paralelo: só pede o que não está em cache local */
  $liga = espn_liga_time($timeUser);
  $id = crest_id($timeUser);
  $sbNome = "sb_" . preg_replace('/[^a-z0-9.]+/i', "_", $liga) . "_" . $hoje . ".json";
  $sbCached = store_cache_get($sbNome, 45);
  $agendaCached = $id ? store_cache_get("agenda_v1_" . $id . ".json", 90) : ["ultimos" => [], "proximos" => [], "proximo" => null];
  $tabelaCached = store_cache_get("tabela_bra_v1.json", 120);

  $urls = [];
  if (!$sbCached) {
    $urls["hoje"] = "https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/scoreboard?dates=" . str_replace("-", "", $hoje) . "&limit=100";
  }
  if ($id && !$agendaCached) {
    $urls["sched"] = "https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/teams/" . $id . "/schedule";
  }
  if (!$tabelaCached) {
    $urls["stand"] = "https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings";
  }
  $raw = $urls ? baixar_json_multi($urls, 8) : [];

  if ($sbCached) {
    $evsHoje = $sbCached["events"] ?? [];
  } else {
    $evsHoje = $raw["hoje"]["events"] ?? [];
    store_cache_put($sbNome, ["events" => $evsHoje]);
  }
  $jogosHoje = array_map(function ($ev) use ($timeUser) { return evento_jogo($ev, $timeUser); }, $evsHoje);

  if ($agendaCached) {
    $agenda = $agendaCached;
  } else {
    $agenda = agenda_do_clube($timeUser, isset($raw["sched"]) ? $raw["sched"] : null);
  }
  $proximos = $agenda["proximos"];
  $ultimos = $agenda["ultimos"];

  if ($tabelaCached) {
    $tabela = $tabelaCached;
  } elseif (!empty($raw["stand"])) {
    $tabela = parse_tabela_espn($raw["stand"]);
    if ($tabela) store_cache_put("tabela_bra_v1.json", $tabela);
  } else {
    $tabela = tabela_bra();
  }

  $linha = null;
  foreach ($tabela as $l) {
    if (nome_bate($l["time"], $timeUser)) { $linha = $l; break; }
  }
  $proxClube = $agenda["proximo"];
  if (!$proxClube) {
    foreach ($proximos as $j) {
      if (!empty($j["quente"])) { $proxClube = $j; break; }
    }
  }
  $tema = tema_clube($timeUser);
  $pack = [
    "data" => $hoje,
    "atualizadoEm" => date("c"),
    "aoVivo" => count(array_filter($jogosHoje, function ($j) { return $j["status"] === "ao vivo"; })),
    "jogosHoje" => $jogosHoje,
    "extra" => [],
    "proximos" => array_slice($proximos, 0, 8),
    "tabela" => $tabela,
    "meta" => ["fonte" => "ESPN", "via" => "php-paralelo"],
    "noticiasMeta" => [],
    "noticias" => ["jogo" => [], "mercado" => []],
    "manchete" => null,
    "resumo" => null,
    "clube" => [
      "nome" => $timeUser,
      "escudo" => crest($timeUser),
      "tabela" => $linha,
      "proximo" => $proxClube,
      "ultimos" => $ultimos
    ],
    "tema" => $tema,
    "cache" => false
  ];
  @file_put_contents($cacheFile, json_encode($pack, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
  api_cache_headers(30);
  ok($pack);
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
  $pack = elenco_espn($time);
  $esc = crest($time);
  ok([
    "time" => $time,
    "jogadores" => $pack["jogadores"] ?? [],
    "artilharia" => $pack["artilharia"] ?? [],
    "via" => $pack["via"] ?? "espn-roster",
    "atualizadoEm" => $pack["atualizadoEm"] ?? date("c"),
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
  /* ESPN com foto real; rejeita placeholder */
  $arts = [];
  $vistos = [];
  foreach (["bra.1", "esp.1", "eng.1", "usa.1", "fra.1", "ger.1", "ita.1", "uefa.champions"] as $liga) {
    $data = baixar_json("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $liga . "/news");
    foreach (($data["articles"] ?? []) as $a) {
      $img = null;
      $best = -1;
      foreach (($a["images"] ?? []) as $im) {
        $u = $im["url"] ?? "";
        if (!$u || strpos($u, "http") !== 0) continue;
        $ul = strtolower($u);
        if (strpos($ul, "j6_cofb") !== false || strpos($ul, "encrypted-tbn") !== false) continue;
        $score = ((int) ($im["width"] ?? 0)) * ((int) ($im["height"] ?? 0));
        if (strpos($ul, "espncdn.com/photo") !== false) $score += 100000;
        if ($score >= $best) { $best = $score; $img = $u; }
      }
      if (!$img) continue;
      $title = trim((string) ($a["headline"] ?? ""));
      if ($title === "") continue;
      $k = mb_strtolower(mb_substr($title, 0, 48));
      if (isset($vistos[$k])) continue;
      $vistos[$k] = true;
      $desc = trim((string) ($a["description"] ?? ""));
      if ($desc === $title) $desc = "";
      $by = $a["byline"] ?? "ESPN";
      if (is_array($by)) $by = "ESPN";
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
        "fonteNome" => $by ?: "ESPN",
        "fonte" => $by ?: "ESPN",
        "source" => $by ?: "ESPN",
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
