<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/config/bootstrap.php';
require_once dirname(__DIR__).'/api/shared.php';
require_once dirname(__DIR__).'/api/interactive_games.php';
require_once dirname(__DIR__).'/api/interactive_game_builder.php';

try {
    $user=Auth::user();if(!$user)throw new RuntimeException();$gameId=filter_var($_GET['game']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if(!$gameId)throw new RuntimeException();
    $game=fetch_one('SELECT id,teacher_id,cover_stored_name,cover_mime_type,cover_size_bytes,lifecycle_status FROM teacher_interactive_games WHERE id=? AND deleted_at IS NULL LIMIT 1',[(int)$gameId]);if(!$game||empty($game['cover_stored_name']))throw new RuntimeException();
    if(($user['role']??'')==='teacher') {
        if((int)$game['teacher_id']!==(int)$user['id'])throw new RuntimeException();
    } elseif(($user['role']??'')==='student') {
        $allowed=fetch_one("SELECT 1 AS ok FROM students s JOIN classes c ON c.id=s.class_id JOIN teacher_school_settings ss ON ss.teacher_id=c.teacher_id JOIN interactive_game_publications p ON p.class_id=c.id AND p.game_id=? AND p.academic_year=c.academic_year AND p.semester=ss.current_semester AND p.status='published' WHERE s.id=? LIMIT 1",[(int)$gameId,(int)$user['id']]);if(!$allowed)throw new RuntimeException();
    } else throw new RuntimeException();
    $name=basename((string)$game['cover_stored_name']);$path=MADAR_ROOT.'/storage/private/interactive-game-covers/'.$name;if(!is_file($path))throw new RuntimeException();
    header('Content-Type: '.(string)$game['cover_mime_type']);header('Content-Length: '.filesize($path));header('X-Content-Type-Options: nosniff');header('Cache-Control: private, max-age=3600');readfile($path);exit;
}catch(Throwable){http_response_code(404);exit;}
