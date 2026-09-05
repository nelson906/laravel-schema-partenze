<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Testing\TestResponse;

abstract class TestCase extends BaseTestCase
{
    /**
     * Estrae una chiave JSON come stringa.
     *
     * TestResponse::json() torna `mixed`: passarlo dritto a
     * assertStringContainsString nasconde il caso "la chiave non c'e'"
     * dietro un errore di tipo poco leggibile. Qui il fallimento dice
     * subito quale chiave manca.
     *
     * @template TResp of \Symfony\Component\HttpFoundation\Response
     *
     * @param  TestResponse<TResp>  $response
     */
    protected function jsonString(TestResponse $response, string $key): string
    {
        $value = $response->json($key);

        $this->assertIsString($value, "La chiave JSON '{$key}' non e' una stringa.");

        return $value;
    }

    /**
     * Estrae una chiave JSON come lista di righe associative.
     *
     * @template TResp of \Symfony\Component\HttpFoundation\Response
     *
     * @param  TestResponse<TResp>  $response
     * @return list<array<string, mixed>>
     */
    protected function jsonList(TestResponse $response, string $key): array
    {
        $value = $response->json($key);

        $this->assertIsArray($value, "La chiave JSON '{$key}' non e' un array.");

        $rows = [];

        foreach ($value as $row) {
            $this->assertIsArray($row, "La chiave JSON '{$key}' contiene una riga non associativa.");

            // json_decode puo' produrre chiavi intere: normalizzate a stringa
            // per avere una shape dichiarabile.
            $riga = [];
            foreach ($row as $chiave => $valore) {
                $riga[(string) $chiave] = $valore;
            }

            $rows[] = $riga;
        }

        return $rows;
    }
}
