<?php

namespace Tests\Feature\Admin;

use App\Enums\UserType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Copre App\Http\Controllers\Admin\UserController.
 *
 * In particolare verifica le guardie di sicurezza che, prima dell'audit,
 * non erano coperte da alcun test:
 *  - solo admin/super_admin accedono al CRUD utenti;
 *  - un admin non-super non puo creare/modificare un super_admin;
 *  - nessun utente puo auto-promuoversi, auto-cancellarsi o auto-disattivarsi.
 */
class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    /* ─── Accesso alla lista ─────────────────────────────── */

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('admin.users.index'))
            ->assertRedirect(route('login'));
    }

    public function test_normal_user_cannot_access_user_list(): void
    {
        $user = User::factory()->create(); // user_type = 'user' (default)

        $this->actingAs($user)
            ->get(route('admin.users.index'))
            ->assertForbidden();
    }

    public function test_admin_can_access_user_list(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->get(route('admin.users.index'))
            ->assertOk();
    }

    /* ─── Creazione utenti ───────────────────────────────── */

    public function test_super_admin_can_create_a_user(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->post(route('admin.users.store'), [
                'name' => 'Nuovo Arbitro',
                'email' => 'arbitro@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'user_type' => UserType::User->value,
            ])
            ->assertRedirect(route('admin.users.index'));

        $this->assertDatabaseHas('users', [
            'email' => 'arbitro@example.com',
            'user_type' => UserType::User->value,
        ]);
    }

    public function test_admin_cannot_create_a_super_admin(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->post(route('admin.users.store'), [
                'name' => 'Aspirante Super',
                'email' => 'aspirante@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'user_type' => UserType::SuperAdmin->value,
            ])
            ->assertSessionHasErrors('user_type');

        $this->assertDatabaseMissing('users', [
            'email' => 'aspirante@example.com',
        ]);
    }

    public function test_super_admin_can_create_another_super_admin(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->post(route('admin.users.store'), [
                'name' => 'Secondo Super',
                'email' => 'super2@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'user_type' => UserType::SuperAdmin->value,
            ])
            ->assertRedirect(route('admin.users.index'));

        $this->assertDatabaseHas('users', [
            'email' => 'super2@example.com',
            'user_type' => UserType::SuperAdmin->value,
        ]);
    }

    /* ─── Protezione dei super_admin ─────────────────────── */

    public function test_admin_cannot_open_edit_form_of_a_super_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->superAdmin()->create();

        $this->actingAs($admin)
            ->get(route('admin.users.edit', $target))
            ->assertForbidden();
    }

    public function test_admin_cannot_update_a_super_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->superAdmin()->create();

        $this->actingAs($admin)
            ->put(route('admin.users.update', $target), [
                'name' => 'Nome Cambiato',
                'email' => $target->email,
                'user_type' => UserType::Admin->value,
            ])
            ->assertForbidden();
    }

    /* ─── Anti auto-promozione / auto-cancellazione ──────── */

    public function test_user_cannot_change_their_own_role(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->put(route('admin.users.update', $superAdmin), [
                'name' => $superAdmin->name,
                'email' => $superAdmin->email,
                'user_type' => UserType::Admin->value, // tentativo di declassarsi
            ])
            ->assertSessionHasErrors('user_type');

        $this->assertSame(UserType::SuperAdmin, $superAdmin->refresh()->user_type);
    }

    public function test_user_cannot_delete_themselves(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->delete(route('admin.users.destroy', $admin))
            ->assertSessionHas('error');

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }

    public function test_user_cannot_deactivate_themselves(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->patch(route('admin.users.toggle-active', $admin))
            ->assertSessionHas('error');

        $this->assertTrue($admin->refresh()->is_active);
    }

    /* ─── Operazioni consentite ──────────────────────────── */

    public function test_super_admin_can_delete_another_user(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $target = User::factory()->create();

        $this->actingAs($superAdmin)
            ->delete(route('admin.users.destroy', $target))
            ->assertRedirect(route('admin.users.index'));

        $this->assertModelMissing($target);
    }

    public function test_toggle_active_flips_the_state(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $target = User::factory()->create(); // is_active = true (default)

        $this->actingAs($superAdmin)
            ->patch(route('admin.users.toggle-active', $target));

        $this->assertFalse($target->refresh()->is_active);

        $this->actingAs($superAdmin)
            ->patch(route('admin.users.toggle-active', $target));

        $this->assertTrue($target->refresh()->is_active);
    }
}
