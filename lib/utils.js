/**
 *
 * @param v
 */
function pad2(v) {
    return String(v).padStart(2, '0');
}
function parseNum(val, def = 0) {
    if (val === null || val === undefined || val === '') {
        return def;
    }
    const normalized = String(val).replace(',', '.');
    const num = Number(normalized);
    return isFinite(num) ? num : def;
}
function round(v, digits = 3) {
    const p = Math.pow(10, digits);
    return Math.round((parseNum(v, 0) + Number.EPSILON) * p) / p;
}
function cloneDate(d) {
    return new Date(d.getTime());
}
function startOfDay(d) {
    const x = cloneDate(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function addDays(d, days) {
    const x = cloneDate(d);
    x.setDate(x.getDate() + days);
    return x;
}
function addYears(d, years) {
    const x = cloneDate(d);
    x.setFullYear(x.getFullYear() + years);
    return x;
}
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function daysInMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function dateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseDateOnly(str) {
    if (!str || typeof str !== 'string') {
        return null;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
    if (!m) {
        return null;
    }
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
}
function normalizeDate(input) {
    if (!input) {
        return '';
    }
    input = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return input;
    }
    let m = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
        const d = m[1].padStart(2, '0');
        const mo = m[2].padStart(2, '0');
        const y = m[3];
        return `${y}-${mo}-${d}`;
    }
    return input;
}
module.exports = {
    pad2,
    parseNum,
    round,
    cloneDate,
    startOfDay,
    addDays,
    addYears,
    startOfMonth,
    endOfMonth,
    daysInMonth,
    dateKey,
    fmtDate,
    parseDateOnly,
    normalizeDate,
};
