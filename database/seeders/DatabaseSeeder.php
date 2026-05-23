<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed dell'applicazione.
     *
     * Non crea utenti fittizi: l'unico seeding necessario e garantire che
     * esista almeno un super_admin (vedi PromoteFirstSuperAdminSeeder).
     */
    public function run(): void
    {
        $this->call(PromoteFirstSuperAdminSeeder::class);
    }
}
