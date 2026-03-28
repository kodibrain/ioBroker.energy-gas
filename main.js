'use strict';

const utils = require('@iobroker/adapter-core');
const { ensureStates } = require('./lib/states');
const { buildOutputValues, closePreviousDay } = require('./lib/engine');
const { getTariffs, getCurrentTariff, findTariffIndexByStartDate } = require('./lib/tariffs');

const { dateKey, addYears, fmtDate, parseNum } = require('./lib/utils');

class EnergyGas extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'energy-gas',
        });

        this.refreshTimer = null;
        this.ownStateIds = new Set(['verbrauch.zaehlerstand']);
        this.lastPulseTs = 0;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async updateConnection(isConnected) {
        await this.setStateAsync('info.connection', { val: !!isConnected, ack: true }).catch(() => {});
    }

    async onReady() {
        await ensureStates(this);
        await this.updateConnection(false);

        const inputStateId = this.getConfiguredInputStateId();
        if (!inputStateId) {
            this.log.warn(`Adapter noch nicht aktiv: ${this.getMissingInputMessage()}`);
            return;
        }

        const tariffs = getTariffs(this.config);
        if (!tariffs.length) {
            this.log.warn('Adapter noch nicht aktiv: Kein aktiver Tarif vorhanden');
            return;
        }

        const meterValue = await this.readCurrentMeterValue();
        if (meterValue === null) {
            this.log.warn(`Adapter noch nicht aktiv: ${this.getInvalidInputMessage()}`);
            return;
        }

        await this.initCounterBaselineIfNeeded();
        await this.initDayStartIfNeeded(meterValue);
        await this.initMonthStartIfNeeded(meterValue);

        const updateMode = this.config.updateMode || 'both';
        const updateIntervalSeconds = Number(this.config.updateIntervalSeconds || 5);

        if (updateMode === 'change' || updateMode === 'both') {
            await this.subscribeConfiguredInputState();
        }

        if (this.getSourceType() === 'counter') {
            await this.subscribeStatesAsync('verbrauch.zaehlerstand');
        }

        if (updateMode === 'interval' || updateMode === 'both') {
            this.refreshTimer = this.setInterval(async () => {
                try {
                    await this.handlePeriodicUpdate();
                } catch (e) {
                    this.log.warn(`Intervall-Update übersprungen: ${e.message}`);
                }
            }, updateIntervalSeconds * 1000);
        }

        await this.updateConnection(true);
        await this.handlePeriodicUpdate();
    }

    async onStateChange(id, state) {
        if (!state) {
            return;
        }

        if (id === `${this.namespace}.verbrauch.zaehlerstand` && state.ack !== true) {
            try {
                await this.handleManualMeterCorrection(state.val);
                await this.updateConnection(true);
            } catch (e) {
                await this.updateConnection(false);
                this.log.warn(`Manuelle Zählerstandskorrektur fehlgeschlagen: ${e.message}`);
            }
            return;
        }

        if (id !== this.getConfiguredInputStateId()) {
            return;
        }

        this.log.debug(`Zählerstandsänderung erkannt: ${id} = ${state.val}`);

        try {
            if (this.getSourceType() === 'counter') {
                await this.processCounterInputChange(state.val);
            }

            const meterValue = await this.readCurrentMeterValue();
            if (meterValue === null) {
                throw new Error(this.getInvalidInputMessage());
            }

            await this.handleValueUpdate(meterValue);
            await this.updateConnection(true);
        } catch (e) {
            await this.updateConnection(false);
            this.log.warn(`Verarbeitung bei Zählerstandsänderung fehlgeschlagen: ${e.message}`);
        }
    }

    getSourceType() {
        return this.config.sourceType === 'counter' ? 'counter' : 'meter';
    }

    getConfiguredInputStateId() {
        const sourceType = this.getSourceType();
        if (sourceType === 'counter') {
            return this.config.counterState && String(this.config.counterState).trim()
                ? String(this.config.counterState).trim()
                : '';
        }
        return this.config.meterState && String(this.config.meterState).trim()
            ? String(this.config.meterState).trim()
            : '';
    }

    getMissingInputMessage() {
        return this.getSourceType() === 'counter'
            ? 'Kein Counter-Datenpunkt gesetzt'
            : 'Kein Gaszähler-Datenpunkt gesetzt';
    }

    getInvalidInputMessage() {
        const inputStateId = this.getConfiguredInputStateId();
        return this.getSourceType() === 'counter'
            ? `Counter-Datenpunkt liefert keinen gültigen Wert (${inputStateId})`
            : `Gaszähler-Datenpunkt liefert keinen gültigen Wert (${inputStateId})`;
    }

    async subscribeConfiguredInputState() {
        const inputStateId = this.getConfiguredInputStateId();
        if (!inputStateId) {
            return;
        }
        await this.subscribeForeignStatesAsync(inputStateId);
    }

    getCounterFactor() {
        return parseNum(this.config.counterFactor, NaN);
    }

    getCounterDebounceMs() {
        const value = Number(this.config.counterDebounceMs);
        return Number.isFinite(value) && value >= 0 ? value : 200;
    }

    getConfiguredCounterType() {
        const type = String(this.config.counterType || 'auto').trim();
        return ['auto', 'numeric', 'boolean'].includes(type) ? type : 'auto';
    }

    normalizeCounterRawValue(rawValue) {
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return null;
        }

        if (typeof rawValue === 'boolean' || typeof rawValue === 'number') {
            return rawValue;
        }

        const str = String(rawValue).trim();
        if (!str) {
            return null;
        }

        if (str.toLowerCase() === 'true') {
            return true;
        }
        if (str.toLowerCase() === 'false') {
            return false;
        }

        const num = parseNum(str, NaN);
        if (Number.isFinite(num)) {
            return num;
        }

        return str;
    }

    detectCounterType(rawValue) {
        if (typeof rawValue === 'boolean') {
            return 'boolean';
        }
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            return 'numeric';
        }
        return null;
    }

    async getDetectedCounterType(rawValue = undefined) {
        const configuredType = this.getConfiguredCounterType();
        if (configuredType !== 'auto') {
            return configuredType;
        }

        const existing = await this.getStateAsync('_intern.counter_detected_type');
        if (existing && existing.val) {
            const saved = String(existing.val);
            if (saved === 'numeric' || saved === 'boolean') {
                return saved;
            }
        }

        const normalized = rawValue === undefined ? undefined : this.normalizeCounterRawValue(rawValue);
        const detected = this.detectCounterType(normalized);

        if (detected) {
            await this.setStateAsync('_intern.counter_detected_type', { val: detected, ack: true });
            this.log.info(`Counter-Typ automatisch erkannt: ${detected}`);
        }

        return detected;
    }

    async getCounterOffset() {
        const state = await this.getStateAsync('_intern.counter_offset_m3');
        return state ? parseNum(state.val, 0) : 0;
    }

    async setCounterOffset(value) {
        await this.setStateAsync('_intern.counter_offset_m3', { val: value, ack: true });
    }

    async getPulseTotal() {
        const state = await this.getStateAsync('_intern.counter_pulse_total');
        return state ? parseNum(state.val, 0) : 0;
    }

    async setPulseTotal(value) {
        await this.setStateAsync('_intern.counter_pulse_total', { val: value, ack: true });
    }

    async readCurrentInputRawValue() {
        const inputStateId = this.getConfiguredInputStateId();
        if (!inputStateId) {
            return null;
        }

        const state = await this.getForeignStateAsync(inputStateId);
        if (!state || state.val === null || state.val === undefined || state.val === '') {
            return null;
        }

        return this.normalizeCounterRawValue(state.val);
    }

    async computeMeterValueFromInput(rawValue) {
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return null;
        }

        const sourceType = this.getSourceType();
        if (sourceType !== 'counter') {
            const meterValue = parseNum(rawValue, NaN);
            return Number.isFinite(meterValue) ? meterValue : null;
        }

        const counterFactor = this.getCounterFactor();
        if (!Number.isFinite(counterFactor)) {
            return null;
        }

        const detectedType = await this.getDetectedCounterType(rawValue);
        if (!detectedType) {
            return null;
        }

        const counterOffset = await this.getCounterOffset();

        if (detectedType === 'numeric') {
            const counterValue = parseNum(rawValue, NaN);
            if (!Number.isFinite(counterValue)) {
                return null;
            }
            return counterValue * counterFactor + counterOffset;
        }

        const pulseTotal = await this.getPulseTotal();
        return pulseTotal * counterFactor + counterOffset;
    }

    async readCurrentMeterValue() {
        const rawValue = await this.readCurrentInputRawValue();
        if (rawValue === null) {
            return null;
        }
        return this.computeMeterValueFromInput(rawValue);
    }

    async initCounterBaselineIfNeeded() {
        if (this.getSourceType() !== 'counter') {
            return;
        }

        const rawValue = await this.readCurrentInputRawValue();
        if (rawValue === null) {
            return;
        }

        const detectedType = await this.getDetectedCounterType(rawValue);
        if (!detectedType) {
            return;
        }

        if (detectedType === 'numeric') {
            const lastRawState = await this.getStateAsync('_intern.counter_last_raw');
            const hasLastRaw =
                lastRawState &&
                lastRawState.val !== null &&
                lastRawState.val !== undefined &&
                String(lastRawState.val) !== '';
            if (!hasLastRaw) {
                await this.setStateAsync('_intern.counter_last_raw', { val: String(parseNum(rawValue, 0)), ack: true });
            }
            return;
        }

        const lastRawState = await this.getStateAsync('_intern.counter_last_raw');
        const hasLastRaw =
            lastRawState &&
            lastRawState.val !== null &&
            lastRawState.val !== undefined &&
            String(lastRawState.val) !== '';
        if (!hasLastRaw) {
            await this.setStateAsync('_intern.counter_last_raw', { val: String(rawValue === true), ack: true });
        }
    }

    async processCounterInputChange(rawValue) {
        const normalized = this.normalizeCounterRawValue(rawValue);
        const detectedType = await this.getDetectedCounterType(normalized);
        const counterFactor = this.getCounterFactor();

        if (!detectedType || !Number.isFinite(counterFactor)) {
            throw new Error('Counter-Typ oder Counter-Faktor ist ungültig');
        }

        if (detectedType === 'numeric') {
            const currentRaw = parseNum(normalized, NaN);
            if (!Number.isFinite(currentRaw)) {
                throw new Error('Counter-Datenpunkt liefert keinen numerischen Wert');
            }

            const lastRawState = await this.getStateAsync('_intern.counter_last_raw');
            const lastRaw =
                lastRawState &&
                lastRawState.val !== null &&
                lastRawState.val !== undefined &&
                String(lastRawState.val) !== ''
                    ? parseNum(lastRawState.val, NaN)
                    : NaN;

            if (Number.isFinite(lastRaw) && currentRaw < lastRaw) {
                const currentMeterState = await this.getStateAsync('verbrauch.zaehlerstand');
                const currentMeter = currentMeterState ? parseNum(currentMeterState.val, 0) : 0;
                const newOffset = currentMeter - currentRaw * counterFactor;
                await this.setCounterOffset(newOffset);
                this.log.warn(
                    `Numerischer Counter ist kleiner geworden (${lastRaw} -> ${currentRaw}). Offset wurde automatisch auf ${newOffset} m³ angepasst, damit der Zählerstand nicht zurückspringt.`,
                );
            }

            await this.setStateAsync('_intern.counter_last_raw', { val: String(currentRaw), ack: true });
            await this.setStateAsync('verbrauch.counter', { val: currentRaw, ack: true });
            return;
        }

        if (typeof normalized !== 'boolean') {
            throw new Error('Counter-Datenpunkt liefert keinen Boolean-Wert');
        }

        const lastRawState = await this.getStateAsync('_intern.counter_last_raw');
        const lastBool = lastRawState ? String(lastRawState.val).trim().toLowerCase() === 'true' : false;
        const now = Date.now();
        const debounceMs = this.getCounterDebounceMs();

        if (!lastBool && normalized === true) {
            if (now - this.lastPulseTs >= debounceMs) {
                const pulses = (await this.getPulseTotal()) + 1;
                await this.setPulseTotal(pulses);
                await this.setStateAsync('verbrauch.counter', { val: pulses, ack: true });
                this.lastPulseTs = now;
            }
        } else {
            const pulses = await this.getPulseTotal();
            await this.setStateAsync('verbrauch.counter', { val: pulses, ack: true });
        }

        await this.setStateAsync('_intern.counter_last_raw', { val: String(normalized), ack: true });
    }

    async handlePeriodicUpdate() {
        const meterValue = await this.readCurrentMeterValue();
        if (meterValue === null) {
            await this.updateConnection(false);
            throw new Error(this.getInvalidInputMessage());
        }

        await this.handleValueUpdate(meterValue);
        await this.updateConnection(true);
    }

    async handleManualMeterCorrection(targetValue) {
        if (this.getSourceType() !== 'counter') {
            await this.handlePeriodicUpdate();
            return;
        }

        const desiredMeter = parseNum(targetValue, NaN);
        if (!Number.isFinite(desiredMeter)) {
            throw new Error('Manueller Zählerstand ist ungültig');
        }

        const rawValue = await this.readCurrentInputRawValue();
        if (rawValue === null) {
            throw new Error(this.getInvalidInputMessage());
        }

        const counterFactor = this.getCounterFactor();
        if (!Number.isFinite(counterFactor)) {
            throw new Error('Counter-Faktor ist ungültig');
        }

        const detectedType = await this.getDetectedCounterType(rawValue);
        if (!detectedType) {
            throw new Error('Counter-Typ konnte nicht erkannt werden');
        }

        let newOffset;
        if (detectedType === 'numeric') {
            const counterValue = parseNum(rawValue, NaN);
            if (!Number.isFinite(counterValue)) {
                throw new Error('Counter-Datenpunkt liefert keinen numerischen Wert');
            }
            newOffset = desiredMeter - counterValue * counterFactor;
        } else {
            const pulses = await this.getPulseTotal();
            newOffset = desiredMeter - pulses * counterFactor;
        }

        await this.setCounterOffset(newOffset);
        this.log.info(`Counter-Offset auf ${newOffset} m³ gesetzt. Neuer Zählerstand: ${desiredMeter} m³`);
        await this.handleValueUpdate(desiredMeter);
    }

    async initDayStartIfNeeded(currentMeter) {
        const todayKey = dateKey(new Date());

        const dayStartDateState = await this.getStateAsync('_intern.day_start_date');
        const savedDate = dayStartDateState && dayStartDateState.val ? String(dayStartDateState.val) : '';

        if (!savedDate) {
            await this.setStateAsync('_intern.day_start', { val: currentMeter, ack: true });
            await this.setStateAsync('_intern.day_start_date', { val: todayKey, ack: true });
            return;
        }

        if (savedDate !== todayKey) {
            await this.setStateAsync('_intern.day_start', { val: currentMeter, ack: true });
            await this.setStateAsync('_intern.day_start_date', { val: todayKey, ack: true });
        }
    }

    async initMonthStartIfNeeded(currentMeter) {
        const now = new Date();
        const currentMonthMarker = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const monthMarkerState = await this.getStateAsync('_intern.monat_marker');
        const monthStartState = await this.getStateAsync('_intern.monat_start');

        const marker = monthMarkerState?.val ? String(monthMarkerState.val) : '';
        const existingMonthStart = monthStartState?.val;

        if (!marker) {
            await this.setStateAsync('_intern.monat_start', {
                val:
                    existingMonthStart !== null && existingMonthStart !== undefined && existingMonthStart !== ''
                        ? Number(existingMonthStart)
                        : currentMeter,
                ack: true,
            });

            await this.setStateAsync('_intern.monat_marker', {
                val: currentMonthMarker,
                ack: true,
            });
        }
    }

    async handleMonthRollover(currentMeter) {
        const now = new Date();
        const currentMonthMarker = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const monthMarkerState = await this.getStateAsync('_intern.monat_marker');
        const marker = monthMarkerState && monthMarkerState.val ? String(monthMarkerState.val) : '';

        if (marker === currentMonthMarker) {
            return;
        }

        let newMonthStart = currentMeter;

        if (now.getDate() === 1) {
            const dayStartState = await this.getStateAsync('_intern.day_start');
            if (dayStartState && dayStartState.val !== null && dayStartState.val !== undefined) {
                newMonthStart = parseNum(dayStartState.val, currentMeter);
            }
        }

        await this.setStateAsync('_intern.monat_start', { val: newMonthStart, ack: true });
        await this.setStateAsync('_intern.monat_marker', { val: currentMonthMarker, ack: true });

        this.log.debug(`Monatswechsel erkannt, neuer Monatsstart: ${newMonthStart} m³`);
    }

    async handleAutoCreateNextTariff(currentMeter) {
        if (!this.config.autoCreateNextTariffAfterOneYear) {
            return;
        }

        const now = new Date();
        const tariffRows = Array.isArray(this.config.tariffs) ? [...this.config.tariffs] : [];
        if (!tariffRows.length) {
            return;
        }

        let changed = false;

        const saveTariffs = async () => {
            if (!changed) {
                return;
            }

            const objId = `system.adapter.${this.namespace}`;
            const instanceObj = await this.getForeignObjectAsync(objId);
            if (!instanceObj || !instanceObj.native) {
                return;
            }

            instanceObj.native.tariffs = tariffRows;
            await this.setForeignObjectAsync(objId, instanceObj);
            this.config.tariffs = tariffRows;
            changed = false;
        };

        const currentTariff = getCurrentTariff({ ...this.config, tariffs: tariffRows }, now);
        if (!currentTariff) {
            return;
        }

        const currentIndex = findTariffIndexByStartDate({ ...this.config, tariffs: tariffRows }, currentTariff.start);

        if (currentIndex >= 0) {
            const rawCurrentTariff = tariffRows[currentIndex];
            const currentStartMeter = parseNum(rawCurrentTariff.startzaehlerstand, 0);
            const shouldSkipAutoSetForCounter = this.getSourceType() === 'counter' && currentMeter <= 0;

            if (currentStartMeter <= 0 && !shouldSkipAutoSetForCounter) {
                rawCurrentTariff.startzaehlerstand = String(currentMeter);
                changed = true;

                this.log.info(
                    `Startzählerstand für aktiven Tarif ${rawCurrentTariff.name || fmtDate(currentTariff.start)} ` +
                        `(${fmtDate(currentTariff.start)}) automatisch auf ${currentMeter} gesetzt`,
                );
            } else if (currentStartMeter <= 0 && shouldSkipAutoSetForCounter) {
                this.log.info(
                    'Startzählerstand des aktiven Tarifs wurde im Counter-Modus nicht automatisch gesetzt, ' +
                        'weil der berechnete Zählerstand aktuell 0 ist.',
                );
            }
        }

        await saveTariffs();

        const nextStart = addYears(currentTariff.start, 1);
        if (dateKey(now) < dateKey(nextStart)) {
            return;
        }

        const existingNextIndex = findTariffIndexByStartDate({ ...this.config, tariffs: tariffRows }, nextStart);
        if (existingNextIndex >= 0) {
            return;
        }

        tariffRows.push({
            aktiv: true,
            name: currentTariff.name || 'Tarif',
            startdatum: fmtDate(nextStart),
            startzaehlerstand: '',
            grundgebuehr: String(currentTariff.grundgebuehr),
            arbeitspreis: String(currentTariff.arbeitspreis),
            abschlag: String(currentTariff.abschlag),
            abschlagTag: currentTariff.abschlagTag,
        });

        changed = true;
        await saveTariffs();

        this.log.info(
            `Folgetarif automatisch angelegt: ${fmtDate(nextStart)} ` +
                `(Startzählerstand bleibt leer bis dieser Tarif aktiv wird)`,
        );
    }

    async handleValueUpdate(meterValue) {
        const todayKey = dateKey(new Date());

        if (this.getSourceType() === 'counter') {
            const rawValue = await this.readCurrentInputRawValue();
            const detectedType = await this.getDetectedCounterType(rawValue);
            if (detectedType === 'numeric') {
                const counterValue = parseNum(rawValue, 0);
                await this.setStateAsync('verbrauch.counter', { val: counterValue, ack: true });
            } else {
                const pulses = await this.getPulseTotal();
                await this.setStateAsync('verbrauch.counter', { val: pulses, ack: true });
            }
        } else {
            await this.setStateAsync('verbrauch.counter', { val: 0, ack: true });
        }

        const dayStartState = await this.getStateAsync('_intern.day_start');
        const dayStartDateState = await this.getStateAsync('_intern.day_start_date');
        const ledgerState = await this.getStateAsync('_intern.ledger_json');

        const dayStartValue = dayStartState ? parseNum(dayStartState.val, meterValue) : meterValue;
        const dayStartDate = dayStartDateState && dayStartDateState.val ? String(dayStartDateState.val) : todayKey;

        let ledger = {};
        if (ledgerState && ledgerState.val) {
            try {
                ledger = JSON.parse(String(ledgerState.val));
            } catch {
                ledger = {};
            }
        }

        if (dayStartDate !== todayKey) {
            ledger = closePreviousDay(dayStartValue, meterValue, dayStartDate, ledger);
            await this.setStateAsync('_intern.ledger_json', { val: JSON.stringify(ledger), ack: true });
            await this.setStateAsync('_intern.day_start', { val: meterValue, ack: true });
            await this.setStateAsync('_intern.day_start_date', { val: todayKey, ack: true });
        }

        await this.handleMonthRollover(meterValue);
        await this.handleAutoCreateNextTariff(meterValue);

        const currentDayStartState = await this.getStateAsync('_intern.day_start');
        const currentMonthStartState = await this.getStateAsync('_intern.monat_start');

        const currentDayStart = currentDayStartState ? parseNum(currentDayStartState.val, meterValue) : meterValue;
        const currentMonthStart = currentMonthStartState
            ? parseNum(currentMonthStartState.val, meterValue)
            : meterValue;

        const values = buildOutputValues(this.config, meterValue, currentDayStart, ledger, currentMonthStart);

        for (const [id, val] of Object.entries(values)) {
            await this.setStateAsync(id, { val, ack: true });
        }
    }

    onUnload(callback) {
        try {
            if (this.refreshTimer) {
                this.clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
            this.ownStateIds = new Set(['verbrauch.zaehlerstand']);
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new EnergyGas(options);
} else {
    new EnergyGas();
}
