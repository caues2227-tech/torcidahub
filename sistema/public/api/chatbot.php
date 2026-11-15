<?php
/**
 * Bot Torcida (Hostinger PHP) — tabela/jogos/rival via ESPN + /api/tabela local.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  header("Access-Control-Allow-Origin: *");
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Torcida-Time, X-Torcida-Cliente");
  http_response_code(204);
  exit;
}

function responder($codigo, $corpo) {
  http_response_code($codigo);
  echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function baixar_json($url, $timeout = 15) {
  if (!function_exists("curl_init")) return null;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => $timeout,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_USERAGENT => "Mozilla/5.0 TorcidaBot/1.2",
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_ENCODING => ""
  ]);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($body === false || $code >= 400) {
    /* fallback sem verify (alguns hosts Hostinger) */
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_USERAGENT => "Mozilla/5.0 TorcidaBot/1.2",
      CURLOPT_SSL_VERIFYPEER => false
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code >= 400) return null;
  }
  $j = json_decode($body, true);
  return is_array($j) ? $j : null;
}

function header_time() {
  $t = $_SERVER["HTTP_X_TORCIDA_TIME"] ?? "";
  $t = rawurldecode($t);
  return $t !== "" ? $t : "Santos";
}

function norm($s) {
  $s = mb_strtolower(trim((string) $s));
  return strtr($s, ["á"=>"a","à"=>"a","ã"=>"a","â"=>"a","é"=>"e","ê"=>"e","í"=>"i","ó"=>"o","ô"=>"o","õ"=>"o","ú"=>"u","ç"=>"c"]);
}

function aliases_clube($nome) {
  $n = preg_replace('/[^a-z0-9]+/', "", norm($nome));
  $mapa = [
    "atleticomg" => ["atleticomg", "atleticomineiro", "galo", "cam"],
    "atleticomineiro" => ["atleticomg", "atleticomineiro", "galo", "cam"],
    "galo" => ["atleticomg", "atleticomineiro", "galo"],
    "athleticopr" => ["athleticopr", "athleticoparanaense", "furacao"],
    "saopaulo" => ["saopaulo", "tricolor", "spfc"],
    "vasco" => ["vasco", "vascodagama"],
    "vascodagama" => ["vasco", "vascodagama"],
    "bragantino" => ["bragantino", "redbullbragantino", "rbb"],
    "redbullbragantino" => ["bragantino", "redbullbragantino"]
  ];
  $out = [$n];
  foreach ($mapa as $k => $lista) {
    if ($n === $k || in_array($n, $lista, true)) {
      foreach ($lista as $x) $out[] = $x;
      $out[] = $k;
    }
  }
  return array_values(array_unique(array_filter($out)));
}

function nome_bate($a, $b) {
  $as = aliases_clube($a);
  $bs = aliases_clube($b);
  foreach ($as as $x) {
    foreach ($bs as $y) {
      if ($x === "" || $y === "") continue;
      if ($x === $y || strpos($x, $y) !== false || strpos($y, $x) !== false) return true;
    }
  }
  return false;
}

function espn_id_clube($nome) {
  static $map = [
    "Flamengo" => 819, "Palmeiras" => 2029, "Corinthians" => 874, "São Paulo" => 2026,
    "Santos" => 2674, "Fluminense" => 3445, "Botafogo" => 6086, "Vasco" => 3454,
    "Grêmio" => 6273, "Internacional" => 1936, "Atlético-MG" => 7632, "Atlético Mineiro" => 7632,
    "Cruzeiro" => 2022, "Bahia" => 9967, "Vitória" => 3457, "Athletico-PR" => 3458,
    "Fortaleza" => 6272, "Bragantino" => 6079, "Mirassol" => 9169, "Cuiabá" => 17313,
    "Juventude" => 6270, "Coritiba" => 3456, "Chapecoense" => 9318, "Remo" => 4936
  ];
  foreach ($map as $k => $id) {
    if (nome_bate($k, $nome)) return $id;
  }
  return null;
}

function parse_standings($data) {
  if (!$data) return [];
  $entries = [];
  foreach (($data["children"] ?? []) as $ch) {
    foreach (($ch["standings"]["entries"] ?? []) as $en) $entries[] = $en;
  }
  if (!$entries && !empty($data["standings"]["entries"])) $entries = $data["standings"]["entries"];
  $out = [];
  foreach ($entries as $en) {
    $stats = [];
    foreach (($en["stats"] ?? []) as $s) {
      $k = $s["name"] ?? $s["abbreviation"] ?? "";
      $stats[$k] = $s["value"] ?? null;
      if (!empty($s["abbreviation"])) $stats[$s["abbreviation"]] = $s["value"] ?? null;
    }
    $pos = $stats["rank"] ?? $stats[" Rank"] ?? $stats["RANK"] ?? null;
    $pts = $stats["points"] ?? $stats["PTS"] ?? null;
    $j = $stats["gamesPlayed"] ?? $stats["GP"] ?? null;
    $out[] = [
      "time" => $en["team"]["displayName"] ?? $en["team"]["name"] ?? "?",
      "pos" => $pos !== null ? (int) $pos : null,
      "pts" => $pts !== null ? (int) $pts : null,
      "j" => $j !== null ? (int) $j : null
    ];
  }
  usort($out, function ($a, $b) { return ($a["pos"] ?? 99) <=> ($b["pos"] ?? 99); });
  return $out;
}

function tabela_bra() {
  /* 1) API local do próprio site (já funciona no Hostinger) */
  $host = $_SERVER["HTTP_HOST"] ?? "";
  $https = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") ? "https" : "http";
  if ($host) {
    $local = baixar_json($https . "://" . $host . "/api/tabela", 12);
    if (!empty($local["tabela"]) && is_array($local["tabela"])) {
      $out = [];
      foreach ($local["tabela"] as $l) {
        $out[] = [
          "time" => $l["time"] ?? "?",
          "pos" => isset($l["posicao"]) ? (int) $l["posicao"] : null,
          "pts" => isset($l["pontos"]) ? (int) $l["pontos"] : null,
          "j" => isset($l["jogos"]) ? (int) $l["jogos"] : null
        ];
      }
      if ($out) return $out;
    }
  }
  /* 2) ESPN direto */
  $urls = [
    "https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings",
    "https://site.web.api.espn.com/apis/v2/sports/soccer/bra.1/standings"
  ];
  foreach ($urls as $u) {
    $tab = parse_standings(baixar_json($u, 15));
    if ($tab) return $tab;
  }
  return [];
}

function scoreboard($ymd) {
  $data = baixar_json("https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=" . $ymd . "&limit=50", 12);
  $out = [];
  foreach (($data["events"] ?? []) as $ev) {
    $comp = ($ev["competitions"][0] ?? []);
    $comps = $comp["competitors"] ?? [];
    $home = null; $away = null;
    foreach ($comps as $c) {
      if (($c["homeAway"] ?? "") === "home") $home = $c;
      if (($c["homeAway"] ?? "") === "away") $away = $c;
    }
    $state = $ev["status"]["type"]["state"] ?? "";
    $out[] = [
      "casa" => $home["team"]["displayName"] ?? "?",
      "fora" => $away["team"]["displayName"] ?? "?",
      "pc" => $home["score"] ?? null,
      "pf" => $away["score"] ?? null,
      "status" => $state,
      "hora" => $ev["status"]["type"]["shortDetail"] ?? ""
    ];
  }
  return $out;
}

function jogos_hoje() {
  $hoje = (new DateTime("now", new DateTimeZone("America/Sao_Paulo")))->format("Ymd");
  return scoreboard($hoje);
}

function proximo_do_clube($time) {
  /* Usa /api/proximo (1 request, varre 25 dias no servidor) */
  $host = $_SERVER["HTTP_HOST"] ?? "";
  $https = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") ? "https" : "http";
  if ($host) {
    $url = $https . "://" . $host . "/api/proximo?time=" . rawurlencode($time);
    $pack = baixar_json($url, 45);
    if (!empty($pack["jogo"])) {
      $j = $pack["jogo"];
      return [[
        "casa" => $j["mandante"] ?? $j["casa"] ?? "?",
        "fora" => $j["visitante"] ?? $j["fora"] ?? "?",
        "pc" => $j["placarMandante"] ?? $j["pc"] ?? null,
        "pf" => $j["placarVisitante"] ?? $j["pf"] ?? null,
        "status" => (($j["status"] ?? "") === "ao vivo" || ($j["status"] ?? "") === "IN") ? "IN" : "PRE",
        "hora" => $j["horario"] ?? $j["hora"] ?? ""
      ], $pack["dia"] ?? ""];
    }
  }

  /* Fallback direto: poucos dias críticos */
  $tz = new DateTimeZone("America/Sao_Paulo");
  $agora = new DateTime("now", $tz);
  foreach ([0, 1, 2, 3, 4, 7, 10, 11, 14, 18, 21] as $i) {
    $d = clone $agora;
    $d->modify("+$i day");
    foreach (scoreboard($d->format("Ymd")) as $j) {
      if (!nome_bate($j["casa"], $time) && !nome_bate($j["fora"], $time)) continue;
      if (strtoupper((string) $j["status"]) === "POST") continue;
      return [$j, $d->format("d/m")];
    }
  }
  return [null, null];
}

function rival_de($time) {
  $mapa = [
    "Flamengo" => "Fluminense (Fla-Flu) e Vasco",
    "Fluminense" => "Flamengo (Fla-Flu)",
    "Vasco" => "Flamengo (clássico dos milionários)",
    "Botafogo" => "Flamengo e Fluminense",
    "Palmeiras" => "Corinthians (Derby Paulista)",
    "Corinthians" => "Palmeiras (Derby) e São Paulo",
    "São Paulo" => "Corinthians e Palmeiras (Choque-Rei / Majestoso)",
    "Santos" => "Corinthians e São Paulo (San-São)",
    "Grêmio" => "Internacional (Gre-Nal)",
    "Internacional" => "Grêmio (Gre-Nal)",
    "Atlético-MG" => "Cruzeiro (Clássico Mineiro)",
    "Cruzeiro" => "Atlético-MG (Clássico Mineiro)",
    "Bahia" => "Vitória (Ba-Vi)",
    "Vitória" => "Bahia (Ba-Vi)",
    "Athletico-PR" => "Coritiba (Atletiba)",
    "Coritiba" => "Athletico-PR (Atletiba)",
    "Real Madrid" => "Barcelona (El Clásico)",
    "Barcelona" => "Real Madrid (El Clásico)",
    "PSG" => "Olympique de Marseille (Le Classique)"
  ];
  foreach ($mapa as $k => $v) {
    if (nome_bate($k, $time)) return $k . " → rival: " . $v;
  }
  return "Pro " . $time . " o rival clássico depende da região — me fala a cidade que eu afunilo.";
}

$path = parse_url($_SERVER["REQUEST_URI"] ?? "", PHP_URL_PATH);
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

if (preg_match('#/api/chatbot/status/?$#', $path) || (isset($_GET["acao"]) && $_GET["acao"] === "status")) {
  responder(200, ["ok" => true, "ia" => false, "via" => "espn-php"]);
}

if ($method !== "POST") {
  responder(405, ["erro" => "Método não permitido.", "codigo" => "metodo"]);
}

$raw = file_get_contents("php://input");
$b = $raw ? json_decode($raw, true) : [];
$pergunta = trim((string) ($b["pergunta"] ?? ""));
if ($pergunta === "") {
  responder(400, ["erro" => "Manda uma pergunta, torcedor.", "codigo" => "invalido"]);
}

$meuTime = header_time();
$p = norm($pergunta);

$resposta = null;

if (preg_match('/\b(oi|ola|eae|fala|bom dia|boa noite|boa tarde)\b/', $p)) {
  $resposta = "Fala, torcedor do " . $meuTime . "! Pergunta de tabela, jogos, rival, ranking ou próximo jogo que eu puxo ao vivo.";
} elseif (strpos($p, "rival") !== false) {
  $resposta = rival_de($meuTime);
} elseif (strpos($p, "ranking") !== false || (strpos($p, "torcedor") !== false && strpos($p, "mais") !== false)) {
  $resposta = "Ranking de torcida é real: cada pessoa que escolhe o clube sobe o time. Abre /ranking.html e vê o pódio.";
} elseif (
  strpos($p, "onde eu") !== false || strpos($p, "onde to") !== false || strpos($p, "onde estou") !== false
  || strpos($p, "to na tabela") !== false || strpos($p, "na tabela") !== false
  || ((strpos($p, "tabela") !== false || strpos($p, "classific") !== false) && (strpos($p, "eu") !== false || strpos($p, "meu") !== false || strpos($p, "nosso") !== false))
) {
  $tab = tabela_bra();
  $achou = null;
  foreach ($tab as $l) {
    if (nome_bate($l["time"], $meuTime)) { $achou = $l; break; }
  }
  if ($achou) {
    $resposta = $achou["time"] . " tá em " . ($achou["pos"] ?? "?") . "º com " . ($achou["pts"] ?? "?") . " pts (" . ($achou["j"] ?? "?") . " jogos).";
  } elseif ($tab) {
    $linhas = [];
    foreach (array_slice($tab, 0, 5) as $l) {
      $linhas[] = ($l["pos"] ?? "?") . "º " . $l["time"] . " — " . ($l["pts"] ?? "?") . " pts";
    }
    $resposta = "Não achei o " . $meuTime . " na Série A agora. Topo do Brasileirão:\n" . implode("\n", $linhas);
  } else {
    $resposta = "Tabela offline neste instante. Abre a aba Hoje / Meu Clube que a classificação tá lá.";
  }
} elseif (strpos($p, "lider") !== false || strpos($p, "tabela") !== false || strpos($p, "brasileirao") !== false || strpos($p, "classific") !== false) {
  $tab = tabela_bra();
  if (!$tab) {
    $resposta = "Não consegui puxar a tabela agora. Tenta de novo em instantes ou olha em Hoje.";
  } else {
    $linhas = [];
    foreach (array_slice($tab, 0, 8) as $l) {
      $linhas[] = ($l["pos"] ?? "?") . "º " . $l["time"] . " — " . ($l["pts"] ?? "?") . " pts";
    }
    $resposta = "Brasileirão (topo):\n" . implode("\n", $linhas);
  }
} elseif ((strpos($p, "hoje") !== false || strpos($p, "ao vivo") !== false || strpos($p, "placar") !== false) && strpos($p, "proximo") === false) {
  $jogos = jogos_hoje();
  if (!$jogos) {
    $tz = new DateTimeZone("America/Sao_Paulo");
    $d = new DateTime("now", $tz);
    $d->modify("+1 day");
    $jogos = scoreboard($d->format("Ymd"));
    if ($jogos) {
      $linhas = [];
      foreach ($jogos as $j) $linhas[] = "• " . $j["casa"] . " x " . $j["fora"];
      $resposta = "Hoje tá sem rodada na ESPN. Amanhã:\n" . implode("\n", $linhas);
    } else {
      $resposta = "Sem jogos do Brasileirão na agenda ESPN neste momento. Abre a aba Jogos pra cobertura completa.";
    }
  } else {
    $linhas = [];
    foreach ($jogos as $j) {
      $st = strtoupper((string) $j["status"]);
      if ($st === "IN") $txt = "AO VIVO " . $j["casa"] . " " . ($j["pc"] ?? 0) . "–" . ($j["pf"] ?? 0) . " " . $j["fora"];
      elseif ($st === "POST") $txt = "Final " . $j["casa"] . " " . ($j["pc"] ?? 0) . "–" . ($j["pf"] ?? 0) . " " . $j["fora"];
      else $txt = $j["casa"] . " x " . $j["fora"];
      $linhas[] = "• " . $txt;
    }
    $resposta = "Jogos de hoje (Brasileirão):\n" . implode("\n", $linhas);
  }
} elseif (
  strpos($p, "proximo") !== false || strpos($p, "partida") !== false
  || preg_match('/\bjogo\b/', $p)
) {
  $clube = $meuTime;
  if (preg_match('/\b(flamengo|palmeiras|corinthians|santos|sao paulo|fluminense|botafogo|vasco|gremio|internacional|cruzeiro|bahia|vitoria|atletico[\s\-]?mg|atletico mineiro|galo|athletico[\s\-]?pr)\b/', $p, $m)) {
    $clube = $m[1];
    if (strpos(norm($clube), "atletico") !== false || norm($clube) === "galo") $clube = "Atlético-MG";
    if (strpos(norm($clube), "athletico") !== false) $clube = "Athletico-PR";
  }
  list($j, $dia) = proximo_do_clube($clube);
  if (!$j) {
    $resposta = "Não achei próximo jogo do " . $clube . " na ESPN agora. Confere a aba Jogos.";
  } else {
    $st = strtoupper((string) $j["status"]);
    if ($st === "IN") $resposta = "AO VIVO agora: " . $j["casa"] . " " . ($j["pc"] ?? 0) . "–" . ($j["pf"] ?? 0) . " " . $j["fora"];
    else $resposta = "Próximo do " . $clube . ": " . $j["casa"] . " x " . $j["fora"] . ($dia ? " (" . $dia . ")" : "") . (!empty($j["hora"]) ? " · " . $j["hora"] : "");
  }
} elseif (preg_match('/\b(flamengo|palmeiras|corinthians|santos|sao paulo|fluminense|botafogo|vasco|gremio|internacional|cruzeiro|atletico|bahia|real madrid|barcelona|psg)\b/', $p, $m)) {
  $clube = $m[1];
  $tab = tabela_bra();
  $achou = null;
  foreach ($tab as $l) {
    if (nome_bate($l["time"], $clube)) { $achou = $l; break; }
  }
  if ($achou) {
    $resposta = $achou["time"] . " está em " . ($achou["pos"] ?? "?") . "º com " . ($achou["pts"] ?? "?") . " pontos (" . ($achou["j"] ?? "?") . " jogos).";
  } else {
    $resposta = "Vi que você falou de " . $clube . ". Pra posição na Série A pergunta \"onde eu tô na tabela?\" com o clube escolhido no perfil.";
  }
} else {
  $resposta = "Posso falar de tabela, onde o " . $meuTime . " está, rival, jogos de hoje, próximo jogo e ranking. Ex.: \"onde eu tô na tabela?\" ou \"quem é meu rival?\".";
}

responder(200, ["resposta" => $resposta, "via" => "espn-php", "time" => $meuTime]);
