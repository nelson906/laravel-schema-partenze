<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Support\Facades\Event;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
    }

    public function test_users_can_authenticate_using_the_login_screen(): void
    {
        $user = User::factory()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $user = User::factory()->create();

        $this->post('/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_users_can_logout(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/logout');

        $this->assertGuest();
        $response->assertRedirect('/');
    }

    /* ─── Utenti disattivati (is_active = false) ─────────── */

    public function test_inactive_users_can_not_authenticate(): void
    {
        $user = User::factory()->inactive()->create();

        $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertGuest();
    }

    public function test_deactivation_kills_existing_session(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('dashboard'))
            ->assertOk();

        $user->update(['is_active' => false]);

        $this->get(route('dashboard'))
            ->assertRedirect(route('login'));

        $this->assertGuest();
    }

    /* ─── Blocco tentativi (LoginRequest::ensureIsNotRateLimited) ─── */

    public function test_login_is_locked_after_five_failed_attempts(): void
    {
        Event::fake([Lockout::class]);
        $user = User::factory()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->post('/login', ['email' => $user->email, 'password' => 'wrong-password']);
        }

        // Sesto tentativo con la password GIUSTA: resta fuori, scatta il blocco.
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertSessionHasErrors('email');

        $this->assertGuest();
        Event::assertDispatched(Lockout::class);
    }

    public function test_four_failed_attempts_do_not_lock_login(): void
    {
        Event::fake([Lockout::class]);
        $user = User::factory()->create();

        for ($i = 0; $i < 4; $i++) {
            $this->post('/login', ['email' => $user->email, 'password' => 'wrong-password']);
        }

        // Quinto tentativo corretto: ancora sotto la soglia, entra.
        $this->post('/login', ['email' => $user->email, 'password' => 'password']);

        $this->assertAuthenticated();
        Event::assertNotDispatched(Lockout::class);
    }
}
