<?php
declare(strict_types=1);

final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(int $length = 20): string
    {
        $bytes = random_bytes($length);
        return self::base32Encode($bytes);
    }

    public static function verify(string $secret, string $code, int $window = 1): bool
    {
        $code = preg_replace('/\D+/', '', $code) ?? '';
        if (strlen($code) !== 6 || $secret === '') return false;
        $counter = intdiv(time(),30);
        for ($offset=-$window;$offset<=$window;$offset++) {
            if (hash_equals(self::at($secret,$counter+$offset),$code)) return true;
        }
        return false;
    }

    public static function at(string $secret, int $counter): string
    {
        $key = self::base32Decode($secret);
        $binary = pack('N*',0) . pack('N*',$counter);
        $hash = hash_hmac('sha1',$binary,$key,true);
        $offset = ord($hash[19]) & 0x0f;
        $value = ((ord($hash[$offset]) & 0x7f) << 24)
            | ((ord($hash[$offset+1]) & 0xff) << 16)
            | ((ord($hash[$offset+2]) & 0xff) << 8)
            | (ord($hash[$offset+3]) & 0xff);
        return str_pad((string)($value % 1000000),6,'0',STR_PAD_LEFT);
    }

    public static function uri(string $secret, string $email, string $issuer = 'Madar'): string
    {
        $label = rawurlencode($issuer . ':' . $email);
        return 'otpauth://totp/' . $label . '?secret=' . rawurlencode($secret) . '&issuer=' . rawurlencode($issuer) . '&digits=6&period=30';
    }

    private static function base32Encode(string $data): string
    {
        $bits='';
        foreach (str_split($data) as $char) $bits .= str_pad(decbin(ord($char)),8,'0',STR_PAD_LEFT);
        $out='';
        foreach (str_split($bits,5) as $chunk) {
            $chunk = str_pad($chunk,5,'0',STR_PAD_RIGHT);
            $out .= self::ALPHABET[bindec($chunk)];
        }
        return $out;
    }

    private static function base32Decode(string $value): string
    {
        $value = strtoupper(preg_replace('/[^A-Z2-7]/','',$value) ?? '');
        $bits='';
        foreach (str_split($value) as $char) {
            $pos = strpos(self::ALPHABET,$char);
            if ($pos === false) continue;
            $bits .= str_pad(decbin($pos),5,'0',STR_PAD_LEFT);
        }
        $out='';
        foreach (str_split($bits,8) as $byte) if (strlen($byte)===8) $out .= chr(bindec($byte));
        return $out;
    }
}
