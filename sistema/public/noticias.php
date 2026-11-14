<?php
/**
 * Proxy de notícias para hosting estático (Hostinger PHP).
 * Usa Google News RSS — sem chave de API no front.
 */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=600");
header("Access-Control-Allow-Origin: *");

$max = isset($_GET["max"]) ? max(5, min(60, (int) $_GET["max"])) : 40;
$modo = isset($_GET["modo"]) ? (string) $_GET["modo"] : "global";

$consultas = $modo === "clube" && !empty($_GET["time"])
  ? [trim((string) $_GET["time"]) . " futebol", "brasileirão"]
  : [
      "brasileirão OR futebol brasil",
      "flamengo OR palmeiras OR corinthians OR santos OR \"são paulo\"",
      "mercado da bola OR contratação futebol",
      "libertadores OR \"copa do brasil\""
    ];

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
    "http" => [
      "timeout" => 10,
      "header" => "User-Agent: TorcidaHostinger/1.0\r\n"
    ]
  ]);
  $body = @file_get_contents($url, false, $ctx);
  return $body === false ? null : $body;
}

function parse_rss($xml) {
  $out = [];
  if (!$xml) return $out;
  libxml_use_internal_errors(true);
  $feed = @simplexml_load_string($xml);
  if (!$feed || !isset($feed->channel->item)) return $out;
  foreach ($feed->channel->item as $item) {
    $titulo = trim((string) $item->title);
    $link = trim((string) $item->link);
    $desc = trim(strip_tags((string) $item->description));
    $fonte = "";
    if (isset($item->source)) $fonte = trim((string) $item->source);
    if (!$fonte && isset($item->children("http://purl.org/dc/elements/1.1/")->publisher)) {
      $fonte = trim((string) $item->children("http://purl.org/dc/elements/1.1/")->publisher);
    }
    if (!$fonte && preg_match('/\s-\s([^-]+)$/u', $titulo, $m)) {
      $fonte = trim($m[1]);
      $titulo = trim(preg_replace('/\s-\s[^-]+$/u', "", $titulo));
    }
    $pub = trim((string) $item->pubDate);
    $iso = $pub ? date("c", strtotime($pub)) : date("c");
    if ($titulo === "") continue;
    $out[] = [
      "title" => $titulo,
      "description" => $desc,
      "content" => $desc,
      "url" => $link,
      "image" => null,
      "publishedAt" => $iso,
      "source" => ["name" => $fonte ?: "Google News", "url" => $link]
    ];
  }
  return $out;
}

$vistos = [];
$articles = [];
foreach ($consultas as $q) {
  if (count($articles) >= $max) break;
  $url = "https://news.google.com/rss/search?q=" . rawurlencode($q) . "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
  $xml = baixar($url);
  foreach (parse_rss($xml) as $a) {
    $k = mb_strtolower(mb_substr($a["title"], 0, 48));
    if ($k === "" || isset($vistos[$k])) continue;
    $vistos[$k] = true;
    /* Compatível com o shape do /api/gnews (source como string no front) */
    $articles[] = [
      "title" => $a["title"],
      "description" => $a["description"],
      "content" => $a["content"],
      "url" => $a["url"],
      "image" => $a["image"],
      "publishedAt" => $a["publishedAt"],
      "source" => is_array($a["source"]) ? ($a["source"]["name"] ?? "Google News") : $a["source"]
    ];
    if (count($articles) >= $max) break;
  }
}

echo json_encode([
  "articles" => $articles,
  "total" => count($articles),
  "via" => "google-news-rss",
  "cache" => false
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
