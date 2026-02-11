// api/mail-label.js
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
}

function requireField(body, key) {
  const v = body?.[key];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s;
}

async function buildInstructionsPlusLabelPdf({ labelBase64 }) {
  // Load the USPS label PDF (base64 from Endicia)
  const labelBytes = Buffer.from(labelBase64, "base64");
  const labelPdf = await PDFDocument.load(labelBytes);

  // Create output PDF
  const out = await PDFDocument.create();

  // 1) Add your existing power-off instructions PDF as page(s), if present
  const instructionsPath = path.join(process.cwd(), "power-off-instructions.pdf");
  if (fs.existsSync(instructionsPath)) {
    const instrBytes = fs.readFileSync(instructionsPath);
    const instrPdf = await PDFDocument.load(instrBytes);
    const instrPages = await out.copyPages(instrPdf, instrPdf.getPageIndices());
    instrPages.forEach((p) => out.addPage(p));
  }

  // 2) Add a letter-sized page and place the 4x6 label on it
  const LETTER_W = 612; // 8.5" * 72
  const LETTER_H = 792; // 11" * 72
  const labelLetterPage = out.addPage([LETTER_W, LETTER_H]);

  const [labelPage] = await out.copyPages(labelPdf, [0]);

  // Scale label to fit nicely on letter
  const targetW = 420;
  const targetH = 600;

  const scale = Math.min(targetW / labelPage.getWidth(), targetH / labelPage.getHeight());
  const drawW = labelPage.getWidth() * scale;
  const drawH = labelPage.getHeight() * scale;

  const x = (LETTER_W - drawW) / 2;
  const y = (LETTER_H - drawH) / 2;

  labelLetterPage.drawPage(labelPage, { x, y, xScale: scale, yScale: scale });

  const outBytes = await out.save();
  return Buffer.from(outBytes);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }

    // Vercel sometimes passes req.body as an object, sometimes as a string
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // 🔐 Access code check (server-side enforcement)
    const accessCode = requireField(body, "accessCode");
    if (accessCode !== "072288") {
      return sendJson(res, 403, { ok: false, error: "Invalid access code" });
    }

    if (!process.env.LOB_API_KEY) {
      return sendJson(res, 500, { ok: false, error: "Missing LOB_API_KEY env var" });
    }

    // Required address fields (to mail the letter to the customer)
    const name = requireField(body, "name");
    const address1 = requireField(body, "address1");
    const city = requireField(body, "city");
    const state = requireField(body, "state");
    const zip = requireField(body, "zip");

    if (!name || !address1 || !city || !state || !zip) {
      return sendJson(res, 400, {
        ok: false,
        error: "Missing required fields: name, address1, city, state, zip",
      });
    }

    // 1) Generate the USPS return label using your existing route
    const baseUrl = getBaseUrl(req);
    const labelResp = await fetch(`${baseUrl}/api/create-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Pass through all fields (including deviceType, etc.)
      body: JSON.stringify(body),
    });

    const labelJson = await labelResp.json().catch(() => null);

    if (!labelResp.ok || !labelJson?.ok || !labelJson?.labelData) {
      return sendJson(res, 400, {
        ok: false,
        error: "Label creation failed",
        details: labelJson || { httpStatus: labelResp.status },
      });
    }

    // 2) Build a printable PDF: instructions + label page
    const combinedPdfBuffer = await buildInstructionsPlusLabelPdf({
      labelBase64: labelJson.labelData,
    });

    // 3) Create a Lob Letter to mail it to the customer-entered address
    const form = new FormData();

    // TO = customer address entered on the form
    form.set("to[name]", name);
    form.set("to[address_line1]", address1);
    if (body.address2) form.set("to[address_line2]", String(body.address2));
    form.set("to[address_city]", city);
    form.set("to[address_state]", state);
    form.set("to[address_zip]", zip);

    // FROM = your return program (set these in Vercel env vars or use defaults here)
    form.set("from[name]", process.env.LOB_FROM_NAME || "Connect America Returns");
    form.set("from[address_line1]", process.env.LOB_FROM_ADDRESS1 || "3 Bala Plaza West");
    form.set("from[address_city]", process.env.LOB_FROM_CITY || "Bala Cynwyd");
    form.set("from[address_state]", process.env.LOB_FROM_STATE || "PA");
    form.set("from[address_zip]", process.env.LOB_FROM_ZIP || "19004");

    // Optional settings
    form.set("color", "true");

    // Attach combined PDF (multipart upload)
    form.set(
      "file",
      new Blob([combinedPdfBuffer], { type: "application/pdf" }),
      "return-label-and-instructions.pdf"
    );

    const auth = Buffer.from(`${process.env.LOB_API_KEY}:`).toString("base64");
    const lobResp = await fetch("https://api.lob.com/v1/letters", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    });

    const lobJson = await lobResp.json().catch(() => null);

    if (!lobResp.ok || !lobJson?.id) {
      return sendJson(res, 400, {
        ok: false,
        error: "Lob letter creation failed",
        httpStatus: lobResp.status,
        details: lobJson,
      });
    }

    // 4) Return success response (USPS tracking + Lob tracking)
    return sendJson(res, 200, {
      ok: true,
      uspsTrackingNumber: labelJson.trackingNumber || null,
      lobLetterId: lobJson.id,
      lobStatus: lobJson.status || null,
    });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String(e) });
  }
}
