<?php
// EXAMPLE ONLY: replace these keys and checks with the actual Madar account model.
// This file runs on the server. Never derive identity/privilege from request JSON.
// Load existing Madar bootstrap before reading its session if needed.
return static function (): ?array {
    // $account = madar_current_user();
    // return $account ? ['id'=>(string)$account['id'], 'name'=>$account['name'],
    // 'email'=>$account['email'], 'verified'=>(bool)$account['email_verified'],
    // 'active'=>(bool)$account['active'],
    // 'can_use_surveys'=>madar_is_teacher($account)||madar_can($account,'manage_surveys'),
    // 'can_manage_surveys'=>madar_can($account, 'manage_surveys')] : null;
    return null; // fail closed until actual integration is implemented
};
