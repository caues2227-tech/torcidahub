<?php
/**
 * Social da Nação (Hostinger): posts, seguir, curtir, comentar.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
header("Access-Control-Allow-Origin: *");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Torcida-Cliente, X-Torcida-Time, X-Torcida-Nome");
  http_response_code(204);
  exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . "_store_path.php";
$STORE = torcida_store_dir();
$FILE = $STORE . DIRECTORY_SEPARATOR . "social.json";

function ok($body, $code = 200) {
  http_response_code($code);
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function load_db($file) {
  if (!is_file($file)) return ["posts" => [], "follows" => [], "usuarios" => []];
  $j = json_decode(@file_get_contents($file), true);
  if (!is_array($j)) return ["posts" => [], "follows" => [], "usuarios" => []];
  if (!isset($j["posts"])) $j["posts"] = [];
  if (!isset($j["follows"])) $j["follows"] = [];
  if (!isset($j["usuarios"])) $j["usuarios"] = [];
  return $j;
}

function save_db($file, $dir, $db) {
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  @file_put_contents($file, json_encode($db, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

function cid() {
  $c = preg_replace('/[^a-zA-Z0-9_\-.]/', "", $_SERVER["HTTP_X_TORCIDA_CLIENTE"] ?? "");
  return $c !== "" ? substr($c, 0, 80) : ("ip_" . substr(hash("sha256", $_SERVER["REMOTE_ADDR"] ?? "0"), 0, 16));
}

function nome_req() {
  $n = rawurldecode($_SERVER["HTTP_X_TORCIDA_NOME"] ?? "");
  return $n !== "" ? mb_substr($n, 0, 40) : "Torcedor";
}

function time_req() {
  $t = rawurldecode($_SERVER["HTTP_X_TORCIDA_TIME"] ?? "");
  return $t !== "" ? mb_substr($t, 0, 60) : "Santos";
}

function handle_de($nome, $id) {
  $s = strtolower(preg_replace('/[^a-z0-9]+/i', "", iconv("UTF-8", "ASCII//TRANSLIT//IGNORE", $nome) ?: $nome));
  if ($s === "") $s = "torcedor";
  return "@" . substr($s, 0, 16);
}

$path = parse_url($_SERVER["REQUEST_URI"] ?? "", PHP_URL_PATH);
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$acao = $_GET["acao"] ?? "";
if (preg_match('#/api/social/(feed|post|seguir|curtir|comentar|perfil)/?$#', $path, $m)) $acao = $m[1];
if ($acao === "") ok(["erro" => "Rota não encontrada"], 404);

$db = load_db($FILE);
$me = cid();
$meuNome = nome_req();
$meuTime = time_req();
$meuHandle = handle_de($meuNome, $me);

/* registra presença */
$db["usuarios"][$me] = [
  "id" => $me,
  "nome" => $meuNome,
  "handle" => $meuHandle,
  "time" => $meuTime,
  "vistoEm" => date("c")
];

if ($acao === "feed" && $method === "GET") {
  $posts = array_values($db["posts"]);
  usort($posts, function ($a, $b) {
    return strcmp((string) ($b["ts"] ?? ""), (string) ($a["ts"] ?? ""));
  });
  $posts = array_slice($posts, 0, 80);
  $seguindo = $db["follows"][$me] ?? [];
  ok([
    "posts" => $posts,
    "seguindo" => array_keys($seguindo),
    "usuarios" => array_values($db["usuarios"]),
    "eu" => ["id" => $me, "nome" => $meuNome, "handle" => $meuHandle, "time" => $meuTime]
  ]);
}

if ($acao === "perfil" && $method === "GET") {
  $handle = $_GET["handle"] ?? $meuHandle;
  $posts = array_values(array_filter($db["posts"], function ($p) use ($handle, $me) {
    return ($p["handle"] ?? "") === $handle || ($p["autorId"] ?? "") === $me;
  }));
  usort($posts, function ($a, $b) { return strcmp((string) ($b["ts"] ?? ""), (string) ($a["ts"] ?? "")); });
  $seguidores = 0;
  foreach ($db["follows"] as $quem => $mapa) {
    if (!empty($mapa[$handle]) || !empty($mapa[$me])) $seguidores++;
  }
  $seguindoN = count($db["follows"][$me] ?? []);
  ok([
    "perfil" => [
      "handle" => $handle,
      "nome" => $meuNome,
      "time" => $meuTime,
      "posts" => count($posts),
      "seguindo" => $seguindoN,
      "seguidores" => $seguidores
    ],
    "posts" => array_slice($posts, 0, 50),
    "seguindoLista" => array_keys($db["follows"][$me] ?? [])
  ]);
}

$raw = file_get_contents("php://input");
$b = $raw ? json_decode($raw, true) : [];
if (!is_array($b)) $b = [];

if ($acao === "post" && $method === "POST") {
  $texto = trim((string) ($b["texto"] ?? ""));
  if (mb_strlen($texto) < 1) ok(["erro" => "Escreva algo pra postar."], 400);
  if (mb_strlen($texto) > 500) $texto = mb_substr($texto, 0, 500);
  $id = "p" . bin2hex(random_bytes(6));
  $post = [
    "id" => $id,
    "tipo" => "torcedor",
    "autorId" => $me,
    "nome" => $meuNome,
    "handle" => $meuHandle,
    "time" => $meuTime,
    "texto" => $texto,
    "ts" => date("c"),
    "quando" => "agora",
    "likes" => 0,
    "reposts" => 0,
    "comentarios" => 0,
    "comentariosLista" => [],
    "curtidas" => [],
    "secao" => "clube"
  ];
  $db["posts"][$id] = $post;
  save_db($FILE, $STORE, $db);
  ok(["ok" => true, "post" => $post], 201);
}

if ($acao === "seguir" && $method === "POST") {
  $alvo = trim((string) ($b["handle"] ?? $b["alvo"] ?? ""));
  if ($alvo === "") ok(["erro" => "Informe quem seguir."], 400);
  if (!isset($db["follows"][$me])) $db["follows"][$me] = [];
  $on = !empty($db["follows"][$me][$alvo]);
  if ($on) unset($db["follows"][$me][$alvo]);
  else $db["follows"][$me][$alvo] = date("c");
  save_db($FILE, $STORE, $db);
  ok(["ok" => true, "seguindo" => !$on, "handle" => $alvo]);
}

if ($acao === "curtir" && $method === "POST") {
  $pid = (string) ($b["postId"] ?? "");
  if ($pid === "" || !isset($db["posts"][$pid])) ok(["erro" => "Post não encontrado."], 404);
  $p = &$db["posts"][$pid];
  if (!isset($p["curtidas"]) || !is_array($p["curtidas"])) $p["curtidas"] = [];
  $on = !empty($p["curtidas"][$me]);
  if ($on) {
    unset($p["curtidas"][$me]);
    $p["likes"] = max(0, (int) ($p["likes"] ?? 0) - 1);
    $p["minhaReacao"] = null;
  } else {
    $p["curtidas"][$me] = "amor";
    $p["likes"] = (int) ($p["likes"] ?? 0) + 1;
    $p["minhaReacao"] = "amor";
  }
  unset($p);
  save_db($FILE, $STORE, $db);
  ok(["ok" => true, "curtido" => !$on, "likes" => $db["posts"][$pid]["likes"]]);
}

if ($acao === "comentar" && $method === "POST") {
  $pid = (string) ($b["postId"] ?? "");
  $texto = trim((string) ($b["texto"] ?? ""));
  if ($pid === "" || !isset($db["posts"][$pid])) ok(["erro" => "Post não encontrado."], 404);
  if ($texto === "") ok(["erro" => "Comentário vazio."], 400);
  $cmt = [
    "id" => "c" . bin2hex(random_bytes(4)),
    "autorId" => $me,
    "nome" => explode(" ", $meuNome)[0],
    "handle" => $meuHandle,
    "texto" => mb_substr($texto, 0, 280),
    "quando" => "agora",
    "likes" => 0
  ];
  if (!isset($db["posts"][$pid]["comentariosLista"]) || !is_array($db["posts"][$pid]["comentariosLista"])) {
    $db["posts"][$pid]["comentariosLista"] = [];
  }
  array_unshift($db["posts"][$pid]["comentariosLista"], $cmt);
  $db["posts"][$pid]["comentarios"] = count($db["posts"][$pid]["comentariosLista"]);
  save_db($FILE, $STORE, $db);
  ok(["ok" => true, "comentario" => $cmt, "comentarios" => $db["posts"][$pid]["comentarios"]]);
}

ok(["erro" => "Método não permitido"], 405);
