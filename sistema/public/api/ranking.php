<?php
/**
 * Ranking REAL: cada escolha de clube = 1 voto (por dispositivo ou conta).
 * Trocar de time move o voto. Sem números inventados.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
header("Access-Control-Allow-Origin: *");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Torcida-Cliente, X-Torcida-Time");
  http_response_code(204);
  exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
$STORE = torcida_store_dir();
$VOTOS_FILE = $STORE . DIRECTORY_SEPARATOR . "votos.json";
$DB_FILE = $STORE . DIRECTORY_SEPARATOR . "usuarios.json";

function crest($time) {
  static $map = [
    "Flamengo" => 819, "Palmeiras" => 2029, "Corinthians" => 874, "São Paulo" => 2026,
    "Santos" => 2674, "Fluminense" => 3445, "Botafogo" => 6086, "Vasco" => 3454,
    "Grêmio" => 6273, "Internacional" => 1936, "Atlético-MG" => 7632, "Cruzeiro" => 2022,
    "Bahia" => 9967, "Vitória" => 3457, "Athletico-PR" => 3458, "Fortaleza" => 6272,
    "Bragantino" => 6079, "Mirassol" => 9169, "Cuiabá" => 17313, "Juventude" => 6270,
    "Real Madrid" => 86, "Barcelona" => 83, "PSG" => 160,
    "Manchester City" => 382, "Manchester United" => 360, "Liverpool" => 364,
    "Chelsea" => 363, "Arsenal" => 359, "Bayern Munich" => 132, "Juventus" => 111,
    "Inter Milan" => 110, "AC Milan" => 103, "Borussia Dortmund" => 124,
    "Atlético Madrid" => 1068, "Tottenham" => 367, "Napoli" => 114,
    "Ajax" => 139, "Benfica" => 1929, "Porto" => 437
  ];
  $id = $map[$time] ?? null;
  return $id ? ("https://a.espncdn.com/i/teamlogos/soccer/500/" . $id . ".png") : "";
}

function ensure_store($dir) {
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
}

function load_json($file, $fallback) {
  if (!is_file($file)) return $fallback;
  $raw = @file_get_contents($file);
  $j = $raw ? json_decode($raw, true) : null;
  return is_array($j) ? $j : $fallback;
}

function save_json($file, $dir, $data) {
  ensure_store($dir);
  @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

function cliente_id() {
  $c = $_SERVER["HTTP_X_TORCIDA_CLIENTE"] ?? "";
  $c = preg_replace('/[^a-zA-Z0-9_\-.]/', "", $c);
  if ($c !== "") return substr($c, 0, 80);
  $ip = $_SERVER["REMOTE_ADDR"] ?? "0";
  return "ip_" . substr(hash("sha256", $ip), 0, 16);
}

function responder($code, $body) {
  http_response_code($code);
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

$path = parse_url($_SERVER["REQUEST_URI"] ?? "", PHP_URL_PATH);
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

if ($method === "POST" && (preg_match('#/api/ranking/voto/?$#', $path) || (($_GET["acao"] ?? "") === "voto"))) {
  $raw = file_get_contents("php://input");
  $b = $raw ? json_decode($raw, true) : [];
  $time = trim((string) ($b["time"] ?? $b["clube"] ?? ""));
  if ($time === "") $time = trim(rawurldecode((string) ($_SERVER["HTTP_X_TORCIDA_TIME"] ?? "")));
  if ($time === "" || mb_strlen($time) > 60) responder(400, ["erro" => "Informe o clube.", "codigo" => "invalido"]);
  $cid = trim((string) ($b["cliente"] ?? ""));
  if ($cid === "") $cid = cliente_id();
  $cid = preg_replace('/[^a-zA-Z0-9_\-.]/', "", $cid) ?: ("anon_" . bin2hex(random_bytes(4)));
  if (!empty($b["userId"])) $cid = "user_" . preg_replace('/[^a-zA-Z0-9_\-]/', "", (string) $b["userId"]);

  $votos = load_json($VOTOS_FILE, ["votos" => []]);
  if (!isset($votos["votos"]) || !is_array($votos["votos"])) $votos["votos"] = [];
  $votos["votos"][$cid] = ["time" => $time, "em" => date("c")];
  save_json($VOTOS_FILE, $STORE, $votos);
  responder(200, ["ok" => true, "time" => $time, "cliente" => $cid]);
}

$votos = load_json($VOTOS_FILE, ["votos" => []]);
if (!isset($votos["votos"]) || !is_array($votos["votos"])) $votos["votos"] = [];

/* Sync contas antigas → voto user_<id> (uma vez) */
$db = load_json($DB_FILE, ["usuarios" => []]);
$mudou = false;
foreach (($db["usuarios"] ?? []) as $u) {
  $uid = (string) ($u["id"] ?? "");
  $time = trim((string) ($u["time"] ?? ""));
  if ($uid === "" || $time === "") continue;
  $chave = "user_" . $uid;
  if (isset($votos["votos"][$chave])) continue;
  $votos["votos"][$chave] = ["time" => $time, "em" => $u["criadoEm"] ?? date("c")];
  $mudou = true;
}
if ($mudou) save_json($VOTOS_FILE, $STORE, $votos);

$mapa = [];
foreach ($votos["votos"] as $v) {
  $time = trim((string) ($v["time"] ?? ""));
  if ($time === "") continue;
  if (!isset($mapa[$time])) $mapa[$time] = ["time" => $time, "torcedores" => 0, "posts" => 0];
  $mapa[$time]["torcedores"]++;
}

$lista = array_values($mapa);
usort($lista, function ($a, $b) {
  if ($a["torcedores"] !== $b["torcedores"]) return $b["torcedores"] <=> $a["torcedores"];
  return strcmp($a["time"], $b["time"]);
});

$ranking = [];
foreach ($lista as $i => $x) {
  $ranking[] = [
    "posicao" => $i + 1,
    "time" => $x["time"],
    "torcedores" => $x["torcedores"],
    "posts" => $x["posts"],
    "pontos" => $x["torcedores"] * 3,
    "qtd" => $x["torcedores"],
    "escudo" => crest($x["time"])
  ];
}

responder(200, [
  "ranking" => $ranking,
  "totalTorcedores" => array_sum(array_map(function ($x) { return $x["torcedores"]; }, $ranking)),
  "via" => "votos-reais"
]);
