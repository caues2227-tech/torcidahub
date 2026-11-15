<?php
/**
 * Notícias com foto real obrigatória: ESPN (várias ligas) + Google News com og:image.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=180");
header("Access-Control-Allow-Origin: *");

$max = isset($_GET["max"]) ? max(5, min(60, (int) $_GET["max"])) : 40;
$modo = isset($_GET["modo"]) ? (string) $_GET["modo"] : "global";
$somenteFoto = !isset($_GET["semfoto"]); /* padrão: só com imagem */

function baixar($url, $timeout = 10) {
  if (function_exists("curl_init")) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 5,
      CURLOPT_TIMEOUT => $timeout,
      CURLOPT_USERAGENT => "Mozilla/5.0 (compatible; TorcidaBot/1.1)",
      CURLOPT_SSL_VERIFYPEER => true,
      CURLOPT_ENCODING => ""
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $final = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    if ($body === false || $code >= 400) return [null, $final];
    return [$body, $final];
  }
  $ctx = stream_context_create([
    "http" => ["timeout" => $timeout, "header" => "User-Agent: TorcidaBot/1.1\r\n"]
  ]);
  $body = @file_get_contents($url, false, $ctx);
  return [$body === false ? null : $body, $url];
}

function espn_news($path) {
  list($body) = baixar("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $path . "/news");
  if (!$body) return [];
  $data = json_decode($body, true);
  if (!is_array($data)) return [];
  $out = [];
  foreach (($data["articles"] ?? []) as $a) {
    $img = null;
    foreach (($a["images"] ?? []) as $im) {
      if (!empty($im["url"])) { $img = $im["url"]; break; }
    }
    $title = trim((string) ($a["headline"] ?? $a["description"] ?? ""));
    if ($title === "") continue;
    $desc = trim((string) ($a["description"] ?? ""));
    if ($desc === $title) $desc = "";
    $out[] = [
      "title" => $title,
      "description" => $desc,
      "content" => $desc,
      "url" => ($a["links"]["web"]["href"] ?? "#"),
      "image" => $img,
      "publishedAt" => $a["published"] ?? date("c"),
      "source" => is_array($a["byline"] ?? null) ? "ESPN" : ($a["byline"] ?? "ESPN")
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
    $desc = html_entity_decode(trim(strip_tags($descHtml)), ENT_QUOTES | ENT_HTML5, "UTF-8");
    $desc = preg_replace('/\s+/u', " ", $desc);
    $fonte = "";
    if (isset($item->source)) $fonte = trim((string) $item->source);
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
      "source" => $fonte ?: "Google News"
    ];
  }
  return $out;
}

function og_image($url) {
  if (!$url || strpos($url, "http") !== 0) return [null, $url];
  list($html, $final) = baixar($url, 8);
  if (!$html) return [null, $final ?: $url];
  $img = null;
  if (preg_match('/property=["\']og:image(?::secure_url)?["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $m)) $img = $m[1];
  elseif (preg_match('/content=["\']([^"\']+)["\'][^>]*property=["\']og:image(?::secure_url)?["\']/i', $html, $m)) $img = $m[1];
  elseif (preg_match('/name=["\']twitter:image["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $m)) $img = $m[1];
  elseif (preg_match('/content=["\']([^"\']+)["\'][^>]*name=["\']twitter:image["\']/i', $html, $m)) $img = $m[1];
  if ($img) {
    $img = html_entity_decode($img, ENT_QUOTES | ENT_HTML5, "UTF-8");
    if (strpos($img, "//") === 0) $img = "https:" . $img;
  }
  return [$img, $final ?: $url];
}

$articles = [];
$vistos = [];

/* 1) ESPN — quase sempre tem foto */
$ligas = ["bra.1", "esp.1", "eng.1", "usa.1", "fra.1", "ger.1", "ita.1", "uefa.champions"];
foreach ($ligas as $liga) {
  foreach (espn_news($liga) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    $vistos[$k] = true;
    $articles[] = $a;
  }
}

/* 2) Google News — só entra se der pra achar foto */
$consultas = $modo === "clube" && !empty($_GET["time"])
  ? [trim((string) $_GET["time"]) . " futebol"]
  : [
      "brasileirão OR futebol brasil",
      "flamengo OR palmeiras OR corinthians OR santos",
      "real madrid OR barcelona OR psg OR champions",
      "mercado da bola OR contratação futebol"
    ];

foreach ($consultas as $q) {
  if (count($articles) >= $max + 30) break;
  $url = "https://news.google.com/rss/search?q=" . rawurlencode($q) . "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
  list($xml) = baixar($url);
  foreach (parse_rss($xml) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    $vistos[$k] = true;
    $articles[] = $a;
  }
}

/* 3) og:image / twitter:image nos sem foto (resolve redirect do Google News) */
$tentativas = 0;
foreach ($articles as &$a) {
  if (!empty($a["image"])) continue;
  if ($tentativas >= 14) break;
  $tentativas++;
  list($img, $finalUrl) = og_image($a["url"]);
  if ($finalUrl) $a["url"] = $finalUrl;
  if ($img) $a["image"] = $img;
}
unset($a);

/* 4) Só matéria com foto real */
if ($somenteFoto) {
  $articles = array_values(array_filter($articles, function ($a) {
    return !empty($a["image"]) && strpos($a["image"], "http") === 0;
  }));
}

usort($articles, function ($x, $y) {
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
