<?php

namespace Tests\Feature;

use App\Enums\UserType;
use App\Models\User;
use App\Support\SsoToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Ingresso automatico da golf-arbitri-clean (GET /sso?token=...).
 */
class SsoTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'segreto-di-prova-condiviso-tra-le-due-app';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.sso.secret' => self::SECRET, 'services.sso.ttl' => 60]);
    }

    private function token(string $email = 'arbitro@example.com', ?int $iat = null, string $secret = self::SECRET, string $name = 'Mario Rossi'): string
    {
        return SsoToken::make($email, $name, $iat ?? time(), Str::random(32), $secret);
    }

    public function test_utente_esistente_entra_e_finisce_nel_simulatore(): void
    {
        $user = User::factory()->create(['email' => 'arbitro@example.com']);

        $this->get('/sso?token='.$this->token())
            ->assertRedirect(route('quadranti.index'));

        $this->assertAuthenticatedAs($user);
    }

    public function test_email_riconosciuta_senza_badare_alle_maiuscole(): void
    {
        $user = User::factory()->create(['email' => 'Arbitro@Example.com']);

        $this->get('/sso?token='.$this->token('arbitro@example.com'))->assertRedirect();

        $this->assertAuthenticatedAs($user);
    }

    public function test_utente_nuovo_viene_creato_come_utente_normale(): void
    {
        $this->get('/sso?token='.$this->token('nuovo@example.com', null, self::SECRET, 'Luca Bianchi'))
            ->assertRedirect(route('quadranti.index'));

        $user = User::where('email', 'nuovo@example.com')->firstOrFail();
        $this->assertSame('Luca Bianchi', $user->name);
        $this->assertSame(UserType::User, $user->user_type);
        $this->assertTrue($user->is_active);
        $this->assertAuthenticatedAs($user);
    }

    public function test_account_disattivato_resta_fuori(): void
    {
        User::factory()->create(['email' => 'arbitro@example.com', 'is_active' => false]);

        $this->get('/sso?token='.$this->token())->assertForbidden();
        $this->assertGuest();
    }

    public function test_firma_sbagliata_rifiutata(): void
    {
        User::factory()->create(['email' => 'arbitro@example.com']);

        $this->get('/sso?token='.$this->token('arbitro@example.com', null, 'altro-segreto'))->assertForbidden();
        $this->assertGuest();
    }

    public function test_token_manomesso_rifiutato(): void
    {
        User::factory()->create(['email' => 'arbitro@example.com']);
        User::factory()->create(['email' => 'admin@example.com']);

        [, $firma] = explode('.', $this->token());
        $altroCorpo = explode('.', $this->token('admin@example.com'))[0];

        $this->get('/sso?token='.$altroCorpo.'.'.$firma)->assertForbidden();
        $this->assertGuest();
    }

    public function test_link_scaduto_rifiutato(): void
    {
        User::factory()->create(['email' => 'arbitro@example.com']);

        $this->get('/sso?token='.$this->token('arbitro@example.com', time() - 120))->assertForbidden();
        $this->assertGuest();
    }

    public function test_link_usato_due_volte_rifiutato(): void
    {
        User::factory()->create(['email' => 'arbitro@example.com']);
        $token = $this->token();

        $this->get('/sso?token='.$token)->assertRedirect();
        auth()->logout();

        $this->get('/sso?token='.$token)->assertForbidden();
    }

    public function test_token_assente_o_malformato_rifiutato(): void
    {
        $this->get('/sso')->assertForbidden();
        $this->get('/sso?token=abc')->assertForbidden();
        $this->get('/sso?token=a.b.c')->assertForbidden();
    }

    public function test_senza_segreto_configurato_la_pagina_non_esiste(): void
    {
        config(['services.sso.secret' => null]);

        $this->get('/sso?token='.$this->token())->assertNotFound();
    }
}
