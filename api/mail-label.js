// api/mail-label.js
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function unauthorized(res) {
  // This triggers the browser’s built-in username/password prompt
  res.statusCode = 401;
  res.setHeader("WWW-Authenticate", 'Basic realm="Return Label Mailer"');
  res.end("Unauthorized");
}

function parseBasicAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.toString().startsWith("Basic ")) return null;

  const b64 = header.toString().slice("Basic ".length).trim();
  let decoded = "";
  try {
    decoded = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }

  const idx = decoded.indexOf(":");
  if (idx === -1) return null;

  return {
    user: decoded.slice(0, idx),
    pass: decoded.slice(idx + 1),
  };
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
  const labelBytes = Buffer.from(labelBase64, "base64");
  const labelPdf = await PDFDocument.load(labelBytes);

  const out = await PDFDocument.create();

  // Add instructions PDF if present at repo root: power-off-instructions.pdf
  const instructionsPath = path.join(process.cwd(), "power-off-instructions.pdf");
  if (fs.existsSync(instructionsPath)) {
    const instrBytes = fs.readFileSync(instructionsPath);
    const instrPdf = await PDFDocument.load(instrBytes);
    const instrPages = await out.copyPages(instrPdf, instrPdf.getPageIndices());
    instrPages.forEach((p) => out.addPage(p));
  }

  // Add a letter-sized page for the 4x6 label
  const LETTER_W = 612;
  const LETTER_H = 792;
  const labelLetterPage = out.addPage([LETTER_W, LETTER_H]);

  const [labelPage] = await out.copyPages(labelPdf, [0]);

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

    // ✅ BASIC AUTH GATE (no secret in HTML)
    const creds = parseBasicAuth(req);
    const expectedUser = process.env.MAIL_USER || "";
    const expectedPass = process.env.MAIL_PASS || "";

    if (!expectedUser || !expectedPass) {
      return sendJson(res, 500, { ok: false, error: "Missing MAIL_USER/MAIL_PASS env vars" });
    }

    if (!creds || creds.user !== expectedUser || creds.pass !== expectedPass) {
      return unauthorized(res);
    }

    // Body parsing
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    if (!process.env.LOB_API_KEY) {
      return sendJson(res, 500, { ok: false, error: "Missing LOB_API_KEY env var" });
    }

    // Required address fields (mail to customer-entered address)
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

    // 1) Generate USPS label via your existing endpoint
    const baseUrl = getBaseUrl(req);
    const labelResp = await fetch(`${baseUrl}/api/create-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    // 2) Build PDF (instructions + label)
    const combinedPdfBuffer = await buildInstructionsPlusLabelPdf({
      labelBase64: labelJson.labelData,
    });

    // 3) Create Lob letter
    const form = new FormData();

    form.set("to[name]", name);
    form.set("to[address_line1]", address1);
    if (body.address2) form.set("to[address_line2]", String(body.address2));
    form.set("to[address_city]", city);
    form.set("to[address_state]", state);
    form.set("to[address_zip]", zip);

    form.set("from[name]", process.env.LOB_FROM_NAME || "Connect America Returns");
    form.set("from[address_line1]", process.env.LOB_FROM_ADDRESS1 || "3 Bala Plaza West");
    form.set("from[address_city]", process.env.LOB_FROM_CITY || "Bala Cynwyd");
    form.set("from[address_state]", process.env.LOB_FROM_STATE || "PA");
    form.set("from[address_zip]", process.env.LOB_FROM_ZIP || "19004");

    form.set("color", "true");

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
