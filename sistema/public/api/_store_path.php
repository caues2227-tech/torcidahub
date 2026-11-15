<?php
/**
 * Pasta persistente de dados — FORA do deploy Git quando possível.
 * O Git apagava usuarios/votos a cada push (arquivo vazio versionado).
 */
function torcida_store_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;

  $cands = [];
  /* Preferir FORA do DocumentRoot: Git deploy com --delete não apaga */
  $home = getenv("HOME") ?: ($_SERVER["HOME"] ?? getenv("USERPROFILE") ?: "");
  if ($home) $cands[] = rtrim($home, "/\\") . DIRECTORY_SEPARATOR . "torcida_data";

  $doc = $_SERVER["DOCUMENT_ROOT"] ?? "";
  if ($doc) {
    $cands[] = dirname($doc) . DIRECTORY_SEPARATOR . "torcida_data";
    $cands[] = dirname($doc) . DIRECTORY_SEPARATOR . "private_html" . DIRECTORY_SEPARATOR . "torcida_data";
  }

  $tmp = sys_get_temp_dir();
  if ($tmp) $cands[] = rtrim($tmp, "/\\") . DIRECTORY_SEPARATOR . "torcida_data";

  /* último recurso: pasta no repo (dev local) */
  $cands[] = __DIR__ . DIRECTORY_SEPARATOR . "_store";

  foreach ($cands as $d) {
    if (!$d) continue;
    if (!is_dir($d)) @mkdir($d, 0755, true);
    if (!is_dir($d) || !is_writable($d)) continue;
    $probe = $d . DIRECTORY_SEPARATOR . ".write_ok";
    if (@file_put_contents($probe, (string) time()) === false) continue;
    @unlink($probe);
    $ht = $d . DIRECTORY_SEPARATOR . ".htaccess";
    if (!is_file($ht) && stripos($d, "public") !== false) {
      @file_put_contents($ht, "Require all denied\n");
    }
    $dir = $d;
    return $dir;
  }
  $dir = __DIR__ . DIRECTORY_SEPARATOR . "_store";
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  return $dir;
}
