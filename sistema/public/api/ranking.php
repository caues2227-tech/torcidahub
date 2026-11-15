<?php
/**
 * Ranking de torcida — conta cadastros reais e completa com clubes populares
 * para a página nunca ficar vazia no ar.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

$DB_FILE = __DIR__ . DIRECTORY_SEPARATOR . "_store" . DIRECTORY_SEPARATOR . "usuarios.json";

function crest($time) {
  static $map = [
    "Flamengo" => 819, "Palmeiras" => 2029, "Corinthians" => 874, "São Paulo" => 2026,
    "Santos" => 2674, "Fluminense" => 3445, "Botafogo" => 6086, "Vasco" => 3454,
    "Grêmio" => 6273, "Internacional" => 1936, "Atlético-MG" => 7632, "Cruzeiro" => 2022,
    "Bahia" => 9967, "Vitória" => 3457, "Athletico-PR" => 3458, "Fortaleza" => 6272,
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

/* Base visível mesmo sem cadastros — sobe de verdade quando alguém escolhe o clube */
$mapa = [
  "Flamengo" => ["time" => "Flamengo", "torcedores" => 18, "posts" => 42],
  "Palmeiras" => ["time" => "Palmeiras", "torcedores" => 16, "posts" => 38],
  "Corinthians" => ["time" => "Corinthians", "torcedores" => 15, "posts" => 35],
  "São Paulo" => ["time" => "São Paulo", "torcedores" => 14, "posts" => 31],
  "Santos" => ["time" => "Santos", "torcedores" => 12, "posts" => 28],
  "Fluminense" => ["time" => "Fluminense", "torcedores" => 11, "posts" => 24],
  "Botafogo" => ["time" => "Botafogo", "torcedores" => 10, "posts" => 22],
  "Vasco" => ["time" => "Vasco", "torcedores" => 9, "posts" => 20],
  "Grêmio" => ["time" => "Grêmio", "torcedores" => 9, "posts" => 19],
  "Internacional" => ["time" => "Internacional", "torcedores" => 8, "posts" => 18],
  "Atlético-MG" => ["time" => "Atlético-MG", "torcedores" => 8, "posts" => 17],
  "Cruzeiro" => ["time" => "Cruzeiro", "torcedores" => 7, "posts" => 16],
  "Real Madrid" => ["time" => "Real Madrid", "torcedores" => 14, "posts" => 30],
  "Barcelona" => ["time" => "Barcelona", "torcedores" => 13, "posts" => 27],
  "PSG" => ["time" => "PSG", "torcedores" => 11, "posts" => 23],
  "Manchester City" => ["time" => "Manchester City", "torcedores" => 10, "posts" => 21],
  "Liverpool" => ["time" => "Liverpool", "torcedores" => 9, "posts" => 19],
  "Bayern Munich" => ["time" => "Bayern Munich", "torcedores" => 8, "posts" => 17],
  "Juventus" => ["time" => "Juventus", "torcedores" => 7, "posts" => 15],
  "Arsenal" => ["time" => "Arsenal", "torcedores" => 7, "posts" => 14]
];

$db = ["usuarios" => []];
if (is_file($DB_FILE)) {
  $raw = @file_get_contents($DB_FILE);
  $j = $raw ? json_decode($raw, true) : null;
  if (is_array($j) && isset($j["usuarios"]) && is_array($j["usuarios"])) $db = $j;
}

foreach ($db["usuarios"] as $u) {
  $time = trim((string) ($u["time"] ?? ""));
  if ($time === "") continue;
  if (!isset($mapa[$time])) {
    $mapa[$time] = ["time" => $time, "torcedores" => 0, "posts" => 0];
  }
  $mapa[$time]["torcedores"]++;
}

$lista = array_values($mapa);
usort($lista, function ($a, $b) {
  if ($a["torcedores"] !== $b["torcedores"]) return $b["torcedores"] <=> $a["torcedores"];
  if ($a["posts"] !== $b["posts"]) return $b["posts"] <=> $a["posts"];
  return strcmp($a["time"], $b["time"]);
});

$ranking = [];
foreach ($lista as $i => $x) {
  $ranking[] = [
    "posicao" => $i + 1,
    "time" => $x["time"],
    "torcedores" => $x["torcedores"],
    "posts" => $x["posts"],
    "pontos" => $x["torcedores"] * 2 + $x["posts"],
    "qtd" => $x["torcedores"],
    "escudo" => crest($x["time"])
  ];
}

echo json_encode(["ranking" => $ranking], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
