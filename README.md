![Logo](admin/energygas.png)
# ioBroker.energy-gas

[![NPM version](https://img.shields.io/npm/v/iobroker.energy-gas.svg)](https://www.npmjs.com/package/iobroker.energy-gas)
[![Downloads](https://img.shields.io/npm/dm/iobroker.energy-gas.svg)](https://www.npmjs.com/package/iobroker.energy-gas)
![Number of Installations](https://iobroker.live/badges/energy-gas-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/energy-gas-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.energy-gas.svg?data=d)](https://nodei.co/npm/iobroker.energy-gas/)

**Tests:** ![Test and Release](https://github.com/kodibrain/ioBroker.energy-gas/workflows/Test%20and%20Release/badge.svg)

## energy-gas adapter for ioBroker

### 🧾 Description

The adapter **ioBroker.energy-gas** calculates gas consumption based on a meter reading or a counter and provides evaluation of:

   * Consumption (m³ & kWh)
   * Costs (energy price & base fee)
   * Monthly payments
   * Balance
   * Tariffs with automatic switching

    The adapter is flexible and supports both classic gas meters and pulse or numeric counters (e.g. Zigbee, Tasmota, ESP, etc.).

---

## ⚙️ Features

### 🔢 Consumption calculation

* Conversion from m³ → kWh (calorific value & correction factor)
* Daily, monthly and yearly values
* Live updates

### 💰 Cost calculation

* Energy price per kWh
* Monthly base fee
* Monthly payments
* Balance calculation

### 📅 Tariff management

* Multiple tariffs with start/end date
* Automatic tariff switching
* Optional automatic creation of follow-up tariffs

---

## 🔌 Input types

### 1. Gas meter

Direct input of a meter reading in m³

Example:
```
12345.67 m³
```

---

### 2. Counter

The adapter can automatically detect:

* 🔢 numeric counter (e.g. Tasmota, Zigbee)
* 🔘 boolean pulse (e.g. reed contact)

---

## 🔁 Counter logic

### 🔢 Numeric counter

* Calculation via difference
```
Delta = current value - previous value
```

### 🔘 Boolean counter

* Counts pulses (false → true)
* Optional debounce

---

## ⏱️ Debounce

For pulse-based counters, a debounce time (ms) can be configured to avoid false counts.

Default:
```
200 ms
```

---

## ✏️ Manual correction

The datapoint:
```
consumption.meter
```

is writable.

➡️ Changes will internally adjust an offset  
➡️ Useful for:

* Restarts
* Lost pulses
* Manual corrections

---

## 🛠️ Configuration

### General

* Input type (gas meter / counter)
* Select datapoint

### Counter

* Factor (m³ per pulse / step)
* Type (auto / numeric / boolean)
* Debounce time

### Calculation

* Calorific value
* Correction factor

### Tariffs

* Energy price
* Base fee
* Start/end date

---

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 0.0.8
- bug fixes

### 0.0.7
- updated README

### 0.0.6
- Added JSDoc comments

### 0.0.5
* Initial public release
* Gas meter and counter support
* Tariff and cost calculation

## License
MIT License

Copyright (c) 2026 kodibrain <gitkodibrain@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
