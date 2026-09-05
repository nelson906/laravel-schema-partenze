<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * QuadrantiController — Simulatore tempi di partenza (quadranti).
 *
 * Estratto dal progetto golf-arbitri-clean (cartella User/) e riadattato a
 * namespace App\Http\Controllers per uso standalone.
 *
 * Endpoint:
 *   GET  /quadranti                   → view del simulatore
 *   POST /quadranti/upload-excel      → carica nomi atleti/atlete da .xlsx
 *   POST /quadranti/coordinates       → alba/tramonto per area geografica
 */
class QuadrantiController extends Controller
{
    /**
     * Display the Quadranti (Starting Times Simulator) interface
     */
    public function index(): View
    {
        return view('quadranti.index');
    }

    /**
     * Handle Excel file upload for player names
     */
    public function uploadExcel(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|mimes:xlsx,xls,csv|max:2048',
        ]);

        try {
            $uploadedFile = $request->file('file');

            // La regola 'required|mimes' garantisce un singolo file valido:
            // il guard serve solo a PHPStan (file() puo' tornare array|null).
            if (! $uploadedFile instanceof UploadedFile) {
                return response()->json(['error' => 'Nessun file ricevuto'], 422);
            }

            $spreadsheet = IOFactory::load($uploadedFile->getPathname());

            $atlete = [];
            $atleti = [];

            $sheetAtlete = $spreadsheet->getSheetByName('Atlete');
            if ($sheetAtlete !== null) {
                $atlete = $this->extractNamesFromWorksheet($sheetAtlete);
            }

            $sheetAtleti = $spreadsheet->getSheetByName('Atleti');
            if ($sheetAtleti !== null) {
                $atleti = $this->extractNamesFromWorksheet($sheetAtleti);
            }

            if (empty($atlete) && empty($atleti)) {
                $sheetCount = $spreadsheet->getSheetCount();
                if ($sheetCount >= 1) {
                    $worksheet = $spreadsheet->getSheet(0);
                    $atleti = $this->extractNamesFromWorksheet($worksheet);
                }
                if ($sheetCount >= 2) {
                    $worksheet = $spreadsheet->getSheet(1);
                    $atlete = $this->extractNamesFromWorksheet($worksheet);
                }
            }

            return response()->json([
                $atlete,
                $atleti,
            ]);
        } catch (\Exception $e) {
            Log::error('Error processing Excel file: '.$e->getMessage());

            return response()->json(['error' => 'Errore nel caricamento del file Excel'], 500);
        }
    }

    /**
     * Estrae i nomi dal foglio di lavoro (colonna B, fallback colonna A).
     *
     * @return list<string>
     */
    private function extractNamesFromWorksheet(Worksheet $worksheet): array
    {
        $names = [];
        $highestRow = $worksheet->getHighestRow();

        for ($row = 2; $row <= $highestRow; $row++) {
            $raw = $worksheet->getCell('B'.$row)->getValue();
            if ($raw === null || $raw === '') {
                $raw = $worksheet->getCell('A'.$row)->getValue();
            }

            // getValue() torna scalar|RichText|null: solo gli scalari sono nomi.
            if (! is_scalar($raw)) {
                continue;
            }

            $name = preg_replace('/^\d+\.?\s*/', '', trim((string) $raw));

            if ($name !== null && $name !== '') {
                $names[] = $name;
            }
        }

        return $names;
    }

    /**
     * Get sunrise and sunset times based on geographic area
     */
    public function getCoordinates(Request $request): JsonResponse
    {
        $geoArea = $request->string('geo_area', 'CENTRO')->toString();
        $date = $request->string('start', date('d/m/Y'))->toString();

        $coordinates = [
            'NORD OVEST' => ['lat' => 45.4642, 'lon' => 9.1900],
            'NORD' => ['lat' => 45.4408, 'lon' => 10.9936],
            'NORD EST' => ['lat' => 45.4654, 'lon' => 13.4500],
            'CENTRO' => ['lat' => 41.9028, 'lon' => 12.4964],
            'CENTRO SUD' => ['lat' => 40.8518, 'lon' => 14.2681],
            'SUD EST' => ['lat' => 41.1171, 'lon' => 16.8719],
            'SUD OVEST' => ['lat' => 38.1157, 'lon' => 13.3615],
            'SARDEGNA' => ['lat' => 40.1209, 'lon' => 9.0129],
        ];

        $coord = $coordinates[$geoArea] ?? $coordinates['CENTRO'];

        try {
            $dateParts = preg_split('/[\/\-]/', $date);
            if ($dateParts === false || count($dateParts) !== 3) {
                throw new \Exception('Invalid date format: '.$date);
            }

            $giorno = intval($dateParts[0]);
            $mese = intval($dateParts[1]);
            $anno = intval($dateParts[2]);

            if ($giorno < 1 || $giorno > 31 || $mese < 1 || $mese > 12 || $anno < 2000 || $anno > 2100) {
                throw new \Exception('Invalid date values: '.$date);
            }

            $dateTime = new \DateTime;
            $dateTime->setDate($anno, $mese, $giorno);
            $dateTime->setTime(12, 0, 0);

            $lat = $coord['lat'];
            $lon = $coord['lon'];

            // DateInterval::\$days e' int|false: senza cast il calcolo
            // diventa aritmetica su false.
            $n = (int) $dateTime->diff(new \DateTime('2000-01-01'))->days;
            $L = fmod(280.460 + 0.9856474 * $n, 360);
            $g = fmod(357.528 + 0.9856003 * $n, 360);
            $lambda = $L + 1.915 * sin(deg2rad($g)) + 0.020 * sin(deg2rad(2 * $g));
            $epsilon = 23.439 - 0.0000004 * $n;
            $delta = rad2deg(asin(sin(deg2rad($epsilon)) * sin(deg2rad($lambda))));
            $E = -1.915 * sin(deg2rad($g)) - 0.020 * sin(deg2rad(2 * $g)) + 2.466 * sin(deg2rad(2 * $lambda)) - 0.053 * sin(deg2rad(4 * $lambda));
            $E = $E * 4 / 60;

            $cosH = (sin(deg2rad(-0.833)) - sin(deg2rad($lat)) * sin(deg2rad($delta))) / (cos(deg2rad($lat)) * cos(deg2rad($delta)));

            if ($cosH < -1) {
                return response()->json(['sunrise' => '00:00', 'sunset' => '23:59']);
            } elseif ($cosH > 1) {
                return response()->json(['sunrise' => '--:--', 'sunset' => '--:--']);
            }

            $H = rad2deg(acos($cosH));
            $transit = 12 - $E - ($lon / 15);
            $sunrise_local = $transit - ($H / 15);
            $sunset_local = $transit + ($H / 15);

            $timezone_offset = 1;
            $lastSundayMarch = new \DateTime("last sunday of march $anno");
            $lastSundayOctober = new \DateTime("last sunday of october $anno");
            if ($dateTime >= $lastSundayMarch && $dateTime < $lastSundayOctober) {
                $timezone_offset = 2;
            }

            $sunrise_final = $sunrise_local + $timezone_offset;
            $sunset_final = $sunset_local + $timezone_offset;

            $sunrise_h = floor($sunrise_final);
            $sunrise_m = round(($sunrise_final - $sunrise_h) * 60);
            $sunset_h = floor($sunset_final);
            $sunset_m = round(($sunset_final - $sunset_h) * 60);
            if ($sunrise_m >= 60) { $sunrise_h++; $sunrise_m -= 60; }
            if ($sunset_m >= 60)  { $sunset_h++;  $sunset_m  -= 60; }

            return response()->json([
                'sunrise' => sprintf('%02d:%02d', $sunrise_h, $sunrise_m),
                'sunset'  => sprintf('%02d:%02d', $sunset_h,  $sunset_m),
            ]);
        } catch (\Exception $e) {
            Log::error('Error calculating ephemeris data: '.$e->getMessage());

            return response()->json(['sunrise' => '06:30', 'sunset' => '18:30']);
        }
    }
}
