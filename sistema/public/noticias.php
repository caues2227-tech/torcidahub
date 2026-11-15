<?php
/**
 * Notícias com foto real: ESPN (várias ligas) + Google News RSS.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=300");
header("Access-Control-Allow-Origin: *");

$max = isset($_GET["max"]) ? max(5, min(60, (int) $_GET["max"])) : 40;
$modo = isset($_GET["modo"]) ? (string) $_GET["modo"] : "global";

function baixar($url) {
  if (function_exists("curl_init")) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => 10,
      CURLOPT_USERAGENT => "TorcidaHostinger/1.0",
      CURLOPT_SSL_VERIFYPEER => true
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code >= 400) return null;
    return $body;
  }
  $ctx = stream_context_create([
    "http" => ["timeout" => 10, "header" => "User-Agent: TorcidaHostinger/1.0\r\n"]
  ]);
  $body = @file_get_contents($url, false, $ctx);
  return $body === false ? null : $body;
}

function espn_news($path) {
  $body = baixar("https://site.api.espn.com/apis/site/v2/sports/soccer/" . $path . "/news");
  if (!$body) return [];
  $data = json_decode($body, true);
  if (!is_array($data)) return [];
  $out = [];
  foreach (($data["articles"] ?? []) as $a) {
    $img = null;
    if (!empty($a["images"][0]["url"])) $img = $a["images"][0]["url"];
    $title = trim((string) ($a["headline"] ?? $a["description"] ?? ""));
    if ($title === "") continue;
    $out[] = [
      "title" => $title,
      "description" => trim((string) ($a["description"] ?? "")),
      "content" => trim((string) ($a["description"] ?? "")),
      "url" => ($a["links"]["web"]["href"] ?? "#"),
      "image" => $img,
      "publishedAt" => $a["published"] ?? date("c"),
      "source" => $a["byline"] ?? "ESPN"
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
  if (!$url || strpos($url, "http") !== 0) return null;
  $html = baixar($url);
  if (!$html) return null;
  if (preg_match('/property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $m)) return $m[1];
  if (preg_match('/content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']/i', $html, $m)) return $m[1];
  return null;
}

$articles = [];
$vistos = [];

/* 1) ESPN com foto real */
$ligas = ["bra.1", "esp.1", "eng.1", "usa.1", "fra.1", "ger.1", "ita.1"];
foreach ($ligas as $liga) {
  foreach (espn_news($liga) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    $vistos[$k] = true;
    $articles[] = [
      "title" => $a["title"],
      "description" => $a["description"],
      "content" => $a["content"],
      "url" => $a["url"],
      "image" => $a["image"],
      "publishedAt" => $a["publishedAt"],
      "source" => is_array($a["source"]) ? ($a["source"]["name"] ?? "ESPN") : $a["source"]
    ];
  }
}

/* 2) Google News RSS (complementa) */
$consultas = $modo === "clube" && !empty($_GET["time"])
  ? [trim((string) $_GET["time"]) . " futebol"]
  : [
      "brasileirão OR futebol brasil",
      "real madrid OR barcelona OR psg OR champions",
      "mercado da bola OR contratação futebol"
    ];

foreach ($consultas as $q) {
  if (count($articles) >= $max + 20) break;
  $url = "https://news.google.com/rss/search?q=" . rawurlencode($q) . "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
  $xml = baixar($url);
  foreach (parse_rss($xml) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    $vistos[$k] = true;
    $articles[] = [
      "title" => $a["title"],
      "description" => $a["description"],
      "content" => $a["content"],
      "url" => $a["url"],
      "image" => $a["image"],
      "publishedAt" => $a["publishedAt"],
      "source" => $a["source"]
    ];
  }
}

/* 3) Tenta og:image só nos primeiros sem foto (limite pra não estourar timeout) */
$tentativas = 0;
foreach ($articles as &$a) {
  if (!empty($a["image"])) continue;
  if ($tentativas >= 8) break;
  $tentativas++;
  $img = og_image($a["url"]);
  if ($img) $a["image"] = $img;
}
unset($a);

/* Prioriza quem tem foto real */
usort($articles, function ($x, $y) {
  $ix = !empty($x["image"]) ? 0 : 1;
  $iy = !empty($y["image"]) ? 0 : 1;
  if ($ix !== $iy) return $ix <=> $iy;
  return strcmp((string) ($y["publishedAt"] ?? ""), (string) ($x["publishedAt"] ?? ""));
});

$articles = array_slice($articles, 0, $max);

echo json_encode([
  "articles" => $articles,
  "total" => count($articles),
  "via" => "espn+google-news",
  "cache" => false
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
