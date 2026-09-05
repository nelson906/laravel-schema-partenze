<?php

namespace App\Enums;

/**
 * Tipi di utente del sistema (versione standalone Quadranti).
 *
 * - SuperAdmin: accesso totale (CRUD users, Aruba Tools, tutto)
 * - Admin:      può creare/modificare utenti normali (no super_admin)
 * - User:       utente normale, accesso a Quadranti
 */
enum UserType: string
{
    case SuperAdmin = 'super_admin';
    case Admin      = 'admin';
    case User       = 'user';

    public function isAdmin(): bool
    {
        return in_array($this, [self::SuperAdmin, self::Admin], true);
    }

    public function label(): string
    {
        return match ($this) {
            self::SuperAdmin => 'Super Amministratore',
            self::Admin      => 'Amministratore',
            self::User       => 'Utente',
        };
    }

    /**
     * Opzioni per dropdown del form (value => label).
     *
     * @return array<string, string>
     */
    public static function options(): array
    {
        $options = [];

        foreach (self::cases() as $case) {
            $options[$case->value] = $case->label();
        }

        return $options;
    }
}
