/**
 * Ensures that all required adapter states exist.
 *
 * @param {ioBroker.Adapter} adapter Adapter instance used to create or update states.
 * @returns {Promise<void>}
 */
async function ensureStates(adapter) {
    const defs = [
        ['info.connection', 'Connection', 'boolean', 'indicator.connected', ''],
        ['consumption.meter_reading', 'Meter reading', 'number', 'value', 'm³', true],
        ['consumption.counter', 'Counter', 'number', 'value', ''],
        ['consumption.kwh_per_m3', 'Conversion kWh per m³', 'number', 'value', 'kWh/m³'],
        ['today.consumption', 'Today consumption', 'number', 'value', 'm³'],
        ['today.kwh', 'Today energy', 'number', 'value', 'kWh'],
        ['today.cost', 'Today cost', 'number', 'value', '€'],
        ['today.payments', 'Today payments', 'number', 'value', '€'],
        ['today.balance', 'Today balance', 'number', 'value', '€'],
        ['yesterday.consumption', 'Yesterday consumption', 'number', 'value', 'm³'],
        ['yesterday.kwh', 'Yesterday energy', 'number', 'value', 'kWh'],
        ['yesterday.cost', 'Yesterday cost', 'number', 'value', '€'],
        ['yesterday.payments', 'Yesterday payments', 'number', 'value', '€'],
        ['yesterday.balance', 'Yesterday balance', 'number', 'value', '€'],
        ['month.consumption', 'Month consumption', 'number', 'value', 'm³'],
        ['month.kwh', 'Month energy', 'number', 'value', 'kWh'],
        ['month.cost', 'Month cost', 'number', 'value', '€'],
        ['month.payments', 'Month payments', 'number', 'value', '€'],
        ['month.balance', 'Month balance', 'number', 'value', '€'],
        ['last_month.consumption', 'Last month consumption', 'number', 'value', 'm³'],
        ['last_month.kwh', 'Last month energy', 'number', 'value', 'kWh'],
        ['last_month.cost', 'Last month cost', 'number', 'value', '€'],
        ['last_month.payments', 'Last month payments', 'number', 'value', '€'],
        ['last_month.balance', 'Last month balance', 'number', 'value', '€'],
        ['billing_year.consumption', 'Billing year consumption', 'number', 'value', 'm³'],
        ['billing_year.kwh', 'Billing year energy', 'number', 'value', 'kWh'],
        ['billing_year.cost', 'Billing year cost', 'number', 'value', '€'],
        ['billing_year.payments', 'Billing year payments', 'number', 'value', '€'],
        ['billing_year.balance', 'Billing year balance', 'number', 'value', '€'],
        ['last_billing_year.consumption', 'Last billing year consumption', 'number', 'value', 'm³'],
        ['last_billing_year.kwh', 'Last billing year energy', 'number', 'value', 'kWh'],
        ['last_billing_year.cost', 'Last billing year cost', 'number', 'value', '€'],
        ['last_billing_year.payments', 'Last billing year payments', 'number', 'value', '€'],
        ['last_billing_year.balance', 'Last billing year balance', 'number', 'value', '€'],
        ['_internal.day_start', 'Day start', 'number', 'value', 'm³'],
        ['_internal.day_start_date', 'Day start date', 'string', 'text', ''],
        ['_internal.ledger_json', 'Ledger data', 'string', 'json', ''],
        ['_internal.month_start', 'Month start', 'number', 'value', 'm³'],
        ['_internal.month_marker', 'Month marker', 'string', 'text', ''],
        ['_internal.counter_offset_m3', 'Counter offset', 'number', 'value', 'm³'],
        ['_internal.counter_last_raw', 'Last raw counter value', 'string', 'text', ''],
        ['_internal.counter_pulse_total', 'Total counter pulses', 'number', 'value', ''],
        ['_internal.counter_detected_type', 'Detected counter type', 'string', 'text', ''],
    ];
    for (const [id, name, type, role, unit, writeOverride] of defs) {
        await adapter.extendObjectAsync(id, {
            type: 'state',
            common: {
                name,
                type,
                role,
                read: true,
                write: writeOverride === true || id.startsWith('_internal'),
                unit,
            },
            native: {},
        });
    }
}
module.exports = {
    ensureStates,
};
