<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * Copre App\Http\Controllers\QuadrantiController.
 *
 * Verifica il rendering della pagina, la validazione del caricamento Excel
 * e l'endpoint delle effemeridi (alba/tramonto).
 */
class QuadrantiTest extends TestCase
{
    use RefreshDatabase;

    public function test_quadranti_page_renders_for_authenticated_user(): void
    {
        $this->actingAs(User::factory()->create())
            ->get(route('quadranti.index'))
            ->assertOk()
            ->assertViewIs('quadranti.index');
    }

    public function test_upload_excel_requires_a_file(): void
    {
        $this->actingAs(User::factory()->create())
            ->post(route('quadranti.upload-excel'), [], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');
    }

    public function test_upload_excel_rejects_non_spreadsheet_files(): void
    {
        $file = UploadedFile::fake()->create('documento.txt', 10);

        $this->actingAs(User::factory()->create())
            ->post(route('quadranti.upload-excel'), ['file' => $file], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');
    }

    public function test_coordinates_returns_sunrise_and_sunset(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson(route('quadranti.coordinates'), [
                'geo_area' => 'CENTRO',
                'start' => '15/06/2026',
            ])
            ->assertOk()
            ->assertJsonStructure(['sunrise', 'sunset']);
    }

    public function test_upload_excel_requires_authentication(): void
    {
        $this->post(route('quadranti.upload-excel'))
            ->assertRedirect(route('login'));
    }
}
