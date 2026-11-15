<?php
/**
 * Bot Torcida (Hostinger PHP) — respostas com dados ESPN, sem chave de IA.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  header("Access-Control-Allow-Origin: *");
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type, Authorization");
  http_response_code(204);
  exit;
}

function responder($codigo, $corpo) {
  http_response_code($codigo);
  echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function baixar_json($url) {
  if (!function_exists("curl_init")) return null;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 8,
    CURLOPT_USERAGENT => "TorcidaBot/1.0",
    CURLOPT_SSL_VERIFYPEER => true
  ]);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($body === false || $code >= 400) return null;
  $j = json_decode($body, true);
  return is_array($j) ? $j : null;
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

$p = mb_strtolower($pergunta);
$p = strtr($p, ["á"=>"a","à"=>"a","ã"=>"a","â"=>"a","é"=>"e","ê"=>"e","í"=>"i","ó"=>"o","ô"=>"o","õ"=>"o","ú"=>"u","ç"=>"c"]);

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
    $out[] = [
      "time" => $en["team"]["displayName"] ?? $en["team"]["name"] ?? "?",
      "pos" => isset($stats["rank"]) ? (int) $stats["rank"] : null,
      "pts" => isset($stats["points"]) ? (int) $stats["points"] : null,
      "j" => isset($stats["gamesPlayed"]) ? (int) $stats["gamesPlayed"] : null
    ];
  }
  usort($out, function ($a, $b) { return ($a["pos"] ?? 99) <=> ($b["pos"] ?? 99); });
  return $out;
}

function jogos_hoje() {
  $hoje = (new DateTime("now", new DateTimeZone("America/Sao_Paulo")))->format("Ymd");
  $data = baixar_json("https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=" . $hoje);
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
      "status" => $state
    ];
  }
  return $out;
}

$resposta = null;

if (preg_match('/\b(oi|ola|eae|fala|bom dia|boa noite|boa tarde)\b/', $p)) {
  $resposta = "Fala, torcedor! Pergunta de tabela, jogos de hoje, ranking ou do seu clube que eu respondo com dados ao vivo.";
} elseif (strpos($p, "ranking") !== false || (strpos($p, "torcedor") !== false && strpos($p, "mais") !== false)) {
  $resposta = "O ranking de torcida fica em /ranking.html — sobe conforme o pessoal cria conta e escolhe o clube. Abre lá e vê o pódio.";
} elseif (strpos($p, "tabela") !== false || strpos($p, "brasileirao") !== false || strpos($p, "classific") !== false || strpos($p, "lider") !== false) {
  $tab = tabela_bra();
  if (!$tab) {
    $resposta = "Não consegui puxar a tabela agora. Tenta de novo em instantes.";
  } else {
    $linhas = [];
    foreach (array_slice($tab, 0, 8) as $l) {
      $linhas[] = ($l["pos"] ?? "?") . "º " . $l["time"] . " — " . ($l["pts"] ?? "?") . " pts";
    }
    $resposta = "Brasileirão (topo):\n" . implode("\n", $linhas);
  }
} elseif (strpos($p, "jogo") !== false || strpos($p, "hoje") !== false || strpos($p, "ao vivo") !== false || strpos($p, "placar") !== false) {
  $jogos = jogos_hoje();
  if (!$jogos) {
    $resposta = "Hoje não achei jogos do Brasileirão na agenda ESPN (ou a fonte falhou). Olha a aba Jogos pra cobertura completa.";
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
} elseif (preg_match('/\b(flamengo|palmeiras|corinthians|santos|sao paulo|fluminense|botafogo|vasco|gremio|internacional|cruzeiro|atletico|bahia|real madrid|barcelona|psg)\b/', $p, $m)) {
  $clube = $m[1];
  $tab = tabela_bra();
  $achou = null;
  foreach ($tab as $l) {
    $n = mb_strtolower($l["time"]);
    $n = strtr($n, ["á"=>"a","ã"=>"a","é"=>"e","í"=>"i","ó"=>"o","ô"=>"o","ú"=>"u","ç"=>"c"]);
    if (strpos($n, $clube) !== false || strpos($clube, explode(" ", $n)[0]) !== false) { $achou = $l; break; }
  }
  if ($achou) {
    $resposta = $achou["time"] . " está em " . ($achou["pos"] ?? "?") . "º com " . ($achou["pts"] ?? "?") . " pontos (" . ($achou["j"] ?? "?") . " jogos).";
  } else {
    $resposta = "Vi que você falou de " . $clube . ". Pra tabela BR eu olho o Brasileirão; pra europeus, abre Jogos/Nação que a cobertura tá lá.";
  }
} else {
  $resposta = "Posso falar de tabela do Brasileirão, jogos de hoje, ranking de torcida e do seu clube. Ex.: \"como tá a tabela?\" ou \"quais os jogos de hoje?\".";
}

responder(200, ["resposta" => $resposta, "via" => "espn-php"]);
