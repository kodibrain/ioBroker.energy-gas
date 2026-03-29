'use strict';
const { parseNum, round, startOfDay, startOfMonth, endOfMonth, addDays } = require('./utils');
const { getTariffForDate, getCurrentTariff, getPreviousTariff, getTariffs } = require('./tariffs');
/**
 * Returns the gas conversion factor from m³ to kWh.
 *
 * @param {object} config Adapter configuration.
 * @returns {number} Conversion factor in kWh per m³.
 */
function getKwhPerM3(config) {
    return parseNum(config.brennwert, 0) * parseNum(config.zustandszahl, 0);
}
/**
 * Calculates the daily base price for a given date.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} dateObj Reference date.
 * @returns {number} Daily base price.
 */
function getDailyBasePrice(config, dateObj) {
    const tariff = getTariffForDate(config, dateObj);
    if (!tariff) {
        return 0;
    }
    const daysInMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
    return tariff.grundgebuehr / daysInMonth;
}
/**
 * Returns the payment amount for a given date.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} dateObj Reference date.
 * @returns {number} Payment amount for the date.
 */
function getPaymentForDate(config, dateObj) {
    const tariff = getTariffForDate(config, dateObj);
    if (!tariff) {
        return 0;
    }
    const dim = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
    const payDay = Math.min(dim, tariff.abschlagTag);
    return dateObj.getDate() === payDay ? tariff.abschlag : 0;
}
/**
 * Calculates energy and work cost for a consumption value.
 *
 * @param {object} config Adapter configuration.
 * @param {number} m3 Gas consumption in m³.
 * @param {Date} dateObj Reference date.
 * @returns {{kwh: number, workCost: number}} Calculated energy and work cost.
 */
function calcCostForConsumption(config, m3, dateObj) {
    const kwhPerM3 = getKwhPerM3(config);
    const kwh = m3 * kwhPerM3;
    const tariff = getTariffForDate(config, dateObj);
    if (!tariff) {
        return { kwh, workCost: 0 };
    }
    return {
        kwh,
        workCost: kwh * tariff.arbeitspreis,
    };
}
/**
 * Counts payments between two dates.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} startDate Start date.
 * @param {Date} endDate End date.
 * @returns {number} Sum of payments in the period.
 */
function countPaymentsBetween(config, startDate, endDate) {
    let sum = 0;
    let d = startOfDay(startDate);
    const end = startOfDay(endDate).getTime();

    while (d.getTime() <= end) {
        sum += getPaymentForDate(config, d);
        d = addDays(d, 1);
    }
    return sum;
}
/**
 * Calculates base cost between two dates.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} startDate Start date.
 * @param {Date} endDate End date.
 * @returns {number} Sum of base cost in the period.
 */
function calcBaseCostBetween(config, startDate, endDate) {
    let total = 0;
    let d = startOfDay(startDate);
    const end = startOfDay(endDate).getTime();

    while (d.getTime() <= end) {
        total += getDailyBasePrice(config, d);
        d = addDays(d, 1);
    }
    return total;
}
/**
 * Calculates live values for the current day.
 *
 * @param {object} config Adapter configuration.
 * @param {*} meterValue Current meter value.
 * @param {*} dayStartValue Meter value at the start of the day.
 * @param {Date} [refDate] Reference date.
 * @returns {{m3: number, kwh: number, kosten: number, abschlaege: number, saldo: number}} Daily live values.
 */
function calcLiveDay(config, meterValue, dayStartValue, refDate = new Date()) {
    const meter = parseNum(meterValue, 0);
    const dayStart = parseNum(dayStartValue, meter);
    const m3 = Math.max(0, meter - dayStart);
    const calc = calcCostForConsumption(config, m3, refDate);
    const cost = calc.workCost + getDailyBasePrice(config, refDate);
    const payment = getPaymentForDate(config, refDate);
    return {
        m3: round(m3, 4),
        kwh: round(calc.kwh, 3),
        kosten: round(cost, 2),
        abschlaege: round(payment, 2),
        saldo: round(payment - cost, 2),
    };
}
/**
 * Returns tariff change points within a period.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} startDate Start date.
 * @param {Date} endDate End date.
 * @returns {Array<object>} Tariff change points in the period.
 */
function getTariffChangePointsWithinPeriod(config, startDate, endDate) {
    const tariffs = getTariffs(config);
    const startTs = startOfDay(startDate).getTime();
    const endTs = startOfDay(endDate).getTime();

    return tariffs.filter(t => {
        const ts = startOfDay(t.start).getTime();
        return ts > startTs && ts <= endTs;
    });
}
/**
 * Calculates a period summary using start and end meter bounds.
 *
 * @param {object} config Adapter configuration.
 * @param {Date} startDate Period start date.
 * @param {*} startMeter Meter value at period start.
 * @param {Date} endDate Period end date.
 * @param {*} endMeter Meter value at period end.
 * @returns {{m3: number, kwh: number, kosten: number, abschlaege: number, saldo: number}} Period summary.
 */
function calcPeriodSummaryByMeterBounds(config, startDate, startMeter, endDate, endMeter) {
    const startTs = startOfDay(startDate).getTime();
    const endTs = startOfDay(endDate).getTime();

    if (endTs < startTs) {
        return { m3: 0, kwh: 0, kosten: 0, abschlaege: 0, saldo: 0 };
    }
    const points = [
        {
            date: startOfDay(startDate),
            meter: parseNum(startMeter, 0),
        },
    ];
    for (const tariff of getTariffChangePointsWithinPeriod(config, startDate, endDate)) {
        points.push({
            date: startOfDay(tariff.start),
            meter: parseNum(tariff.startzaehlerstand, 0),
        });
    }
    points.push({
        date: startOfDay(endDate),
        meter: parseNum(endMeter, 0),
        isEnd: true,
    });
    points.sort((a, b) => a.date.getTime() - b.date.getTime());

    const kwhPerM3 = getKwhPerM3(config);
    let totalM3 = 0;
    let totalKwh = 0;
    let totalWorkCost = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const tariff = getTariffForDate(config, current.date);
        const segmentM3 = Math.max(0, parseNum(next.meter, 0) - parseNum(current.meter, 0));
        const segmentKwh = segmentM3 * kwhPerM3;
        const workPrice = tariff ? parseNum(tariff.arbeitspreis, 0) : 0;
        totalM3 += segmentM3;
        totalKwh += segmentKwh;
        totalWorkCost += segmentKwh * workPrice;
    }

    const baseCost = calcBaseCostBetween(config, startDate, endDate);
    const payments = countPaymentsBetween(config, startDate, endDate);
    const totalCost = totalWorkCost + baseCost;

    return {
        m3: round(totalM3, 4),
        kwh: round(totalKwh, 3),
        kosten: round(totalCost, 2),
        abschlaege: round(payments, 2),
        saldo: round(payments - totalCost, 2),
    };
}
/**
 * Returns an empty totals object.
 *
 * @returns {{m3: number, kwh: number, kosten: number, abschlaege: number, saldo: number}} Empty totals.
 */
function emptyTotals() {
    return {
        m3: 0,
        kwh: 0,
        kosten: 0,
        abschlaege: 0,
        saldo: 0,
    };
}
/**
 * Sums ledger values between two dates.
 *
 * @param {object} config Adapter configuration.
 * @param {object} ledger Ledger data object.
 * @param {Date} fromDate Start date.
 * @param {Date} toDate End date.
 * @returns {{m3: number, kwh: number, kosten: number, abschlaege: number, saldo: number}} Summed totals.
 */
function sumLedgerBetween(config, ledger, fromDate, toDate) {
    const sum = emptyTotals();
    const from = startOfDay(fromDate).getTime();
    const to = startOfDay(toDate).getTime();
    const kwhPerM3 = getKwhPerM3(config);

    for (const key of Object.keys(ledger || {})) {
        const day = new Date(`${key}T00:00:00`);
        const ts = startOfDay(day).getTime();
        if (ts < from || ts > to) {
            continue;
        }
        const m3 = parseNum(ledger[key].m3, 0);
        const kwh = m3 * kwhPerM3;
        const tariff = getTariffForDate(config, day);
        const workPrice = tariff ? parseNum(tariff.arbeitspreis, 0) : 0;
        const kosten = kwh * workPrice + getDailyBasePrice(config, day);
        const abschlaege = getPaymentForDate(config, day);
        sum.m3 += m3;
        sum.kwh += kwh;
        sum.kosten += kosten;
        sum.abschlaege += abschlaege;
        sum.saldo += abschlaege - kosten;
    }

    sum.m3 = round(sum.m3, 4);
    sum.kwh = round(sum.kwh, 3);
    sum.kosten = round(sum.kosten, 2);
    sum.abschlaege = round(sum.abschlaege, 2);
    sum.saldo = round(sum.saldo, 2);
    return sum;
}
/**
 * Builds all output values for adapter states.
 *
 * @param {object} config Adapter configuration.
 * @param {*} meterValue Current meter value.
 * @param {*} dayStartValue Meter value at day start.
 * @param {object} ledger Ledger data object.
 * @param {*} monthStartValue Meter value at month start.
 * @returns {object} Output values keyed by state ID.
 */
function buildOutputValues(config, meterValue, dayStartValue, ledger, monthStartValue) {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = addDays(today, -1);
    const meter = parseNum(meterValue, 0);
    const kwhPerM3 = getKwhPerM3(config);
    const heute = calcLiveDay(config, meter, dayStartValue, now);
    const gestern = sumLedgerBetween(config, ledger, yesterday, yesterday);
    const monthStart = parseNum(monthStartValue, meter);
    const monat = calcPeriodSummaryByMeterBounds(config, startOfMonth(now), monthStart, now, meter);
    const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const letzterMonat = sumLedgerBetween(config, ledger, startOfMonth(prevMonthRef), endOfMonth(prevMonthRef));
    const currentTariff = getCurrentTariff(config, now);
    const abrechnungsjahr = currentTariff
        ? calcPeriodSummaryByMeterBounds(config, currentTariff.start, currentTariff.startzaehlerstand, now, meter)
        : emptyTotals();
    const previousTariff = getPreviousTariff(config, now);
    const letztesAbrechnungsjahr =
        previousTariff && currentTariff
            ? calcPeriodSummaryByMeterBounds(
                  config,
                  previousTariff.start,
                  previousTariff.startzaehlerstand,
                  addDays(currentTariff.start, -1),
                  currentTariff.startzaehlerstand,
              )
            : emptyTotals();

    return {
        'verbrauch.zaehlerstand': round(meter, 4),
        'verbrauch.kwh_pro_m3': round(kwhPerM3, 6),
        'heute.verbrauch': heute.m3,
        'heute.kwh': heute.kwh,
        'heute.kosten': heute.kosten,
        'heute.abschlaege': heute.abschlaege,
        'heute.saldo': heute.saldo,
        'gestern.verbrauch': gestern.m3,
        'gestern.kwh': gestern.kwh,
        'gestern.kosten': gestern.kosten,
        'gestern.abschlaege': gestern.abschlaege,
        'gestern.saldo': gestern.saldo,
        'monat.verbrauch': monat.m3,
        'monat.kwh': monat.kwh,
        'monat.kosten': monat.kosten,
        'monat.abschlaege': monat.abschlaege,
        'monat.saldo': monat.saldo,
        'letzter_monat.verbrauch': letzterMonat.m3,
        'letzter_monat.kwh': letzterMonat.kwh,
        'letzter_monat.kosten': letzterMonat.kosten,
        'letzter_monat.abschlaege': letzterMonat.abschlaege,
        'letzter_monat.saldo': letzterMonat.saldo,
        'abrechnungsjahr.verbrauch': abrechnungsjahr.m3,
        'abrechnungsjahr.kwh': abrechnungsjahr.kwh,
        'abrechnungsjahr.kosten': abrechnungsjahr.kosten,
        'abrechnungsjahr.abschlaege': abrechnungsjahr.abschlaege,
        'abrechnungsjahr.saldo': abrechnungsjahr.saldo,
        'letztes_abrechnungsjahr.verbrauch': letztesAbrechnungsjahr.m3,
        'letztes_abrechnungsjahr.kwh': letztesAbrechnungsjahr.kwh,
        'letztes_abrechnungsjahr.kosten': letztesAbrechnungsjahr.kosten,
        'letztes_abrechnungsjahr.abschlaege': letztesAbrechnungsjahr.abschlaege,
        'letztes_abrechnungsjahr.saldo': letztesAbrechnungsjahr.saldo,
    };
}
/**
 * Closes the previous day and stores the consumption in the ledger.
 *
 * @param {*} dayStartValue Meter value at day start.
 * @param {*} currentMeterValue Current meter value.
 * @param {string} dayStartDate Stored day start date key.
 * @param {object} ledger Ledger data object.
 * @returns {object} Updated ledger object.
 */
function closePreviousDay(dayStartValue, currentMeterValue, dayStartDate, ledger) {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = addDays(today, -1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
        yesterday.getDate(),
    ).padStart(2, '0')}`;

    if (dayStartDate !== yesterdayKey) {
        return ledger;
    }
    const m3 = Math.max(0, parseNum(currentMeterValue, 0) - parseNum(dayStartValue, 0));

    ledger[yesterdayKey] = {
        m3: round(m3, 4),
    };
    return ledger;
}

module.exports = {
    buildOutputValues,
    closePreviousDay,
};
