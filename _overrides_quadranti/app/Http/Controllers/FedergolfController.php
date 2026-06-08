<?php

namespace App\Http\Controllers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * FedergolfController — Integrazione con federgolf.it via WordPress admin-ajax.
 *
 * Estratto dal progetto golf-arbitri-clean e riadattato a namespace
 * App\Http\Controllers per uso standalone.
 *
 * Endpoint:
 *   POST /user/federgolf/load-all  → tutte le gare federgolf future dell'anno
 *   POST /user/federgolf/iscritti  → iscritti ammessi per una gara
 *
 * Cache 60s per gara_id sugli iscritti (evita rate-limit di federgolf.it).
 */
class FedergolfController extends Controller
{
    /**
     * Carica iscritti di una gara specifica.
     *
     * Stati possibili:
     *   - 'ready': gara chiusa con iscritti ammessi → usa $iscritti
     *   - 'open':  ci sono iscritti ma nessuno ancora ammesso (lista non chiusa)
     *   - 'empty': gara senza iscritti
     *   - 'error': rete/timeout/HTTP error (federgolf.it non risponde)
     */
    public function getIscritti(Request $request)
    {
        $garaId = $request->input('gara_id');

        $cacheKey = "federgolf.iscritti.{$garaId}";
        $payload = Cache::remember($cacheKey, 60, fn () => $this->fetchIscritti($garaId));

        if (($payload['state'] ?? null) === 'error') {
            Cache::forget($cacheKey);
        }

        return response()->json($payload);
    }

    protected function fetchIscritti(string|int|null $garaId): array
    {
        try {
            $response = Http::timeout(60)
                ->connectTimeout(10)
                ->asForm()
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept' => 'application/json',
                    'X-Requested-With' => 'XMLHttpRequest',
                ])
                ->post(config('services.federgolf.ajax_url'), [
                    'action' => 'competition-player-list',
                    'competition_id' => $garaId,
                    'page_number' => 1,
                    'page_size' => 250,
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Federgolf timeout/connect getIscritti', [
                'gara_id' => $garaId,
                'error' => $e->getMessage(),
            ]);

            return [
                'state' => 'error',
                'iscritti' => [],
                'message' => 'Federgolf.it non risponde (timeout). Riprovare tra qualche secondo.',
            ];
        }

        if (! $response->successful()) {
            return [
                'state' => 'error',
                'iscritti' => [],
                'message' => 'Federgolf.it ha risposto con errore HTTP '.$response->status().'.',
            ];
        }

        $data = $response->json();
        $entries = $data['data']['processedData'] ?? [];

        $iscritti = [];
        $totale = count($entries);
        $ammessi = 0;

        foreach ($entries as $entry) {
            $isAmmesso = isset($entry[8]) && (strpos($entry[8], 'icona-ammesso') !== false || strpos($entry[8], 'icona-wildcard') !== false);
            if (! $isAmmesso) {
                continue;
            }
            $ammessi++;
            if (preg_match('/<span class="nome-giocatore">([^<]+)<\/span>/', $entry[1], $matches)) {
                $iscritti[] = trim(html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            }
        }

        if ($totale === 0) {
            return [
                'state' => 'empty',
                'iscritti' => [],
                'message' => 'Gara senza iscritti.',
            ];
        }
        if ($ammessi === 0) {
            return [
                'state' => 'open',
                'iscritti' => [],
                'message' => 'Iscrizioni non ancora chiuse: nessun iscritto ammesso. Riprovare dopo la chiusura.',
            ];
        }

        return [
            'state' => 'ready',
            'iscritti' => $iscritti,
            'message' => null,
        ];
    }

    public function loadAllCompetitions(Request $request)
    {
        try {
            $response = Http::timeout(30)
                ->asForm()
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept' => 'application/json',
                    'X-Requested-With' => 'XMLHttpRequest',
                ])
                ->post(config('services.federgolf.ajax_url'), [
                    'action' => 'competitions-search',
                    'tipo' => '',
                    'keyword' => '',
                    'anno' => date('Y'),
                    'mese' => '',
                ]);

            if (! $response->successful()) {
                return response()->json(['success' => false, 'message' => 'Errore connessione']);
            }

            $data = $response->json();
            $oggi = new \DateTime;
            $gare = [];

            foreach ($data['data'] ?? [] as $gara) {
                if ($gara['annullata'] == 1) {
                    continue;
                }
                if (
                    stripos($gara['nome'], 'ANNULLATA') !== false ||
                    stripos($gara['nome'], 'RINVIATA') !== false ||
                    stripos($gara['nome'], 'RINVIATO') !== false
                ) {
                    continue;
                }

                $dataGara = \DateTime::createFromFormat('d/m/Y', $gara['data']);
                if ($dataGara && $dataGara < $oggi) {
                    continue;
                }

                $tipo = 'MISTA';
                if (stripos($gara['nome'], 'MASCHILE') !== false) {
                    $tipo = 'MASCHILE';
                } elseif (stripos($gara['nome'], 'FEMMINILE') !== false) {
                    $tipo = 'FEMMINILE';
                }

                $gare[] = [
                    'id' => $gara['competition_id'],
                    'title' => $gara['nome'],
                    'tipo' => $tipo,
                    'date' => $gara['data'],
                    'club' => $gara['club'] ?? null,
                ];
            }

            usort($gare, function ($a, $b) {
                $dateA = \DateTime::createFromFormat('d/m/Y', $a['date']);
                $dateB = \DateTime::createFromFormat('d/m/Y', $b['date']);

                return $dateA <=> $dateB;
            });

            return response()->json(['success' => true, 'gare' => $gare]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }
}
