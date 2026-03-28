async function ensureStates(adapter) {
    const defs = [
        //
        ['info.connection', 'Verbindung', 'boolean', 'indicator.connected', ''],

        // Basis
        ['verbrauch.zaehlerstand', 'Zählerstand', 'number', 'value', 'm³', true],
        ['verbrauch.counter', 'Counter', 'number', 'value', ''],
        ['verbrauch.kwh_pro_m3', 'Umrechnung kWh pro m³', 'number', 'value', 'kWh/m³'],

        // Heute
        ['heute.verbrauch', 'Heute Verbrauch', 'number', 'value', 'm³'],
        ['heute.kwh', 'Heute Energie', 'number', 'value', 'kWh'],
        ['heute.kosten', 'Heute Kosten', 'number', 'value', '€'],
        ['heute.abschlaege', 'Heute Abschläge', 'number', 'value', '€'],
        ['heute.saldo', 'Heute Saldo', 'number', 'value', '€'],

        // Gestern
        ['gestern.verbrauch', 'Gestern Verbrauch', 'number', 'value', 'm³'],
        ['gestern.kwh', 'Gestern Energie', 'number', 'value', 'kWh'],
        ['gestern.kosten', 'Gestern Kosten', 'number', 'value', '€'],
        ['gestern.abschlaege', 'Gestern Abschläge', 'number', 'value', '€'],
        ['gestern.saldo', 'Gestern Saldo', 'number', 'value', '€'],

        // Monat
        ['monat.verbrauch', 'Monat Verbrauch', 'number', 'value', 'm³'],
        ['monat.kwh', 'Monat Energie', 'number', 'value', 'kWh'],
        ['monat.kosten', 'Monat Kosten', 'number', 'value', '€'],
        ['monat.abschlaege', 'Monat Abschläge', 'number', 'value', '€'],
        ['monat.saldo', 'Monat Saldo', 'number', 'value', '€'],

        // Letzter Monat
        ['letzter_monat.verbrauch', 'Letzter Monat Verbrauch', 'number', 'value', 'm³'],
        ['letzter_monat.kwh', 'Letzter Monat Energie', 'number', 'value', 'kWh'],
        ['letzter_monat.kosten', 'Letzter Monat Kosten', 'number', 'value', '€'],
        ['letzter_monat.abschlaege', 'Letzter Monat Abschläge', 'number', 'value', '€'],
        ['letzter_monat.saldo', 'Letzter Monat Saldo', 'number', 'value', '€'],

        // Abrechnungsjahr
        ['abrechnungsjahr.verbrauch', 'Abrechnungsjahr Verbrauch', 'number', 'value', 'm³'],
        ['abrechnungsjahr.kwh', 'Abrechnungsjahr Energie', 'number', 'value', 'kWh'],
        ['abrechnungsjahr.kosten', 'Abrechnungsjahr Kosten', 'number', 'value', '€'],
        ['abrechnungsjahr.abschlaege', 'Abrechnungsjahr Abschläge', 'number', 'value', '€'],
        ['abrechnungsjahr.saldo', 'Abrechnungsjahr Saldo', 'number', 'value', '€'],

        // Letztes Abrechnungsjahr
        ['letztes_abrechnungsjahr.verbrauch', 'Letztes Abrechnungsjahr Verbrauch', 'number', 'value', 'm³'],
        ['letztes_abrechnungsjahr.kwh', 'Letztes Abrechnungsjahr Energie', 'number', 'value', 'kWh'],
        ['letztes_abrechnungsjahr.kosten', 'Letztes Abrechnungsjahr Kosten', 'number', 'value', '€'],
        ['letztes_abrechnungsjahr.abschlaege', 'Letztes Abrechnungsjahr Abschläge', 'number', 'value', '€'],
        ['letztes_abrechnungsjahr.saldo', 'Letztes Abrechnungsjahr Saldo', 'number', 'value', '€'],

        // Intern
        ['_intern.day_start', 'Tagesstart', 'number', 'value', 'm³'],
        ['_intern.day_start_date', 'Tagesstart Datum', 'string', 'text', ''],
        ['_intern.ledger_json', 'Ledger Daten', 'string', 'json', ''],
        ['_intern.monat_start', 'Monatsstart', 'number', 'value', 'm³'],
        ['_intern.monat_marker', 'Monatsmarker', 'string', 'text', ''],
        ['_intern.counter_offset_m3', 'Counter Offset', 'number', 'value', 'm³'],
        ['_intern.counter_last_raw', 'Letzter Counter Rohwert', 'string', 'text', ''],
        ['_intern.counter_pulse_total', 'Counter Impulse Gesamt', 'number', 'value', ''],
        ['_intern.counter_detected_type', 'Erkannter Counter-Typ', 'string', 'text', '']
    ];

    for (const [id, name, type, role, unit, writeOverride] of defs) {
        await adapter.extendObjectAsync(id, {
            type: 'state',
            common: {
                name,
                type,
                role,
                read: true,
                write: writeOverride === true || id.startsWith('_intern'),
                unit
            },
            native: {}
        });
    }
}

module.exports = {
    ensureStates
};
