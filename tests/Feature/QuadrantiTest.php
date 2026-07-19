<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use Tests\TestCase;

/**
 * Copre App\Http\Controllers\QuadrantiController.
 *
 * Verifica il rendering della pagina, la validazione del caricamento Excel,
 * l'estrazione dei nomi dai fogli e l'endpoint delle effemeridi.
 *
 * NOTA sui valori attesi di alba/tramonto: sono test di CARATTERIZZAZIONE.
 * I valori sono stati calcolati replicando esattamente l'algoritmo del
 * controller (run 2026-07-19) e "pinnano" il comportamento attuale: ogni
 * mutazione dell'aritmetica delle effemeridi (coefficenti solari, fuso,
 * ora legale, arrotondamenti) fa fallire il test. Se l'algoritmo cambia
 * DI PROPOSITO, ricalcolare i valori attesi.
 */
class QuadrantiTest extends TestCase
{
    use RefreshDatabase;

    /* ─── pagina e validazione upload ────────────────────── */

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

    public function test_upload_excel_requires_authentication(): void
    {
        $this->post(route('quadranti.upload-excel'))
            ->assertRedirect(route('login'));
    }

    /* ─── upload Excel: estrazione nomi ──────────────────── */

    /**
     * Crea un vero file .xlsx temporaneo e lo incapsula in UploadedFile.
     *
     * @param  array<string, array<int, array{0: string|null, 1: string|null}>>  $sheets
     *                                                                                    nome foglio => righe [colA, colB] (la riga 1 è sempre header)
     */
    private function makeXlsx(array $sheets): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $spreadsheet->removeSheetByIndex(0);

        foreach ($sheets as $title => $rows) {
            $worksheet = $spreadsheet->createSheet();
            $worksheet->setTitle($title);
            $worksheet->setCellValue('A1', 'Header A');
            $worksheet->setCellValue('B1', 'Header B');
            $r = 2;
            foreach ($rows as [$colA, $colB]) {
                if ($colA !== null) {
                    $worksheet->setCellValue('A'.$r, $colA);
                }
                if ($colB !== null) {
                    $worksheet->setCellValue('B'.$r, $colB);
                }
                $r++;
            }
        }

        $path = tempnam(sys_get_temp_dir(), 'quadranti_test_').'.xlsx';
        (new XlsxWriter($spreadsheet))->save($path);

        return new UploadedFile($path, 'giocatori.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }

    public function test_upload_excel_extracts_names_from_named_sheets(): void
    {
        $file = $this->makeXlsx([
            'Atlete' => [
                [null, '1. Maria Verdi'],       // prefisso numerico con punto: va rimosso
                [null, '2 Anna Neri'],           // prefisso numerico senza punto: va rimosso
                ['Giulia Blu', null],            // colonna B vuota: fallback su colonna A
                [null, '  Sara Rosa  '],         // spazi: trim
            ],
            'Atleti' => [
                [null, 'Mario Rossi'],
                [null, null],                    // riga vuota: saltata
                [null, '10.Luigi Bianchi'],      // "10." attaccato al nome
            ],
        ]);

        $this->actingAs(User::factory()->create())
            ->post(route('quadranti.upload-excel'), ['file' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertExactJson([
                ['Maria Verdi', 'Anna Neri', 'Giulia Blu', 'Sara Rosa'],
                ['Mario Rossi', 'Luigi Bianchi'],
            ]);
    }

    public function test_upload_excel_header_row_is_skipped(): void
    {
        // L'estrazione parte dalla riga 2: "Header B" non deve comparire.
        $file = $this->makeXlsx([
            'Atleti' => [
                [null, 'Mario Rossi'],
            ],
        ]);

        $response = $this->actingAs(User::factory()->create())
            ->post(route('quadranti.upload-excel'), ['file' => $file], ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertSame([[], ['Mario Rossi']], $response->json());
    }

    public function test_upload_excel_falls_back_to_positional_sheets(): void
    {
        // Nessun foglio si chiama Atlete/Atleti: foglio 0 => atleti, foglio 1 => atlete.
        $file = $this->makeXlsx([
            'Foglio1' => [[null, 'Mario Rossi']],
            'Foglio2' => [[null, 'Maria Verdi']],
        ]);

        $this->actingAs(User::factory()->create())
            ->post(route('quadranti.upload-excel'), ['file' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertExactJson([
                ['Maria Verdi'],   // indice 0 = atlete (foglio 1)
                ['Mario Rossi'],   // indice 1 = atleti (foglio 0)
            ]);
    }

    public function test_upload_excel_single_unnamed_sheet_goes_to_atleti(): void
    {
        $file = $this->makeXlsx([
            'Foglio1' => [[null, 'Mario Rossi'], [null, 'Luigi Bianchi']],
        ]);

        $this->actingAs(User::factory()->create())
            ->post(route('quadranti.upload-excel'), ['file' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertExactJson([
                [],
                ['Mario Rossi', 'Luigi Bianchi'],
            ]);
    }

    /* ─── effemeridi: valori pinnati ─────────────────────── */

    private function coordinates(string $geoArea, string $start): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs(User::factory()->create())
            ->postJson(route('quadranti.coordinates'), [
                'geo_area' => $geoArea,
                'start' => $start,
            ]);
    }

    /**
     * Estate (ora legale, offset +2), 15/06/2026: un valore esatto per ogni
     * area geografica. Uccide i mutanti su coordinate e aritmetica solare.
     */
    public function test_coordinates_summer_exact_values_for_every_area(): void
    {
        $expected = [
            'NORD OVEST' => ['05:34', '21:13'],
            'NORD' => ['05:27', '21:06'],
            'NORD EST' => ['05:17', '20:56'],
            'CENTRO' => ['05:34', '20:47'],
            'CENTRO SUD' => ['05:31', '20:36'],
            'SUD EST' => ['05:19', '20:27'],
            'SUD OVEST' => ['05:43', '20:31'],
            'SARDEGNA' => ['05:54', '20:55'],
        ];

        $user = User::factory()->create();

        foreach ($expected as $area => [$sunrise, $sunset]) {
            $this->actingAs($user)
                ->postJson(route('quadranti.coordinates'), ['geo_area' => $area, 'start' => '15/06/2026'])
                ->assertOk()
                ->assertExactJson(['sunrise' => $sunrise, 'sunset' => $sunset]);
        }
    }

    public function test_coordinates_winter_exact_values(): void
    {
        // 15/01/2026: ora solare, offset +1.
        $this->coordinates('CENTRO', '15/01/2026')
            ->assertOk()
            ->assertExactJson(['sunrise' => '07:35', 'sunset' => '17:04']);

        $this->coordinates('NORD', '15/01/2026')
            ->assertOk()
            ->assertExactJson(['sunrise' => '07:52', 'sunset' => '16:59']);
    }

    public function test_coordinates_dst_boundaries(): void
    {
        // 29/03/2026 = ultima domenica di marzo: ora legale GIÀ attiva (>=).
        $this->coordinates('CENTRO', '29/03/2026')
            ->assertExactJson(['sunrise' => '06:58', 'sunset' => '19:32']);

        // 28/03/2026, giorno prima: ancora ora solare.
        $this->coordinates('CENTRO', '28/03/2026')
            ->assertExactJson(['sunrise' => '05:59', 'sunset' => '18:31']);

        // 25/10/2026 = ultima domenica di ottobre: ora legale GIÀ finita (<).
        $this->coordinates('CENTRO', '25/10/2026')
            ->assertExactJson(['sunrise' => '06:34', 'sunset' => '17:14']);
    }

    public function test_coordinates_accepts_dashes_and_year_bounds(): void
    {
        // Separatore '-' equivalente a '/'.
        $this->coordinates('CENTRO', '15-01-2026')
            ->assertExactJson(['sunrise' => '07:35', 'sunset' => '17:04']);

        // Estremi validi dell'intervallo anni [2000, 2100].
        $this->coordinates('CENTRO', '01/01/2000')
            ->assertExactJson(['sunrise' => '07:38', 'sunset' => '16:49']);

        $this->coordinates('CENTRO', '31/12/2100')
            ->assertExactJson(['sunrise' => '07:37', 'sunset' => '16:48']);
    }

    public function test_coordinates_unknown_area_falls_back_to_centro(): void
    {
        $this->coordinates('ATLANTIDE', '15/06/2026')
            ->assertExactJson(['sunrise' => '05:34', 'sunset' => '20:47']);
    }

    public function test_coordinates_defaults_to_centro_when_area_missing(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson(route('quadranti.coordinates'), ['start' => '15/06/2026'])
            ->assertExactJson(['sunrise' => '05:34', 'sunset' => '20:47']);
    }

    /**
     * Date invalide: fallback fisso 06:30 / 18:30.
     */
    public function test_coordinates_invalid_dates_fall_back(): void
    {
        $fallback = ['sunrise' => '06:30', 'sunset' => '18:30'];

        foreach ([
            '32/01/2026',   // giorno > 31
            '00/01/2026',   // giorno < 1
            '15/13/2026',   // mese > 12
            '15/00/2026',   // mese < 1
            '15/01/1999',   // anno < 2000
            '15/01/2101',   // anno > 2100
            '15/01',        // solo 2 parti
            'garbage',      // non è una data
        ] as $badDate) {
            $this->coordinates('CENTRO', $badDate)
                ->assertOk()
                ->assertExactJson($fallback);
        }
    }
}
