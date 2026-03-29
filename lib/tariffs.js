'use strict';
const { parseDateOnly, startOfDay, parseNum, fmtDate, normalizeDate } = require('./utils');
/**
 * Returns all valid tariffs from the adapter config.
 *
 * @param {object} config Adapter configuration.
 * @returns {Array<object>} Sorted tariff list.
 */
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
                abschlagTag: Math.max(1, Math.min(31, parseNum(t.abschlagTag, 1))),
            };
        })
        .filter(t => t.start instanceof Date && !isNaN(t.start.getTime()))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
}
/**
 * Returns the tariff that is active for the given date.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} dateObj Date to check.
 * @returns {object|null} Active tariff or null.
 */
function getTariffForDate(config, dateObj) {
    const tariffs = getTariffs(config);
    if (!tariffs.length) {
        return null;
    }
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
/**
 * Returns the current tariff.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} [dateObj] Reference date.
 * @returns {object|null} Current tariff or null.
 */
function getCurrentTariff(config, dateObj = new Date()) {
    return getTariffForDate(config, dateObj);
}
/**
 * Returns the tariff before the current tariff.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} [dateObj] Reference date.
 * @returns {object|null} Previous tariff or null.
 */
function getPreviousTariff(config, dateObj = new Date()) {
    const tariffs = getTariffs(config);
    const current = getCurrentTariff(config, dateObj);
    if (!current) {
        return null;
    }
    const idx = tariffs.findIndex(t => t.start.getTime() === current.start.getTime());
    if (idx <= 0) {
        return null;
    }
    return tariffs[idx - 1];
}
/**
 * Returns the tariff after the current tariff.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} [dateObj] Reference date.
 * @returns {object|null} Next tariff or null.
 */
function getNextTariff(config, dateObj = new Date()) {
    const tariffs = getTariffs(config);
    const current = getCurrentTariff(config, dateObj);
    if (!current) {
        return null;
    }
    const idx = tariffs.findIndex(t => t.start.getTime() === current.start.getTime());
    if (idx < 0 || idx >= tariffs.length - 1) {
        return null;
    }
    return tariffs[idx + 1];
}
/**
 * Checks whether a tariff with the given start date exists.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} dateObj Date to check.
 * @returns {boolean} True if a tariff exists for the date.
 */
function hasTariffWithStartDate(config, dateObj) {
    const target = fmtDate(dateObj);
    return getTariffs(config).some(t => t.startdatum === target);
}
/**
 * Finds the raw tariff row index by start date.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} dateObj Date to check.
 * @returns {number} Index in config.tariffs or -1.
 */
function findTariffIndexByStartDate(config, dateObj) {
    const target = fmtDate(dateObj);
    const tariffs = Array.isArray(config.tariffs) ? config.tariffs : [];

    return tariffs.findIndex(t => t && String(t.startdatum || '').trim() === target);
}
module.exports = {
    getTariffs,
    getTariffForDate,
    getCurrentTariff,
    getPreviousTariff,
    getNextTariff,
    hasTariffWithStartDate,
    findTariffIndexByStartDate,
};
