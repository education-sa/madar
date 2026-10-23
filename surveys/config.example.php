<?php
// Copy to config.php OUTSIDE public/. Use HTTPS in production.
return [
 'dsn' => 'mysql:host=localhost;dbname=madar;charset=utf8mb4',
 'db_user' => 'madar', 'db_password' => '',
 'base_url' => 'https://example.com/surveys/public', // public/ URL, no trailing slash
 'auth_mode' => 'madar', // single sign-on with the existing Madar accounts
 // Trusted adapter returns ['id'=>string,'name'=>string,'email'=>string,
 // 'verified'=>bool,'active'=>bool,'can_use_surveys'=>bool,'can_manage_surveys'=>bool], or null.
 'identity_adapter' => __DIR__ . '/app/madar-identity.php', // trusted Madar session adapter
 'madar_login_url' => '/login.html?role=teacher',
 'madar_session_name' => 'madar_session',
 'session_name' => 'madar_surveys', 'cookie_secure' => true,
 'mail_from' => 'noreply@example.com',
 'mail_transport' => null, // optional trusted PHP callable file returning function($to,$subject,$body): bool
 'logo_dir' => __DIR__ . '/storage/logos', // outside web root
 'default_school_identity' => '', // explicitly assigned standalone email or madar external id
 'default_school_name' => 'مجمع مدارس ظليم للبنات',
];
