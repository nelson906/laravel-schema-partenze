<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifica i middleware di controllo accesso 'admin' (AdminAccess) e
 * 'super_admin' (SuperAdmin), registrati in bootstrap/app.php.
 *
 *  - /quadranti     → qualunque utente autenticato
 *  - /admin/users   → solo admin e super_admin
 *  - /aruba-admin   → solo super_admin
 */
class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    /* ─── Area Quadranti (solo auth) ─────────────────────── */

    public function test_quadranti_requires_authentication(): void
    {
        $this->get(route('quadranti.index'))
            ->assertRedirect(route('login'));
    }

    public function test_authenticated_user_can_access_quadranti(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('quadranti.index'))
            ->assertOk();
    }

    /* ─── Area Admin (admin + super_admin) ───────────────── */

    public function test_normal_user_is_forbidden_from_admin_area(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('admin.users.index'))
            ->assertForbidden();
    }

    public function test_admin_can_access_admin_area(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->get(route('admin.users.index'))
            ->assertOk();
    }

    public function test_super_admin_can_access_admin_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('admin.users.index'))
            ->assertOk();
    }

    /* ─── Area Aruba Tools (solo super_admin) ────────────── */

    public function test_aruba_tools_requires_authentication(): void
    {
        $this->get(route('aruba.admin.dashboard'))
            ->assertRedirect(route('login'));
    }

    public function test_normal_user_is_forbidden_from_aruba_tools(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('aruba.admin.dashboard'))
            ->assertForbidden();
    }

    public function test_admin_is_forbidden_from_aruba_tools(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->get(route('aruba.admin.dashboard'))
            ->assertForbidden();
    }

    public function test_super_admin_can_access_aruba_tools(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('aruba.admin.dashboard'))
            ->assertOk();
    }
}
