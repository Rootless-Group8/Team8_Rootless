/**
 * sources/mexico.js
 *
 * Adapter for Mexico's National Immigration Institute (INM) page
 * listing visa-exempt countries:
 * https://www.inm.gob.mx/gobmx/word/index.php/paises-no-requieren-visa-para-mexico/
 *
 * UNIQUE PROBLEM: unlike every other source in this project, INM
 * does not publish this list as text or a table -- it's a single
 * embedded JPG image of a printed, multi-column document (columns
 * A-I and J-U, alphabetically).
 *
 * CONFIRMED VIA TESTING: this adapter downloads the image and runs
 * OCR (tesseract.js). OCR successfully reads simple single-column
 * entries (e.g. it correctly matched "Estados Unidos de América"),
 * but the multi-column layout confuses its reading order -- it
 * scrambles entries across columns (e.g. "Canadá" and "Mónaco" ended
 * up merged onto one line) and cuts off partway through, missing
 * roughly half the real 63-entry list.
 *
 * FALLBACK STRATEGY: rather than trust an OCR result we can't verify
 * is complete, this adapter falls back to a HUMAN-VERIFIED snapshot
 * (VERIFIED_EXEMPT_LIST below, transcribed directly from the actual
 * image) whenever OCR returns fewer than MIN_TRUSTED_OCR_LINES
 * entries. This mirrors the project's own stated design philosophy:
 * for legally sensitive visa data, prefer a human-verified snapshot
 * with a clear "last verified" date over an automated result of
 * unknown completeness.
 *
 * FUTURE IMPROVEMENT: properly fixing OCR here would mean
 * preprocessing the image -- cropping it into its two columns and
 * running OCR on each separately -- rather than the whole image at
 * once. Worth doing if this list needs to be re-verified often; for
 * now, the verified fallback is the reliable path.
 */

const axios = require("axios");
const Tesseract = require("tesseract.js");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");

const PAGE_URL = "https://www.inm.gob.mx/gobmx/word/index.php/paises-no-requieren-visa-para-mexico/";
const IMAGE_URL = "https://www.inm.gob.mx/gobmx/word/wp-content/uploads/2024/03/PAI%CC%81SES-QUE-NO-REQUIEREN-VISA-2-02.jpg";

// HUMAN-VERIFIED FALLBACK LIST
// Transcribed directly from the actual INM image on 2026-09-19 (see
// project chat history) after OCR proved unreliable on this specific
// image's multi-column layout (it scrambled column order and missed
// roughly half the list). This mirrors the project's own stated
// design philosophy: for legally sensitive visa data, prefer a
// human-verified snapshot with a clear "last verified" date over a
// fully automated result we can't confirm is complete.
//
// IMPORTANT: this needs periodic re-verification against the live
// image (INM could update the list). A team member should check the
// source image periodically and update LAST_VERIFIED_DATE below.
const LAST_VERIFIED_DATE = "2026-09-19";
const VERIFIED_EXEMPT_LIST = [
  "Alemania", "Andorra", "Argentina", "Australia", "Austria",
  "Bahamas", "Barbados", "Bélgica", "Belice", "Bolivia (Estado Plurinacional de Bolivia)", "Bulgaria",
  "Canadá", "Chile", "Chipre", "Colombia", "Costa Rica", "Croacia",
  "Dinamarca",
  "Emiratos Árabes Unidos", "Eslovaquia", "Eslovenia", "España", "Estados Unidos de América", "Estonia",
  "Finlandia", "Francia",
  "Grecia",
  "Hungría",
  "Irlanda", "Islandia", "Islas Marshall", "Israel", "Italia",
  "Jamaica", "Japón",
  "Letonia", "Liechtenstein", "Lituania", "Luxemburgo",
  "Malasia", "Malta", "Micronesia (Estados Federados de Micronesia)", "Mónaco",
  "Noruega", "Nueva Zelandia",
  "Países Bajos", "Palau", "Panamá", "Paraguay", "Polonia", "Portugal",
  "Región de Administración Especial de Hong Kong", "Región de Administración Especial de Macao",
  "Reino Unido de Gran Bretaña e Irlanda del Norte", "República Checa", "República de Corea", "Rumania",
  "San Marino", "Singapur", "Suecia", "Suiza",
  "Trinidad y Tobago",
  "Uruguay",
];

// Minimum OCR line count before we trust it over the verified
// fallback -- the real list has 63 entries; if OCR returns
// meaningfully fewer, it likely scrambled/missed part of the image.
const MIN_TRUSTED_OCR_LINES = 55;

// Maps our ISO-alpha-2 codes to the exact name used in
// VERIFIED_EXEMPT_LIST above (corrected against the real image --
// e.g. NZ is "Nueva Zelandia", not "Nueva Zelanda" as originally
// guessed).
const ORIGIN_COUNTRY_NAMES = {
  US: "Estados Unidos de América",
  CA: "Canadá",
  GB: "Reino Unido de Gran Bretaña e Irlanda del Norte",
  DE: "Alemania",
  ES: "España",
  PT: "Portugal",
  AU: "Australia",
  JP: "Japón",
  NL: "Países Bajos",
  NZ: "Nueva Zelandia",
};

let cachedLines = null;

function normalize(text) {
  // Strip accents, lowercase, letters only -- makes matching
  // resilient to OCR misreads of accented Spanish characters.
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

async function loadOcrLines() {
  if (cachedLines) return cachedLines;

  let ocrLines = [];
  try {
    // A bare request to this image URL returns 404 even though it
    // displays fine embedded in the page -- likely hotlink protection
    // requiring a Referer header and a realistic browser User-Agent.
    const imageResponse = await axios.get(IMAGE_URL, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        Referer: PAGE_URL,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    const {
      data: { text },
    } = await Tesseract.recognize(imageBuffer, "eng+spa");

    ocrLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err) {
    // OCR pipeline itself failed (network, image, Tesseract error) --
    // fall through to the verified list rather than propagating.
    ocrLines = [];
  }

  if (ocrLines.length >= MIN_TRUSTED_OCR_LINES) {
    cachedLines = { lines: ocrLines, source: "ocr" };
  } else {
    // OCR came back empty or suspiciously short (this image's
    // multi-column layout is known to confuse it) -- use the
    // human-verified snapshot instead.
    cachedLines = { lines: VERIFIED_EXEMPT_LIST, source: "verified-fallback" };
  }

  return cachedLines;
}

function findMatch(countryName, lines) {
  const target = normalize(countryName);
  if (!target) return null;
  // Substring match (not exact) since OCR may attach stray characters
  // or merge nearby text onto the same line.
  return lines.find((line) => normalize(line).includes(target));
}

const mexicoAdapter = new (class extends SourceAdapter {
  get name() {
    return "inm.gob.mx (OCR)";
  }

  supports(destinationCountry) {
    return destinationCountry === "MX";
  }

  async fetch(originCountry, destinationCountry) {
    const countryName = ORIGIN_COUNTRY_NAMES[originCountry];

    if (!countryName) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No Spanish display-name mapping for "${originCountry}" yet. Add it to ORIGIN_COUNTRY_NAMES in sources/mexico.js.`,
      });
    }

    let result;
    try {
      result = await loadOcrLines();
    } catch (err) {
      throw new Error(`OCR pipeline failed for ${IMAGE_URL}: ${err.message}`);
    }

    const { lines, source } = result;
    const sourceLabel =
      source === "ocr" ? "live OCR" : `human-verified snapshot (last checked ${LAST_VERIFIED_DATE} -- OCR on this image's multi-column layout was unreliable)`;

    const match = findMatch(countryName, lines);

    if (match) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid passport", "Forma Migratoria Múltiple (FMM)", "proof of return/onward travel", "proof of accommodation"],
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `Matched "${countryName}" via ${sourceLabel}: "${match}".${source === "ocr" ? " CAUTION: this result comes from OCR on a scanned image, not real text -- lower confidence than other sources." : ""}`,
      });
    }

    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: PAGE_URL,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `"${countryName}" not found via ${sourceLabel} (${lines.length} entries checked). Likely a genuine visa requirement, but manually confirm against the source image given this source's reliability history.`,
    });
  }
})();

module.exports = mexicoAdapter;