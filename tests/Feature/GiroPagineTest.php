<?php

namespace Tests\Feature;

use App\Enums\UserType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\PendingCommand;
use Tests\TestCase;

/**
 * Giro delle pagine (strumento comune, 2026-10): ogni pagina GET con nome,
 * aperta da ospite e da un utente per ciascun ruolo, non deve andare in errore.
 */
class GiroPagineTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_page_breaks_for_any_role(): void
    {
        foreach (UserType::cases() as $type) {
            User::factory()->create(['user_type' => $type]);
        }

        $command = $this->artisan('verifica:giro-pagine', ['--letture' => true]);
        $this->assertInstanceOf(PendingCommand::class, $command);
        $command->expectsOutputToContain('Letture')
            ->expectsOutputToContain('Nessuna pagina in errore')
            ->assertExitCode(0);
    }
}
