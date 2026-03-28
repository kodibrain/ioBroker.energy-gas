const { parseDateOnly, startOfDay, parseNum, fmtDate, normalizeDate } = require('./utils');

function getTariffs(config) {
    const tariffs = Array.isArray(config.tariffs) ? config.tariffs : [];

    return tariffs
        .filter(t => t && t.aktiv && t.startdatum)
        .map(t => {
            const normalizedStart = normalizeDate(t.startdatum);

            return {
                aktiv: !!t.aktiv,
                name: t.name || '',
                startdatum: normalizedStart,
                start: parseDateOnly(normalizedStart),
                startzaehlerstand: parseNum(t.startzaehlerstand, 0),
                grundgebuehr: parseNum(t.grundgebuehr, 0),
                arbeitspreis: parseNum(t.arbeitspreis, 0),
                abschlag: parseNum(t.abschlag, 0),
                abschlagTag: Math.max(1, Math.min(31, parseNum(t.abschlagTag, 1)))
            };
        })
        .filter(t => t.start instanceof Date && !isNaN(t.start.getTime()))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function getTariffForDate(config, dateObj) {
    const tariffs = getTariffs(config);
    if (!tariffs.length) return null;

    const ts = startOfDay(dateObj).getTime();
    let current = null;

    for (const tariff of tariffs) {
        if (ts >= startOfDay(tariff.start).getTime()) {
            current = tariff;
        } else {
            break;
        }
    }

    return current;
}

function getCurrentTariff(config, dateObj = new Date()) {
    return getTariffForDate(config, dateObj);
}

function getPreviousTariff(config, dateObj = new Date()) {
    const tariffs = getTariffs(config);
    const current = getCurrentTariff(config, dateObj);
    if (!current) return null;

    const idx = tariffs.findIndex(t => t.start.getTime() === current.start.getTime());
    if (idx <= 0) return null;
    return tariffs[idx - 1];
}

function getNextTariff(config, dateObj = new Date()) {
    const tariffs = getTariffs(config);
    const current = getCurrentTariff(config, dateObj);
    if (!current) return null;

    const idx = tariffs.findIndex(t => t.start.getTime() === current.start.getTime());
    if (idx < 0 || idx >= tariffs.length - 1) return null;
    return tariffs[idx + 1];
}

function hasTariffWithStartDate(config, dateObj) {
    const target = fmtDate(dateObj);
    return getTariffs(config).some(t => t.startdatum === target);
}

function findTariffIndexByStartDate(config, dateObj) {
    const target = fmtDate(dateObj);
    const tariffs = Array.isArray(config.tariffs) ? config.tariffs : [];

    return tariffs.findIndex(t =>
        t &&
        String(t.startdatum || '').trim() === target
    );
}

module.exports = {
    getTariffs,
    getTariffForDate,
    getCurrentTariff,
    getPreviousTariff,
    getNextTariff,
    hasTariffWithStartDate,
    findTariffIndexByStartDate
};