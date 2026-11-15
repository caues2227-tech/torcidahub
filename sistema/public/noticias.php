<?php
/**
 * Notícias com foto REAL obrigatória.
 * ESPN (várias ligas) + Google News só quando o og:image do publisher for válido.
 * Rejeita ícone genérico do Google (lh3…J6_coFb…) que passava como "foto".
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=120");
header("Access-Control-Allow-Origin: *");

$max = isset($_GET["max"]) ? max(5, min(60, (int) $_GET["max"])) : 40;
$modo = isset($_GET["modo"]) ? (string) $_GET["modo"] : "global";
$somenteFoto = !isset($_GET["semfoto"]);

function baixar($url, $timeout = 10) {
  if (!function_exists("curl_init")) {
    $ctx = stream_context_create([
      "http" => ["timeout" => $timeout, "header" => "User-Agent: Mozilla/5.0 TorcidaBot/1.3\r\n", "follow_location" => 1]
    ]);
    $body = @file_get_contents($url, false, $ctx);
    return [$body === false ? null : $body, $url];
  }
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 8,
    CURLOPT_TIMEOUT => $timeout,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_USERAGENT => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_ENCODING => "",
    CURLOPT_HTTPHEADER => ["Accept: text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language: pt-BR,pt;q=0.9,en;q=0.8"]
  ]);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $final = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
  curl_close($ch);
  if ($body === false || $code >= 400) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 8,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_USERAGENT => "Mozilla/5.0 TorcidaBot/1.3",
      CURLOPT_SSL_VERIFYPEER => false,
      CURLOPT_ENCODING => ""
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $final = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    if ($body === false || $code >= 400) return [null, $final];
  }
  return [$body, $final];
}

/** Foto de verdade — corta ícone/placeholder do Google News e logos. */
function imagem_valida($url) {
  if (!$url || !is_string($url)) return false;
  $url = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5, "UTF-8"));
  if (strpos($url, "//") === 0) $url = "https:" . $url;
  if (strpos($url, "http") !== 0) return false;
  $u = mb_strtolower($url);

  $bloqueios = [
    "j6_cofbogxhri9im864nl_ligxvsQp2",
    "j6_cofbogxhri9im864nl_ligxvsqp2",
    "encrypted-tbn",
    "news.google.com/",
    "gstatic.com/images",
    "favicon",
    "sprite",
    "1x1",
    "pixel.gif",
    "blank.gif",
    "placeholder",
    "default-image",
    "no-image",
    "sem-imagem",
    "data:image",
    "/logo.",
    "icon-default",
    "gravatar.com",
    "doubleclick"
  ];
  foreach ($bloqueios as $b) {
    if (strpos($u, $b) !== false) return false;
  }

  /* stub curto do Google (ícone genérico sem path de proxy) */
  if (strpos($u, "googleusercontent.com") !== false) {
    if (preg_match('#googleusercontent\.com/[A-Za-z0-9_-]{8,60}$#', $url)) return false;
    if (strpos($u, "/proxy") === false && strpos($u, "=s") === false && strpos($u, "w=") === false) {
      /* muitos stubs do News são path curto sem query */
      $path = parse_url($url, PHP_URL_PATH) ?: "";
      if (strlen(basename($path)) < 48 && substr_count($path, "/") <= 1) return false;
    }
  }

  return true;
}

function escolher_img_espn($images) {
  if (!is_array($images) || !$images) return null;
  $best = null;
  $bestScore = -1;
  foreach ($images as $im) {
    $url = $im["url"] ?? "";
    if (!imagem_valida($url)) continue;
    $w = (int) ($im["width"] ?? 0);
    $h = (int) ($im["height"] ?? 0);
    $score = ($w * $h) ?: 1;
    if (strpos($url, "espncdn.com/photo") !== false) $score += 100000;
    if ($score > $bestScore) {
      $bestScore = $score;
      $best = $url;
    }
  }
  return $best;
}

function espn_news($path) {
  list($body) = baixar("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $path . "/news", 12);
  if (!$body) return [];
  $data = json_decode($body, true);
  if (!is_array($data)) return [];
  $out = [];
  foreach (($data["articles"] ?? []) as $a) {
    $img = escolher_img_espn($a["images"] ?? []);
    $title = trim((string) ($a["headline"] ?? $a["description"] ?? ""));
    if ($title === "" || !$img) continue;
    $desc = trim((string) ($a["description"] ?? ""));
    if ($desc === $title) $desc = "";
    $by = $a["byline"] ?? "ESPN";
    if (is_array($by)) $by = "ESPN";
    $out[] = [
      "title" => $title,
      "description" => $desc,
      "content" => $desc,
      "url" => ($a["links"]["web"]["href"] ?? "#"),
      "image" => $img,
      "publishedAt" => $a["published"] ?? date("c"),
      "source" => $by ?: "ESPN",
      "via" => "espn"
    ];
  }
  return $out;
}

function parse_rss($xml) {
  $out = [];
  if (!$xml) return $out;
  libxml_use_internal_errors(true);
  $feed = @simplexml_load_string($xml);
  if (!$feed || !isset($feed->channel->item)) return $out;
  foreach ($feed->channel->item as $item) {
    $titulo = html_entity_decode(trim((string) $item->title), ENT_QUOTES | ENT_HTML5, "UTF-8");
    $link = trim((string) $item->link);
    $descHtml = (string) $item->description;
    $img = null;
    if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $descHtml, $m)) $img = $m[1];
    $media = $item->children("http://search.yahoo.com/mrss/");
    if (!$img && isset($media->content)) {
      $attrs = $media->content->attributes();
      if (isset($attrs["url"])) $img = (string) $attrs["url"];
    }
    if (!$img && isset($media->thumbnail)) {
      $attrs = $media->thumbnail->attributes();
      if (isset($attrs["url"])) $img = (string) $attrs["url"];
    }
    if (!$img && isset($item->enclosure)) {
      $attrs = $item->enclosure->attributes();
      $type = (string) ($attrs["type"] ?? "");
      if (strpos($type, "image") === 0 && isset($attrs["url"])) $img = (string) $attrs["url"];
    }
    if ($img && !imagem_valida($img)) $img = null;

    $desc = html_entity_decode(trim(strip_tags($descHtml)), ENT_QUOTES | ENT_HTML5, "UTF-8");
    $desc = preg_replace('/\s+/u', " ", $desc);
    $fonte = "";
    $sourceUrl = "";
    if (isset($item->source)) {
      $fonte = trim((string) $item->source);
      $sa = $item->source->attributes();
      if (isset($sa["url"])) $sourceUrl = trim((string) $sa["url"]);
    }
    if (!$fonte && preg_match('/\s-\s([^-]+)$/u', $titulo, $m)) {
      $fonte = trim($m[1]);
      $titulo = trim(preg_replace('/\s-\s[^-]+$/u', "", $titulo));
    }
    $titulo = preg_replace('/\s+/u', " ", $titulo);
    if ($desc === $titulo) $desc = "";
    $pub = trim((string) $item->pubDate);
    $iso = $pub ? date("c", strtotime($pub)) : date("c");
    if ($titulo === "") continue;
    $out[] = [
      "title" => $titulo,
      "description" => $desc,
      "content" => $desc,
      "url" => $link,
      "image" => $img,
      "publishedAt" => $iso,
      "source" => $fonte ?: "Google News",
      "sourceUrl" => $sourceUrl,
      "via" => "gnews"
    ];
  }
  return $out;
}

function og_image($url) {
  if (!$url || strpos($url, "http") !== 0) return [null, $url];
  list($html, $final) = baixar($url, 9);
  if (!$html) return [null, $final ?: $url];
  /* ainda no domínio Google → sem foto de matéria */
  $host = parse_url($final ?: $url, PHP_URL_HOST) ?: "";
  if (stripos($host, "google.") !== false || stripos($host, "news.google") !== false) {
    return [null, $final ?: $url];
  }
  $img = null;
  $pats = [
    '/property=["\']og:image(?::secure_url)?["\'][^>]*content=["\']([^"\']+)["\']/i',
    '/content=["\']([^"\']+)["\'][^>]*property=["\']og:image(?::secure_url)?["\']/i',
    '/name=["\']twitter:image(?::src)?["\'][^>]*content=["\']([^"\']+)["\']/i',
    '/content=["\']([^"\']+)["\'][^>]*name=["\']twitter:image(?::src)?["\']/i',
    '/rel=["\']image_src["\'][^>]*href=["\']([^"\']+)["\']/i'
  ];
  foreach ($pats as $pat) {
    if (preg_match($pat, $html, $m)) {
      $cand = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, "UTF-8");
      if (strpos($cand, "//") === 0) $cand = "https:" . $cand;
      if (imagem_valida($cand)) { $img = $cand; break; }
    }
  }
  return [$img, $final ?: $url];
}

$articles = [];
$vistos = [];

/* 1) ESPN — foto real (prioridade) */
$ligas = ["bra.1", "esp.1", "eng.1", "usa.1", "fra.1", "ger.1", "ita.1", "uefa.champions", "uefa.europa", "por.1", "ned.1", "mex.1"];
foreach ($ligas as $liga) {
  foreach (espn_news($liga) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    if (!imagem_valida($a["image"] ?? "")) continue;
    $vistos[$k] = true;
    $articles[] = $a;
  }
}

/* 2) Google News — só entra com og:image válido do publisher */
$consultas = $modo === "clube" && !empty($_GET["time"])
  ? [trim((string) $_GET["time"]) . " futebol"]
  : [
      "brasileirão OR futebol brasil",
      "flamengo OR palmeiras OR corinthians OR santos",
      "real madrid OR barcelona OR champions league",
      "mercado da bola OR contratação futebol"
    ];

$gPendentes = [];
foreach ($consultas as $q) {
  if (count($articles) + count($gPendentes) >= $max + 40) break;
  $url = "https://news.google.com/rss/search?q=" . rawurlencode($q) . "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
  list($xml) = baixar($url, 10);
  foreach (parse_rss($xml) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    $vistos[$k] = true;
    if (!empty($a["image"]) && imagem_valida($a["image"])) {
      $articles[] = $a;
    } else {
      $gPendentes[] = $a;
    }
  }
}

/* 3) Resolve og:image (publisher) — máx. 18 tentativas */
$tentativas = 0;
foreach ($gPendentes as $a) {
  if (count($articles) >= $max + 10) break;
  if ($tentativas >= 18) break;
  $tentativas++;
  $alvo = $a["url"];
  list($img, $finalUrl) = og_image($alvo);
  if ($finalUrl) $a["url"] = $finalUrl;
  if ($img && imagem_valida($img)) {
    $a["image"] = $img;
    $articles[] = $a;
  }
}

if ($somenteFoto) {
  $articles = array_values(array_filter($articles, function ($a) {
    return imagem_valida($a["image"] ?? "");
  }));
}

/* ESPN primeiro, depois por data */
usort($articles, function ($x, $y) {
  $vx = (($x["via"] ?? "") === "espn") ? 1 : 0;
  $vy = (($y["via"] ?? "") === "espn") ? 1 : 0;
  if ($vx !== $vy) return $vy <=> $vx;
  return strcmp((string) ($y["publishedAt"] ?? ""), (string) ($x["publishedAt"] ?? ""));
});

$articles = array_slice($articles, 0, $max);

echo json_encode([
  "articles" => $articles,
  "total" => count($articles),
  "via" => "espn+google-news",
  "somenteFoto" => $somenteFoto,
  "cache" => false
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
