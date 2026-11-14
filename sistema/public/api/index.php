<?php
/**
 * Auth Torcida para Hostinger (PHP) — espelha /api/login, /api/cadastro, etc.
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

$DATA_DIR = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . "data";
$DB_FILE = $DATA_DIR . DIRECTORY_SEPARATOR . "usuarios.json";

function responder($codigo, $corpo) {
  http_response_code($codigo);
  echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function ler_json() {
  $raw = file_get_contents("php://input");
  if ($raw === false || $raw === "") return [];
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}

function db_load($file) {
  if (!is_file($file)) return ["usuarios" => []];
  $raw = @file_get_contents($file);
  $d = $raw ? json_decode($raw, true) : null;
  if (!is_array($d) || !isset($d["usuarios"]) || !is_array($d["usuarios"])) {
    return ["usuarios" => []];
  }
  return $d;
}

function db_save($file, $dir, $db) {
  if (!is_dir($dir)) {
    if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
      responder(500, ["erro" => "Não foi possível criar pasta de dados.", "codigo" => "storage"]);
    }
  }
  $ok = @file_put_contents($file, json_encode($db, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
  if ($ok === false) {
    responder(500, ["erro" => "Não foi possível gravar a conta. Verifique permissão da pasta data.", "codigo" => "storage"]);
  }
}

function texto($v, $max) {
  $s = trim((string) $v);
  if (function_exists("mb_substr")) return mb_substr($s, 0, $max);
  return substr($s, 0, $max);
}

function usuario_slug($nome) {
  $s = strtolower(trim((string) $nome));
  $s = preg_replace("/[^a-z0-9_]+/", "", iconv("UTF-8", "ASCII//TRANSLIT//IGNORE", $s) ?: $s);
  return $s !== "" ? substr($s, 0, 20) : "torcedor";
}

function crest_url($time) {
  static $map = [
    "Santos" => 2674, "Flamengo" => 819, "Palmeiras" => 2029, "Corinthians" => 874,
    "São Paulo" => 2026, "Grêmio" => 8749, "Internacional" => 2028, "Atlético-MG" => 7632,
    "Atlético Mineiro" => 7632, "Cruzeiro" => 2022, "Botafogo" => 6086, "Vasco" => 2675,
    "Bahia" => 9967, "Fortaleza" => 6270, "Athletico-PR" => 3458, "Athletico Paranaense" => 3458,
    "Fluminense" => 8745, "Bragantino" => 6079, "Red Bull Bragantino" => 6079
  ];
  $id = $map[$time] ?? null;
  if ($id) return "https://a.espncdn.com/i/teamlogos/soccer/500/" . $id . ".png";
  return "";
}

function sessao_publica($user, $token) {
  $time = $user["time"] ?? "Santos";
  return [
    "ok" => true,
    "token" => $token,
    "id" => $user["id"],
    "nome" => $user["nome"],
    "usuario" => $user["usuario"] ?? usuario_slug($user["nome"]),
    "foto" => $user["foto"] ?? crest_url($time),
    "time" => $time,
    "feedTime" => $user["feedTime"] ?? $time,
    "pais" => $user["pais"] ?? "Brasil",
    "papel" => $user["papel"] ?? "torcedor",
    "convidado" => !empty($user["convidado"]),
    "tema" => ["cores" => ["accent" => "#1e90ff"]]
  ];
}

function novo_token() {
  return bin2hex(random_bytes(24));
}

function bearer_token() {
  $h = $_SERVER["HTTP_AUTHORIZATION"] ?? $_SERVER["REDIRECT_HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) return $m[1];
  return "";
}

function achar_por_token($db, $token) {
  if ($token === "") return null;
  foreach ($db["usuarios"] as $u) {
    if (!empty($u["token"]) && hash_equals((string) $u["token"], $token)) {
      if (!empty($u["tokenExp"]) && time() > (int) $u["tokenExp"]) return null;
      return $u;
    }
  }
  return null;
}

$path = parse_url($_SERVER["REQUEST_URI"] ?? "", PHP_URL_PATH);
$path = rawurldecode((string) $path);
/* Aceita /api/login, /sistema/public/api/login.php?… etc. */
if (preg_match('#/api/(login|cadastro|logout|me|senha/esqueci|senha/redefinir)/?$#', $path, $m)) {
  $acao = $m[1];
} elseif (!empty($_GET["acao"])) {
  $acao = (string) $_GET["acao"];
} else {
  responder(404, ["erro" => "Rota não encontrada.", "codigo" => "nao_encontrado"]);
}

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$db = db_load($DB_FILE);

if ($acao === "me" && $method === "GET") {
  $u = achar_por_token($db, bearer_token());
  if (!$u) responder(401, ["erro" => "Sessão inválida.", "codigo" => "sessao_invalida"]);
  responder(200, array_merge(["autenticado" => true], sessao_publica($u, $u["token"])));
}

if ($acao === "logout" && $method === "POST") {
  $token = bearer_token();
  if ($token !== "") {
    foreach ($db["usuarios"] as &$u) {
      if (!empty($u["token"]) && hash_equals((string) $u["token"], $token)) {
        $u["token"] = "";
        $u["tokenExp"] = 0;
        break;
      }
    }
    unset($u);
    db_save($DB_FILE, $DATA_DIR, $db);
  }
  responder(200, ["ok" => true]);
}

if ($acao === "cadastro" && $method === "POST") {
  $b = ler_json();
  $nome = texto($b["nome"] ?? "", 40);
  $email = strtolower(texto($b["email"] ?? "", 120));
  $senha = (string) ($b["senha"] ?? "");
  $time = texto($b["time"] ?? "Santos", 60) ?: "Santos";
  $feed = texto($b["feedTime"] ?? $time, 60) ?: $time;
  if (strlen($nome) < 2) responder(400, ["erro" => "Informe seu nome (mínimo 2 letras).", "codigo" => "invalido", "campo" => "nome"]);
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) responder(400, ["erro" => "Informe um e-mail válido.", "codigo" => "invalido", "campo" => "email"]);
  if (strlen($senha) < 6) responder(400, ["erro" => "A senha precisa ter no mínimo 6 caracteres.", "codigo" => "invalido", "campo" => "senha"]);
  if (strlen($senha) > 128) responder(400, ["erro" => "A senha pode ter no máximo 128 caracteres.", "codigo" => "invalido", "campo" => "senha"]);
  foreach ($db["usuarios"] as $x) {
    if (isset($x["email"]) && strtolower($x["email"]) === $email) {
      responder(409, ["erro" => "E-mail já cadastrado.", "codigo" => "email_em_uso", "campo" => "email"]);
    }
  }
  $token = novo_token();
  $user = [
    "id" => bin2hex(random_bytes(8)),
    "nome" => $nome,
    "usuario" => usuario_slug($b["usuario"] ?? $nome),
    "email" => $email,
    "senhaHash" => password_hash($senha, PASSWORD_DEFAULT),
    "time" => $time,
    "feedTime" => $feed,
    "pais" => "Brasil",
    "papel" => "torcedor",
    "convidado" => false,
    "foto" => crest_url($time),
    "criadoEm" => date("c"),
    "token" => $token,
    "tokenExp" => time() + 60 * 60 * 24 * 60
  ];
  $db["usuarios"][] = $user;
  db_save($DB_FILE, $DATA_DIR, $db);
  responder(201, sessao_publica($user, $token));
}

if ($acao === "login" && $method === "POST") {
  $b = ler_json();
  $email = strtolower(texto($b["email"] ?? "", 120));
  $senha = (string) ($b["senha"] ?? "");
  if ($email === "" || $senha === "") {
    responder(400, ["erro" => "Informe e-mail e senha.", "codigo" => "invalido", "campo" => "email"]);
  }
  $user = null;
  $idx = -1;
  foreach ($db["usuarios"] as $i => $x) {
    if (isset($x["email"]) && strtolower($x["email"]) === $email) {
      $user = $x;
      $idx = $i;
      break;
    }
  }
  if (!$user || empty($user["senhaHash"]) || !password_verify($senha, $user["senhaHash"])) {
    usleep(200000);
    responder(401, ["erro" => "E-mail ou senha inválidos.", "codigo" => "credenciais"]);
  }
  $token = novo_token();
  $db["usuarios"][$idx]["token"] = $token;
  $db["usuarios"][$idx]["tokenExp"] = time() + 60 * 60 * 24 * 60;
  db_save($DB_FILE, $DATA_DIR, $db);
  $user = $db["usuarios"][$idx];
  responder(200, sessao_publica($user, $token));
}

if ($acao === "senha/esqueci" && $method === "POST") {
  $b = ler_json();
  $email = strtolower(texto($b["email"] ?? "", 120));
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    responder(400, ["erro" => "Informe um e-mail válido.", "codigo" => "invalido", "campo" => "email"]);
  }
  /* Sem SMTP neste hosting: não envia e-mail, mas não revela se o e-mail existe. */
  responder(200, [
    "ok" => true,
    "mensagem" => "Se este e-mail estiver cadastrado, use a senha que você criou. Recuperação por e-mail ainda não está ligada neste site."
  ]);
}

if ($acao === "senha/redefinir" && $method === "POST") {
  responder(400, [
    "erro" => "Recuperação por e-mail ainda não está ligada neste site. Entre com sua senha ou crie outra conta.",
    "codigo" => "token_invalido"
  ]);
}

responder(405, ["erro" => "Método não permitido.", "codigo" => "metodo"]);
