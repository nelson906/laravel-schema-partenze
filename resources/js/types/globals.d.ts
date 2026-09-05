// Globali caricate da CDN/Blade, non importate come moduli.
// Servono solo al type-checker: non finiscono nel bundle.

/** jQuery: caricato nella view quadranti/index.blade.php. */
declare const $: any;
declare const jQuery: any;

/** SheetJS: caricato da CDN per l'export xlsx. */
declare const XLSX: any;

declare const Alpine: any;

interface Window {
    quadrantiApp?: any;
    Alpine?: any;
    axios?: any;
    XLSX?: any;
}
