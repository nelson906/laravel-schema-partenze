<?php

namespace Database\Seeders;

use App\Enums\UserType;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Idempotente. Garantisce che ci sia ALMENO un super_admin.
 *
 * Logica:
 *   1. Se esiste già almeno un super_admin → no-op.
 *   2. Altrimenti, se è stato passato SUPERADMIN_EMAIL via env, promuove quello.
 *   3. Altrimenti, promuove l'user con id più basso (primo registrato).
 *   4. Se non ci sono user, stampa un avviso e non fa nulla.
 */
class PromoteFirstSuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        if (User::where('user_type', UserType::SuperAdmin->value)->exists()) {
            $this->command?->info('Esiste già un super_admin: skip.');
            return;
        }

        // config() e non env(): con la config cachata env() fuori da config/
        // torna null. Normalizzato a stringa non vuota o null.
        $configured = config('app.superadmin_email');
        $email = is_string($configured) && $configured !== '' ? $configured : null;
        $user = $email !== null
            ? User::where('email', $email)->first()
            : User::orderBy('id')->first();

        if (! $user) {
            $this->command?->warn('Nessun user in tabella users — nessuno da promuovere.');
            return;
        }

        $user->user_type = UserType::SuperAdmin;
        $user->is_active = true;
        $user->save();

        $this->command?->info("Promosso a super_admin: {$user->email} (id={$user->id})");
    }
}
