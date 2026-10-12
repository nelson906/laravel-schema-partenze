<?php

namespace App\Support;

/**
 * Token di accesso automatico da golf-arbitri-clean.
 *
 * Formato: base64url(json) . '.' . base64url(hmac_sha256(base64url(json), segreto))
 * Payload: {"aud":"partenze","email":...,"name":...,"iat":<unix>,"nonce":...}
 *
 * Il segreto (SSO_SECRET qui, PARTENZE_SSO_SECRET in golf-arbitri-clean) e'
 * lo stesso nelle due app. Il token vale pochi secondi e una volta sola
 * (il nonce viene bruciato da SsoController).
 */
final class SsoToken
{
    public const AUDIENCE = 'partenze';

    public static function make(string $email, string $name, int $issuedAt, string $nonce, string $secret): string
    {
        $json = json_encode([
            'aud'   => self::AUDIENCE,
            'email' => $email,
            'name'  => $name,
            'iat'   => $issuedAt,
            'nonce' => $nonce,
        ], JSON_THROW_ON_ERROR);

        $body = self::b64($json);

        return $body.'.'.self::b64(hash_hmac('sha256', $body, $secret, true));
    }

    /**
     * @return array{email: string, name: string, nonce: string}|null
     */
    public static function verify(string $token, string $secret, int $ttl, int $now): ?array
    {
        if ($secret === '') {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }
        [$body, $signature] = $parts;

        $expected = self::b64(hash_hmac('sha256', $body, $secret, true));
        if (! hash_equals($expected, $signature)) {
            return null;
        }

        $decoded = base64_decode(strtr($body, '-_', '+/'), true);
        if ($decoded === false) {
            return null;
        }
        $data = json_decode($decoded, true);
        if (! is_array($data)) {
            return null;
        }

        $aud   = $data['aud'] ?? null;
        $email = $data['email'] ?? null;
        $name  = $data['name'] ?? null;
        $iat   = $data['iat'] ?? null;
        $nonce = $data['nonce'] ?? null;

        if ($aud !== self::AUDIENCE
            || ! is_string($email) || filter_var($email, FILTER_VALIDATE_EMAIL) === false
            || ! is_int($iat) || abs($now - $iat) > $ttl
            || ! is_string($nonce) || strlen($nonce) < 16 || strlen($nonce) > 64) {
            return null;
        }

        return [
            'email' => $email,
            'name'  => is_string($name) && trim($name) !== '' ? trim($name) : $email,
            'nonce' => $nonce,
        ];
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
