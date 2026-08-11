<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/config/bootstrap.php';
require_once dirname(__DIR__).'/api/shared.php';
require_once dirname(__DIR__).'/api/interactive_games.php';
require_once dirname(__DIR__).'/api/interactive_game_builder.php';

function game_asset_fail(int $status=404): never
{
    http_response_code($status);header('Content-Type: text/plain; charset=utf-8');header('Cache-Control: no-store');echo 'ملف اللعبة غير متاح.';exit;
}

try {
    if(!interactive_game_builder_schema_ready())game_asset_fail(503);
    $versionId=filter_var($_GET['version']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if($versionId===false||$versionId===null)game_asset_fail();
    $access=(string)($_GET['access']??'');if(!interactive_game_package_access_valid((int)$versionId,$access))game_asset_fail(403);
    $path=interactive_game_package_safe_path((string)($_GET['path']??''));if($path===null)game_asset_fail();
    $row=fetch_one('SELECT v.storage_key,v.source_type,v.validation_status FROM interactive_game_versions v WHERE v.id=? LIMIT 1',[(int)$versionId]);
    if(!$row||(string)$row['source_type']!=='package'||(string)$row['validation_status']!=='ready')game_asset_fail();
    $root=MADAR_ROOT.'/storage/private/interactive-games/'.(string)$row['storage_key'];$base=realpath($root);$target=realpath($root.'/'.$path);
    if($base===false||$target===false||!str_starts_with($target,$base.DIRECTORY_SEPARATOR)||!is_file($target))game_asset_fail();
    $extension=strtolower(pathinfo($target,PATHINFO_EXTENSION));$types=[
        'html'=>'text/html; charset=utf-8','htm'=>'text/html; charset=utf-8','css'=>'text/css; charset=utf-8','js'=>'text/javascript; charset=utf-8','json'=>'application/json; charset=utf-8',
        'png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp','gif'=>'image/gif','mp3'=>'audio/mpeg','ogg'=>'audio/ogg','wav'=>'audio/wav','m4a'=>'audio/mp4',
        'woff'=>'font/woff','woff2'=>'font/woff2','ttf'=>'font/ttf','otf'=>'font/otf',
    ];
    if(!isset($types[$extension]))game_asset_fail();
    header('Content-Type: '.$types[$extension]);header('X-Content-Type-Options: nosniff');header('Access-Control-Allow-Origin: *');header('Cache-Control: private, max-age=3600');
    header('Content-Disposition: inline; filename="'.rawurlencode(basename($target)).'"');
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    header('Content-Length: '.filesize($target));readfile($target);exit;
} catch(Throwable $error) {error_log('[game-asset] '.$error->getMessage());game_asset_fail(500);}
