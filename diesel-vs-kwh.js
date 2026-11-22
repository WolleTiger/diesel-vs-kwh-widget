// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;

// Diesel vs. kWh — Scriptable iOS home screen widget
// Shows the nearest diesel price (Tankerkönig API, automatic location)
// and the break-even electricity price for an electric car.

// ==== SETTINGS: TANKERKÖNIG ====
// Free API key from https://creativecommons.tankerkoenig.de/ (register, then copy the key here)
const TANKERKOENIG_KEY = "YOUR_TANKERKOENIG_API_KEY";
const RADIUS_KM = 8;
// Used only if GPS and the cached location are both unavailable (Berlin as a neutral default)
const FALLBACK_LAT = 52.52;
const FALLBACK_LON = 13.405;

// ==== SETTINGS: VEHICLE ====
const DIESEL_VERBRAUCH = 5;      // liters per 100 km (diesel car)
const AVG_VERBRAUCH_KWH = 15;    // kWh per 100 km (electric car)
const PAID_RATE = 0.30;          // home/grid electricity price in €/kWh

// ==== COLORS ====
const C = {
  bg: new Color("#1c1c1e"),
  card: new Color("#2c2c2e"),
  yellow: new Color("#ffcc00"),
  green: new Color("#34c759"),
  blue: new Color("#60a5fa"),
  red: new Color("#f87171"),
  gray: new Color("#8e8e93"),
  white: new Color("#ffffff"),
};

// ==== LOCATION ====
const fm = FileManager.local();
const LOCATION_CACHE_PATH = fm.joinPath(fm.documentsDirectory(), "diesel_widget_last_location.json");
const PRICE_CACHE_PATH = fm.joinPath(fm.documentsDirectory(), "diesel_widget_price.json");

async function getLocation() {
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    try {
      fm.writeString(LOCATION_CACHE_PATH, JSON.stringify(loc));
    } catch (e) { }
    return { lat: loc.latitude, lon: loc.longitude, quelle: "GPS" };
  } catch (e) {
    if (fm.fileExists(LOCATION_CACHE_PATH)) {
      const cached = JSON.parse(fm.readString(LOCATION_CACHE_PATH));
      return { lat: cached.latitude, lon: cached.longitude, quelle: "letzter Standort" };
    }
    return { lat: FALLBACK_LAT, lon: FALLBACK_LON, quelle: "Standard-Standort" };
  }
}

// ==== TANKERKÖNIG API ====
async function getDieselPreis(lat, lon) {
  if (TANKERKOENIG_KEY.startsWith("YOUR_")) {
    throw new Error("API-Key fehlt (siehe Skript)");
  }
  const url = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lon}&rad=${RADIUS_KM}&sort=price&type=diesel&apikey=${TANKERKOENIG_KEY}`;
  const req = new Request(url);
  const res = await req.loadJSON();
  if (!res.ok || !res.stations || res.stations.length === 0) {
    throw new Error("Keine Tankstellen-Daten erhalten");
  }
  const station = res.stations.find(s => s.price && s.price > 0);
  if (!station) throw new Error("Kein gültiger Dieselpreis gefunden");
  return { preis: station.price, name: station.name, ort: station.place };
}

// ==== HELPERS ====
function eur(v) {
  return v.toFixed(2).replace(".", ",") + " €";
}

function addCostRow(stack, label, value, color) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const l = row.addText(label);
  l.font = Font.systemFont(10);
  l.textColor = C.gray;
  row.addSpacer();
  const v = row.addText(value);
  v.font = Font.boldSystemFont(12);
  v.textColor = color;
}

// ==== WIDGET ====
async function createWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = C.bg;
  widget.setPadding(10, 12, 8, 12);

  try {
    const { lat, lon, quelle } = await getLocation();
    const { preis, name, ort } = await getDieselPreis(lat, lon);
    try {
      fm.writeString(PRICE_CACHE_PATH, JSON.stringify({ preis, name, ort }));
    } catch (e) { }

    const dieselKosten100 = DIESEL_VERBRAUCH * preis;   // cost of 100 km by diesel
    const stromNetz100 = AVG_VERBRAUCH_KWH * PAID_RATE; // cost of 100 km by grid electricity
    const maxStrom = dieselKosten100 / AVG_VERBRAUCH_KWH; // break-even price per kWh

    // Header
    const head = widget.addStack();
    head.centerAlignContent();
    const t = head.addText("Diesel vs. kWh");
    t.font = Font.boldSystemFont(11);
    t.textColor = C.gray;
    head.addSpacer();
    const src = head.addText(quelle);
    src.font = Font.systemFont(7);
    src.textColor = C.gray;

    widget.addSpacer(2);

    // Diesel price
    const price = widget.addText(`${preis.toFixed(3).replace(".", ",")} €/L`);
    price.font = Font.boldSystemFont(24);
    price.textColor = C.yellow;
    price.minimumScaleFactor = 0.6;

    const station = widget.addText(name || ort);
    station.font = Font.systemFont(9);
    station.textColor = C.white;
    station.lineLimit = 1;

    widget.addSpacer(4);

    // Cost comparison card
    const card = widget.addStack();
    card.layoutVertically();
    card.backgroundColor = C.card;
    card.cornerRadius = 8;
    card.setPadding(6, 8, 6, 8);

    const ct = card.addText("100 km kosten");
    ct.font = Font.semiboldSystemFont(9);
    ct.textColor = C.gray;
    card.addSpacer(3);
    addCostRow(card, "Diesel", eur(dieselKosten100), C.red);
    addCostRow(card, "Strom (Netz)", eur(stromNetz100), C.blue);

    widget.addSpacer(4);

    // Break-even electricity price
    const ml = widget.addText("Gleichstand ab");
    ml.font = Font.systemFont(9);
    ml.textColor = C.gray;
    const mv = widget.addText(`${maxStrom.toFixed(3).replace(".", ",")} €/kWh`);
    mv.font = Font.boldSystemFont(14);
    mv.textColor = C.green;
    mv.minimumScaleFactor = 0.7;

  } catch (e) {
    const err = widget.addText("Fehler: " + e.message);
    err.font = Font.systemFont(11);
    err.textColor = C.red;
    err.lineLimit = 4;
  }

  return widget;
}

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
