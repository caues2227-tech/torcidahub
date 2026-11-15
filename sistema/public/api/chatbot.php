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

function header_nome() {
  $n = rawurldecode($_SERVER["HTTP_X_TORCIDA_NOME"] ?? "");
  $n = trim(preg_replace('/\s+/', " ", $n));
  if ($n === "" || strcasecmp($n, "Visitante") === 0) return "parceiro";
  $primeiro = explode(" ", $n)[0];
  return $primeiro !== "" ? $primeiro : "parceiro";
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
  $host = $_SERVER["HTTP_HOST"] ?? "";
  $https = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") ? "https" : "http";

  /* 1) /api/proximo (busca paralela) */
  if ($host) {
    $pack = baixar_json($https . "://" . $host . "/api/proximo?time=" . rawurlencode($time), 50);
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

  /* 2) /api/agenda (já consolidada, até 25 dias) */
  if ($host) {
    $agenda = baixar_json($https . "://" . $host . "/api/agenda", 50);
    foreach (($agenda["dias"] ?? []) as $dia) {
      foreach (($dia["jogos"] ?? []) as $jogo) {
        if (!nome_bate($jogo["mandante"] ?? "", $time) && !nome_bate($jogo["visitante"] ?? "", $time)) continue;
        if (($jogo["status"] ?? "") === "encerrado") continue;
        $dataRef = $dia["data"] ?? "";
        return [[
          "casa" => $jogo["mandante"] ?? "?",
          "fora" => $jogo["visitante"] ?? "?",
          "pc" => $jogo["placarMandante"] ?? null,
          "pf" => $jogo["placarVisitante"] ?? null,
          "status" => (($jogo["status"] ?? "") === "ao vivo" ? "IN" : "PRE"),
          "hora" => $jogo["horario"] ?? ""
        ], $dataRef ? date("d/m", strtotime($dataRef)) : ""];
      }
    }
  }

  /* 3) Scoreboards pontuais (dias mais longe primeiro — rodada típica) */
  $tz = new DateTimeZone("America/Sao_Paulo");
  $agora = new DateTime("now", $tz);
  foreach ([10, 11, 7, 14, 4, 3, 2, 1, 0, 18, 21] as $i) {
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
$meuNome = header_nome();
$p = norm($pergunta);

function achar_na_tabela($tab, $time) {
  foreach ($tab as $l) {
    if (nome_bate($l["time"], $time)) return $l;
  }
  return null;
}

function linha_corte($tab, $posCorte = 16) {
  foreach ($tab as $l) {
    if (($l["pos"] ?? 0) === $posCorte) return $l;
  }
  return $tab[$posCorte - 1] ?? null;
}

function resposta_rebaixamento($time, $tab) {
  $eu = achar_na_tabela($tab, $time);
  if (!$eu) return "Tabela sumiu, " . $time . ". Abre Hoje e sofre olhando a classificação. 😅";
  $pos = (int) ($eu["pos"] ?? 99);
  $pts = (int) ($eu["pts"] ?? 0);
  $j = (int) ($eu["j"] ?? 0);
  $restam = max(0, 38 - $j);
  $corte = linha_corte($tab, 16);
  $ptsCorte = (int) ($corte["pts"] ?? 0);
  $nomeCorte = $corte["time"] ?? "16º";

  if ($pos <= 16) {
    $folga = $pts - $ptsCorte;
    if ($folga >= 6) {
      return "Relaxa um pouco: o " . $eu["time"] . " tá em " . $pos . "º com " . $pts . " pts. Z4 tá longe (" . $nomeCorte . " com " . $ptsCorte . "). Ainda tem " . $restam . " jogos — não entrega o ano, mas respira. ⚽";
    }
    return "O " . $eu["time"] . " tá em " . $pos . "º com " . $pts . " pts — fora da Z4, mas colado no " . $nomeCorte . " (" . $ptsCorte . " pts). Folga de " . max(0, $folga) . " ponto(s). " . $restam . " jogos pela frente. Não dorme na rodada. 🙏";
  }
  $falta = max(0, ($ptsCorte + 1) - $pts);
  return "Olha… o " . $eu["time"] . " tá em " . $pos . "º com " . $pts . " pts. Pra sair da Z4 precisa passar o " . $nomeCorte . " (" . $ptsCorte . " pts). Faltam cerca de " . $falta . " ponto(s) e ainda tem " . $restam . " jogos. Dói? Dói. Mas ainda tem bola. 💪";
}

function resposta_g4($time, $tab) {
  $eu = achar_na_tabela($tab, $time);
  if (!$eu) return "Não achei o " . $time . " na tabela agora.";
  $pos = (int) ($eu["pos"] ?? 99);
  $pts = (int) ($eu["pts"] ?? 0);
  $g4 = linha_corte($tab, 4);
  $ptsG4 = (int) ($g4["pts"] ?? 0);
  if ($pos <= 4) {
    return "Tá no G4, hein? " . $eu["time"] . " em " . $pos . "º com " . $pts . " pts. Aproveita — amanhã o Brasileirão te humilha de novo. 🔥";
  }
  $falta = max(0, ($ptsG4 + 1) - $pts);
  return $eu["time"] . " em " . $pos . "º com " . $pts . " pts. O 4º (" . ($g4["time"] ?? "?") . ") tem " . $ptsG4 . ". Faltam uns " . $falta . " ponto(s) pra cheirar Libertadores. Sonhar é de graça. 🏆";
}

function resposta_clima($time, $tab) {
  $eu = achar_na_tabela($tab, $time);
  $jogos = jogos_hoje();
  $meuHoje = null;
  foreach ($jogos as $j) {
    if (nome_bate($j["casa"], $time) || nome_bate($j["fora"], $time)) { $meuHoje = $j; break; }
  }
  $pos = $eu ? (int) $eu["pos"] : null;
  $txt = "Clima de hoje na nação " . $time . ": ";
  if ($meuHoje) {
    $st = strtoupper((string) $meuHoje["status"]);
    if ($st === "IN") $txt .= "tem jogo AO VIVO (" . $meuHoje["casa"] . " " . ($meuHoje["pc"] ?? 0) . "–" . ($meuHoje["pf"] ?? 0) . " " . $meuHoje["fora"] . "). Coração na boca. 🏟️";
    elseif ($st === "POST") $txt .= "já jogou hoje (" . $meuHoje["casa"] . " " . ($meuHoje["pc"] ?? 0) . "–" . ($meuHoje["pf"] ?? 0) . " " . $meuHoje["fora"] . "). Digestão de resultado. ⚽";
    else $txt .= "tem " . $meuHoje["casa"] . " x " . $meuHoje["fora"] . " na agenda. Ansiedade nível clássico. 🔥";
  } else {
    $txt .= "sem jogo do " . $time . " hoje. ";
    if ($pos !== null && $pos >= 17) $txt .= "E ainda por cima tá na zona. Clima de novelão. 😅";
    elseif ($pos !== null && $pos <= 4) $txt .= "Mas tá no G4 — pode até sorrir no espelho. 😏";
    else $txt .= "Dia de treino, meme e xingar o técnico no grupo. 📺";
  }
  if ($eu) $txt .= "\n\nAgora: " . $eu["pos"] . "º com " . $eu["pts"] . " pts.";
  return $txt;
}

function temperar($fatos, $time, $tab) {
  $eu = achar_na_tabela($tab, $time);
  $pos = $eu ? (int) $eu["pos"] : 10;
  if ($pos <= 4) {
    $gancho = "Ah, tá bom pra você. Aproveita — no clássico eu torço contra. ⚔️";
  } elseif ($pos >= 17) {
    $gancho = "Tá, dói. Mas o " . $time . " já voltou de pior. Aguenta. 🙏";
  } else {
    $gancho = "Nem festa, nem enterro. Uma rodada muda tudo. ⚽";
  }
  return $fatos . "\n\n" . $gancho;
}

$tab = null;
$resposta = null;

if (preg_match('/\b(oi|ola|eae|fala|bom dia|boa noite|boa tarde)\b/', $p)) {
  $resposta = "Fala, " . $meuNome . "! ⚽ Pronto pra mais uma rodada de sofrimento (ou alegria) com o " . $meuTime . "? Tabela, rival, rebaixamento, próximo jogo — manda. Com farpa, claro.";
} elseif (preg_match('/rebaix|z4|zona|nao cair|cair|degola|quanto falta.*cair|sair da zona/', $p)) {
  $tab = tabela_bra();
  $resposta = $tab ? resposta_rebaixamento($meuTime, $tab) : "Tabela offline, " . $meuNome . ". Abre Hoje e sofre olhando a Z4.";
} elseif (preg_match('/\bg4\b|libertadores|entrar no g4|to no g4|no g4/', $p)) {
  $tab = tabela_bra();
  $resposta = $tab ? resposta_g4($meuTime, $tab) : "Tabela offline agora, " . $meuNome . ".";
} elseif (preg_match('/\bclima\b|humor|como (esta|ta) (o )?dia|clima de hj|clima de hoje/', $p)) {
  $tab = tabela_bra();
  $resposta = resposta_clima($meuTime, $tab ?: []);
} elseif (strpos($p, "rival") !== false || strpos($p, "classico") !== false) {
  $resposta = rival_de($meuTime) . "\n\nE no dia do clássico eu torço CONTRA você, " . $meuNome . ". Com carinho. 😏";
} elseif (strpos($p, "ranking") !== false || (strpos($p, "torcedor") !== false && strpos($p, "mais") !== false)) {
  $resposta = "Ranking de torcida é briga de verdade, " . $meuNome . ": cada conta que escolhe o clube sobe o time. Abre Ranking e vê se a nação " . $meuTime . " tá no pódio. 🏟️";
} elseif (
  strpos($p, "onde eu") !== false || strpos($p, "onde to") !== false || strpos($p, "onde estou") !== false
  || strpos($p, "to na tabela") !== false || strpos($p, "na tabela") !== false
  || ((strpos($p, "tabela") !== false || strpos($p, "classific") !== false) && (strpos($p, "eu") !== false || strpos($p, "meu") !== false || strpos($p, "nosso") !== false))
) {
  $tab = tabela_bra();
  $achou = $tab ? achar_na_tabela($tab, $meuTime) : null;
  if ($achou) {
    $fatos = $meuNome . ", o " . $achou["time"] . " tá em " . ($achou["pos"] ?? "?") . "º com " . ($achou["pts"] ?? "?") . " pts (" . ($achou["j"] ?? "?") . " jogos).";
    $resposta = temperar($fatos, $meuTime, $tab);
  } elseif ($tab) {
    $resposta = "Não achei o " . $meuTime . " na Série A agora, " . $meuNome . ". Topo: " . ($tab[0]["time"] ?? "?") . " liderando.";
  } else {
    $resposta = "Tabela offline. Abre Hoje — eu sou Bot de bancada, não milagreiro. 😅";
  }
} elseif (strpos($p, "lider") !== false || strpos($p, "tabela") !== false || strpos($p, "brasileirao") !== false || strpos($p, "classific") !== false) {
  $tab = tabela_bra();
  if (!$tab) {
    $resposta = "Não puxei a tabela agora. Tenta de novo ou olha em Hoje.";
  } else {
    $linhas = [];
    foreach (array_slice($tab, 0, 8) as $l) {
      $linhas[] = ($l["pos"] ?? "?") . "º " . $l["time"] . " — " . ($l["pts"] ?? "?") . " pts";
    }
    $resposta = "Brasileirão (topo), sem enrolação:\n" . implode("\n", $linhas) . "\n\nSeu " . $meuTime . " tá nessa briga também. Confere. ⚽";
  }
} elseif ((strpos($p, "hoje") !== false || strpos($p, "ao vivo") !== false || strpos($p, "placar") !== false) && strpos($p, "proximo") === false) {
  $jogos = jogos_hoje();
  if (!$jogos) {
    $resposta = "Hoje a ESPN não mostrou rodada do Brasileirão. Vai mexer no grupo da família então. 📺";
  } else {
    $linhas = [];
    foreach ($jogos as $j) {
      $st = strtoupper((string) $j["status"]);
      if ($st === "IN") $txt = "AO VIVO " . $j["casa"] . " " . ($j["pc"] ?? 0) . "–" . ($j["pf"] ?? 0) . " " . $j["fora"];
      elseif ($st === "POST") $txt = "Final " . $j["casa"] . " " . ($j["pc"] ?? 0) . "–" . ($j["pf"] ?? 0) . " " . $j["fora"];
      else $txt = $j["casa"] . " x " . $j["fora"];
      $linhas[] = "• " . $txt;
    }
    $resposta = "Jogos de hoje:\n" . implode("\n", $linhas);
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
    $resposta = "Não achei próximo do " . $clube . ". Confere a aba Jogos — às vezes a ESPN atrasa. 🏟️";
  } else {
    $st = strtoupper((string) $j["status"]);
    if ($st === "IN") $resposta = "Tá rolando AGORA: " . $j["casa"] . " " . ($j["pc"] ?? 0) . "–" . ($j["pf"] ?? 0) . " " . $j["fora"] . " 🔥";
    else $resposta = "Próximo do " . $clube . ": " . $j["casa"] . " x " . $j["fora"] . ($dia ? " (" . $dia . ")" : "") . (!empty($j["hora"]) ? " · " . $j["hora"] : "") . "\n\nMarca no calendário e já vai ficando nervoso. ⚽";
  }
} elseif (preg_match('/\b(flamengo|palmeiras|corinthians|santos|sao paulo|fluminense|botafogo|vasco|gremio|internacional|cruzeiro|atletico|bahia|real madrid|barcelona|psg)\b/', $p, $m)) {
  $clube = $m[1];
  $tab = tabela_bra();
  $achou = $tab ? achar_na_tabela($tab, $clube) : null;
  if ($achou) {
    $resposta = temperar($achou["time"] . " em " . ($achou["pos"] ?? "?") . "º com " . ($achou["pts"] ?? "?") . " pts (" . ($achou["j"] ?? "?") . " jogos).", $meuTime, $tab);
  } else {
    $resposta = "Falei de " . $clube . " mas não achei na Série A agora. Pergunta de novo com o clube no perfil.";
  }
} else {
  $resposta = "Sou Bot de BANCADA, " . $meuNome . " — não locutor. Manda: tabela, quanto falta pra não cair, G4, rival, clima de hoje, próximo jogo ou ranking do " . $meuTime . ". ⚽";
}

responder(200, ["resposta" => $resposta, "via" => "espn-php", "time" => $meuTime, "nome" => $meuNome]);
