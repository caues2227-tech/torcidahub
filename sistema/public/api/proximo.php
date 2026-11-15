<?php
/**
 * Atalho físico /api/proximo.php → mesma lógica do live.php (Hostinger).
 * Também responde em /api/proximo via rewrite.
 */
$_GET["acao"] = "proximo";
require __DIR__ . DIRECTORY_SEPARATOR . "live.php";
