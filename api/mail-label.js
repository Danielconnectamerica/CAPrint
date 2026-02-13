// api/mail-label.js
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function unauthorized(res) {
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

  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
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

function todayIso() {
  return new Date().toISOString();
}

async function postToSheets(webhookUrl, payload) {
  if (!webhookUrl) return null;
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function normalizeWeightOz(body) {
  // Prefer weightOz from UI; fallback to weightLbs; otherwise null
  const oz = Number(body?.weightOz);
  if (Number.isFinite(oz) && oz > 0) return oz;

  const lbs = Number(body?.weightLbs);
  if (Number.isFinite(lbs) && lbs > 0) return lbs * 16;

  return null;
}

/**
 * Builds a printable PDF:
 * - Includes repo-root power-off-instructions.pdf (all pages) if present
 * - Appends a letter-sized page with the 4x6 return label embedded and centered
 */
async function buildInstructionsPlusLabelPdf({ labelBase64 }) {
  const labelBytes = Buffer.from(labelBase64, "base64");

  const out = await PDFDocument.create();

  // 1) Add instructions PDF if present
  const instructionsPath = path.join(process.cwd(), "power-off-instructions.pdf");
  if (fs.existsSync(instructionsPath)) {
    const instrBytes = fs.readFileSync(instructionsPath);
    const instrPdf = await PDFDocument.load(instrBytes);
    const instrPages = await out.copyPages(instrPdf, instrPdf.getPageIndices());
    instrPages.forEach((p) => out.addPage(p));
  }

  // 2) Add letter page and embed label PDF page 0
  const LETTER_W = 612; // 8.5" * 72
  const LETTER_H = 792; // 11" * 72
  const page = out.addPage([LETTER_W, LETTER_H]);

  const [embeddedLabel] = await out.embedPdf(labelBytes, [0]);

  // Fit label onto letter
  const targetW = 420;
  const targetH = 600;

  const scale = Math.min(targetW / embeddedLabel.width, targetH / embeddedLabel.height);
  const drawW = embeddedLabel.width * scale;
  const drawH = embeddedLabel.height * scale;

  const x = (LETTER_W - drawW) / 2;
  const y = (LETTER_H - drawH) / 2;

  page.drawPage(embeddedLabel, { x, y, xScale: scale, yScale: scale });

  const outBytes = await out.save();
  return Buffer.from(outBytes);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }

    // ✅ BASIC AUTH GATE
    const creds = parseBasicAuth(req);
    const expectedUser = process.env.MAIL_USER || "";
    const expectedPass = process.env.MAIL_PASS || "";
    if (!expectedUser || !expectedPass) {
      return sendJson(res, 500, { ok: false, error: "Missing MAIL_USER/MAIL_PASS env vars" });
    }
    if (!creds || creds.user !== expectedUser || creds.pass !== expectedPass) {
      return unauthorized(res);
    }

    // Parse body
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (!process.env.LOB_API_KEY) {
      return sendJson(res, 500, { ok: false, error: "Missing LOB_API_KEY env var" });
    }

    // ✅ Required fields
    const name = requireField(body, "name");
    const address1 = requireField(body, "address1");
    const address2 = requireField(body, "address2") || "";
    const city = requireField(body, "city");
    const state = requireField(body, "state");
    const zip = requireField(body, "zip");
    const phone = requireField(body, "phone");
    const deviceType = requireField(body, "deviceType");

    const missing = [];
    if (!name) missing.push("name");
    if (!address1) missing.push("address1");
    if (!city) missing.push("city");
    if (!state) missing.push("state");
    if (!zip) missing.push("zip");
    if (!phone) missing.push("phone");
    if (!deviceType) missing.push("deviceType");

    if (missing.length) {
      const failPayload = {
        request_id: `mail_${Date.now()}`,
        lob_letter_id: "", // ✅ ensure field exists for Power Automate
        source: "Lifelinephysical-mail",
        created_at_iso: todayIso(),

        customer_name: name || "",
        customer_email: String(body.email || ""),
        customer_phone: phone || "",

        from_address1: address1 || "",
        from_address2: address2 || "",
        from_city: city || "",
        from_state: state || "",
        from_zip: zip || "",

        device_type: String(deviceType || ""),
        device_serial: String(body.deviceSerial || ""),
        return_reason: String(body.returnReason || ""),
        weight_oz: normalizeWeightOz(body),

        service_type: "usps_ground_advantage",
        tracking_number: "",
        label_id: "",
        postage_total_usd: null,

        status: "Exception",
        status_last_checked: todayIso(),
        delivered_at: null,
        latest_event: `Missing required fields: ${missing.join(", ")}`,
      };

      await postToSheets(SHEETS_WEBHOOK_URL, failPayload);
      return sendJson(res, 400, { ok: false, error: `Missing required fields: ${missing.join(", ")}` });
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
      const failPayload = {
        request_id: `mail_${Date.now()}`,
        lob_letter_id: "", // ✅ ensure field exists for Power Automate
        source: "Lifelinephysical-mail",
        created_at_iso: todayIso(),

        customer_name: name,
        customer_email: String(body.email || ""),
        customer_phone: phone,

        from_address1: address1,
        from_address2: address2,
        from_city: city,
        from_state: state,
        from_zip: zip,

        device_type: String(deviceType || ""),
        device_serial: String(body.deviceSerial || ""),
        return_reason: String(body.returnReason || ""),
        weight_oz: normalizeWeightOz(body),

        service_type: "usps_ground_advantage",
        tracking_number: "",
        label_id: "",
        postage_total_usd: null,

        status: "Exception",
        status_last_checked: todayIso(),
        delivered_at: null,
        latest_event: `Label creation failed (Endicia). HTTP ${labelResp.status}`,
      };

      await postToSheets(SHEETS_WEBHOOK_URL, failPayload);

      return sendJson(res, 400, {
        ok: false,
        error: "Label creation failed",
        httpStatus: labelResp.status,
        details: labelJson,
      });
    }

    const trackingNumber = labelJson.trackingNumber || labelJson.tracking_number || "";
    const weightOz = normalizeWeightOz(body);

    // 2) Build PDF (instructions + label)
    const combinedPdfBuffer = await buildInstructionsPlusLabelPdf({
      labelBase64: labelJson.labelData,
    });

    // 3) Create Lob letter
    const form = new FormData();

    form.set("to[name]", name);
    form.set("to[address_line1]", address1);
    if (address2) form.set("to[address_line2]", address2);
    form.set("to[address_city]", city);
    form.set("to[address_state]", state);
    form.set("to[address_zip]", zip);

    form.set("from[name]", process.env.LOB_FROM_NAME || "Connect America Returns");
    form.set("from[address_line1]", process.env.LOB_FROM_ADDRESS1 || "3 Bala Plaza West");
    form.set("from[address_city]", process.env.LOB_FROM_CITY || "Bala Cynwyd");
    form.set("from[address_state]", process.env.LOB_FROM_STATE || "PA");
    form.set("from[address_zip]", process.env.LOB_FROM_ZIP || "19004");

    form.set("color", "true");
    form.set("use_type", "operational");

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
      const failPayload = {
        request_id: `mail_${Date.now()}`,
        lob_letter_id: "", // ✅ ensure field exists for Power Automate
        source: "physical-mail",
        created_at_iso: todayIso(),

        customer_name: name,
        customer_email: String(body.email || ""),
        customer_phone: phone,

        from_address1: address1,
        from_address2: address2,
        from_city: city,
        from_state: state,
        from_zip: zip,

        device_type: String(deviceType || ""),
        device_serial: String(body.deviceSerial || ""),
        return_reason: String(body.returnReason || ""),
        weight_oz: weightOz,

        service_type: labelJson?.service_type || "usps_ground_advantage",
        tracking_number: trackingNumber,
        label_id: labelJson?.label_id || "",
        postage_total_usd: labelJson?.shipment_cost?.total_amount ?? null,

        status: "Exception",
        status_last_checked: todayIso(),
        delivered_at: null,
        latest_event: `Lob letter creation failed. HTTP ${lobResp.status}`,
      };

      await postToSheets(SHEETS_WEBHOOK_URL, failPayload);

      return sendJson(res, 400, {
        ok: false,
        error: "Lob letter creation failed",
        httpStatus: lobResp.status,
        details: lobJson,
      });
    }

    // ✅ SUCCESS: add lob_letter_id to sheets payload (THIS FIXES YOUR ISSUE)
    const sheetsPayload = {
      request_id: lobJson.id,
      lob_letter_id: lobJson.id, // ✅ CRITICAL LINE
      source: "physical-mail",
      created_at_iso: todayIso(),

      customer_name: name,
      customer_email: String(body.email || ""),
      customer_phone: phone,

      from_address1: address1,
      from_address2: address2,
      from_city: city,
      from_state: state,
      from_zip: zip,

      device_type: String(deviceType || ""),
      device_serial: String(body.deviceSerial || ""),
      return_reason: String(body.returnReason || ""),

      weight_oz: weightOz,
      service_type: labelJson?.service_type || "usps_ground_advantage",
      tracking_number: trackingNumber,
      label_id: labelJson?.label_id || "",
      postage_total_usd: labelJson?.shipment_cost?.total_amount ?? null,

      status: "Created",
      status_last_checked: todayIso(),
      delivered_at: null,
      latest_event: trackingNumber
        ? "Return label created; physical packet mailed."
        : "Return label created (no tracking number returned); physical packet mailed.",
    };

    const sheetsLogged = await postToSheets(SHEETS_WEBHOOK_URL, sheetsPayload);

    return sendJson(res, 200, {
      ok: true,
      uspsTrackingNumber: trackingNumber || null,
      lobLetterId: lobJson.id,
      lobStatus: lobJson.status || null,
      sheetsLogged,
    });
  } catch (e) {
    try {
      const crashPayload = {
        request_id: `mail_${Date.now()}`,
        lob_letter_id: "", // ✅ ensure field exists for Power Automate
        source: "Lifelinephysical-mail",
        created_at_iso: todayIso(),
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        from_address1: "",
        from_address2: "",
        from_city: "",
        from_state: "",
        from_zip: "",
        device_type: "",
        device_serial: "",
        return_reason: "",
        weight_oz: null,
        service_type: "usps_ground_advantage",
        tracking_number: "",
        label_id: "",
        postage_total_usd: null,
        status: "Exception",
        status_last_checked: todayIso(),
        delivered_at: null,
        latest_event: `Unhandled error: ${String(e)}`,
      };
      await postToSheets(SHEETS_WEBHOOK_URL, crashPayload);
    } catch {}
    return sendJson(res, 500, { ok: false, error: String(e) });
  }
}
