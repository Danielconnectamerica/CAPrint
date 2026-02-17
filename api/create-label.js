// /api/create-label.js
// USPS Returns (Pay-On-<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Lifeline Printed Return Label</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 650px;
      margin: 40px auto;
    }

    .header {
      text-align: center;
      margin-bottom: 20px;
    }

    .header img {
      max-width: 260px;
      width: 100%;
      height: auto;
    }

    h2 {
      text-align: center;
      margin-bottom: 10px;
    }

    label {
      font-weight: bold;
      display: block;
      margin-top: 12px;
    }

    .required-star {
      color: red;
      margin-left: 4px;
    }

    input, select, button {
      width: 100%;
      padding: 10px;
      margin-top: 4px;
      font-size: 16px;
      box-sizing: border-box;
    }

    input.error-field, select.error-field {
      border: 2px solid red;
      background-color: #fff5f5;
    }

    button {
      background-color: #0055A5;
      color: white;
      border: none;
      cursor: pointer;
      margin-top: 16px;
    }

    button:disabled {
      background-color: #999;
      cursor: not-allowed;
    }

    .error {
      color: red;
      font-weight: bold;
      margin-top: 12px;
    }

    .success {
      color: green;
      font-weight: bold;
      margin-top: 12px;
    }
  </style>
</head>

<body>

<div class="header">
  <img src="/Lifeline Logo.png" alt="Lifeline" />
</div>

<h2>Request a Physical Return Label</h2>

<form id="returnForm" novalidate>

  <label>Full Name<span class="required-star">*</span></label>
  <input type="text" name="name" required />

  <label>Street Address<span class="required-star">*</span></label>
  <input type="text" name="address1" required />

  <label>Apartment / Suite</label>
  <input type="text" name="address2" />

  <label>City<span class="required-star">*</span></label>
  <input type="text" name="city" required />

  <label>State<span class="required-star">*</span></label>
  <select name="state" required>
    <option value="">Select State</option>
    <option value="AL">Alabama (AL)</option>
    <option value="AK">Alaska (AK)</option>
    <option value="AZ">Arizona (AZ)</option>
    <option value="AR">Arkansas (AR)</option>
    <option value="CA">California (CA)</option>
    <option value="CO">Colorado (CO)</option>
    <option value="CT">Connecticut (CT)</option>
    <option value="DE">Delaware (DE)</option>
    <option value="FL">Florida (FL)</option>
    <option value="GA">Georgia (GA)</option>
    <option value="HI">Hawaii (HI)</option>
    <option value="ID">Idaho (ID)</option>
    <option value="IL">Illinois (IL)</option>
    <option value="IN">Indiana (IN)</option>
    <option value="IA">Iowa (IA)</option>
    <option value="KS">Kansas (KS)</option>
    <option value="KY">Kentucky (KY)</option>
    <option value="LA">Louisiana (LA)</option>
    <option value="ME">Maine (ME)</option>
    <option value="MD">Maryland (MD)</option>
    <option value="MA">Massachusetts (MA)</option>
    <option value="MI">Michigan (MI)</option>
    <option value="MN">Minnesota (MN)</option>
    <option value="MS">Mississippi (MS)</option>
    <option value="MO">Missouri (MO)</option>
    <option value="MT">Montana (MT)</option>
    <option value="NE">Nebraska (NE)</option>
    <option value="NV">Nevada (NV)</option>
    <option value="NH">New Hampshire (NH)</option>
    <option value="NJ">New Jersey (NJ)</option>
    <option value="NM">New Mexico (NM)</option>
    <option value="NY">New York (NY)</option>
    <option value="NC">North Carolina (NC)</option>
    <option value="ND">North Dakota (ND)</option>
    <option value="OH">Ohio (OH)</option>
    <option value="OK">Oklahoma (OK)</option>
    <option value="OR">Oregon (OR)</option>
    <option value="PA">Pennsylvania (PA)</option>
    <option value="RI">Rhode Island (RI)</option>
    <option value="SC">South Carolina (SC)</option>
    <option value="SD">South Dakota (SD)</option>
    <option value="TN">Tennessee (TN)</option>
    <option value="TX">Texas (TX)</option>
    <option value="UT">Utah (UT)</option>
    <option value="VT">Vermont (VT)</option>
    <option value="VA">Virginia (VA)</option>
    <option value="WA">Washington (WA)</option>
    <option value="WV">West Virginia (WV)</option>
    <option value="WI">Wisconsin (WI)</option>
    <option value="WY">Wyoming (WY)</option>
  </select>

  <label>ZIP Code<span class="required-star">*</span></label>
  <input type="text" name="zip" required />

  <label>Phone Number<span class="required-star">*</span></label>
  <input type="text" name="phone" required />

  <label>Device Type<span class="required-star">*</span></label>
  <select id="deviceType" name="deviceType" required>
    <option value="" selected disabled>Select your device…</option>
    <option value="Cellular Assure / Mytrex" data-weight="2">Cellular Assure / Mytrex — 2 lb</option>
    <option value="Mytrex Landline" data-weight="2">Mytrex Landline — 2 lb</option>
    <option value="On the Go" data-weight="1">On the Go — 1 lb</option>
    <option value="OTG Micron" data-weight="1">OTG Micron — 1 lb</option>
    <option value="OTG Mini Neck" data-weight="1">OTG Mini Neck — 1 lb</option>
    <option value="OTG Mini Wrist" data-weight="1">OTG Mini Wrist — 1 lb</option>
    <option value="Smartwatch" data-weight="1">Smartwatch — 1 lb</option>
    <option value="Mobile LTE" data-weight="1">Mobile LTE — 1 lb</option>
    <option value="Other" data-weight="2">Other — 2 lb</option>
  </select>

  <label>Device Serial (Optional)</label>
  <input type="text" name="deviceSerial" />

  <label>Return Reason (Optional)</label>
  <input type="text" name="returnReason" />

  <button type="submit" id="submitBtn">Mail My Return Label</button>
  <div id="message"></div>

</form>

<script>
  const form = document.getElementById("returnForm");
  const messageDiv = document.getElementById("message");
  const submitBtn = document.getElementById("submitBtn");
  const deviceSelect = document.getElementById("deviceType");

  const weightInput = document.createElement("input");
  weightInput.type = "hidden";
  weightInput.name = "weightOz";
  form.appendChild(weightInput);

  deviceSelect.addEventListener("change", function () {
    const selected = deviceSelect.options[deviceSelect.selectedIndex];
    const weightLbs = Number(selected.getAttribute("data-weight") || 2);
    weightInput.value = String(weightLbs * 16);
  });

  function clearFieldErrors() {
    form.querySelectorAll("input, select")
      .forEach(f => f.classList.remove("error-field"));
  }

  function validateForm() {
    clearFieldErrors();
    const requiredFields = form.querySelectorAll("[required]");
    const missing = [];

    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        field.classList.add("error-field");
        missing.push(field.name);
      }
    });

    if (!weightInput.value) {
      deviceSelect.classList.add("error-field");
      missing.push("deviceType");
    }

    if (missing.length) {
      messageDiv.className = "error";
      messageDiv.innerHTML =
        "Please complete all required fields.";
      return false;
    }

    return true;
  }

  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    messageDiv.innerHTML = "";
    messageDiv.className = "";

    if (!validateForm()) return;

    submitBtn.disabled = true;
    submitBtn.innerText = "Processing... Please wait";

    try {
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      const response = await fetch("/api/mail-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Request failed");
      }

      messageDiv.className = "success";
      messageDiv.innerHTML =
        "Success! Your return label has been mailed.<br><br>" +
        (result.uspsTrackingNumber ? "USPS Tracking: " + result.uspsTrackingNumber + "<br>" : "") +
        (result.lobLetterId ? "Mail Tracking ID: " + result.lobLetterId : "");

      form.reset();
      weightInput.value = "";

    } catch (err) {
      messageDiv.className = "error";
      messageDiv.innerHTML = "Error: " + err.message;
    }

    submitBtn.disabled = false;
    submitBtn.innerText = "Mail My Return Label";
  });
</script>

</body>
</html>Use) label via Stamps.com/Endicia SERA
// Weight: from dropdown (1 lb or 2 lb)

const SIGNIN_BASE =
  process.env.SERA_SIGNIN_BASE || "https://signin.stampsendicia.com";
const API_BASE = process.env.SERA_API_BASE || "https://api.stampsendicia.com/sera";

const CLIENT_ID = process.env.SERA_CLIENT_ID;
const CLIENT_SECRET = process.env.SERA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SERA_REFRESH_TOKEN;

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";

// ✅ NEW: read instructions PDF (optional, if present in repo)
const fs = require("fs");
const path = require("path");

// Hardcoded returns warehouse (destination)
const RETURN_TO = {
  name: "Return Warehouse",
  company_name: "Connect America",
  address_line1: "816 Parkway Drive",
  address_line2: "",
  city: "Broomall",
  state_province: "PA",
  postal_code: "19008",
  country_code: "US",
  phone: "8002862622",
  email: "",
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
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

async function getAccessToken() {
  const url = `${SIGNIN_BASE.replace(/\/+$/, "")}/oauth/token`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
    }),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.access_token) {
    throw new Error(
      `Token refresh failed. HTTP ${resp.status} ${JSON.stringify(data)}`
    );
  }

  return data.access_token;
}

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}

function uuidv4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const { randomUUID } = require("crypto");
  return randomUUID();
}

// ✅ NEW: instructions PDF loader (returns "" if missing)
function getInstructionsPdfBase64() {
  try {
    // Put your instructions PDF at ONE of these locations:
    // 1) repo root: /return-instructions.pdf
    // 2) public folder: /public/return-instructions.pdf
    const rootPath = path.join(process.cwd(), "return-instructions.pdf");
    const publicPath = path.join(process.cwd(), "public", "return-instructions.pdf");

    const p = fs.existsSync(rootPath) ? rootPath : fs.existsSync(publicPath) ? publicPath : null;
    if (!p) return "";

    return fs.readFileSync(p).toString("base64");
  } catch {
    return "";
  }
}

function customerFromAddress(body) {
  // ✅ IMPORTANT:
  // - customerEmail is the new field you’ll add in the form
  // - email is kept as a backward-compatible fallback
  const customerEmail = (body.customerEmail || body.email || "").trim();

  return {
    name: (body.name || "").trim(),
    company_name: "",
    address_line1: (body.address1 || "").trim(),
    address_line2: (body.address2 || "").trim(),
    city: (body.city || "").trim(),
    state_province: (body.state || "").trim(),
    postal_code: (body.zip || "").trim(),
    country_code: "US",
    phone: (body.phone || "").trim(),
    email: customerEmail,
  };
}

function normalizeWeightOz(body) {
  // Prefer weightOz from UI; fallback to weightLbs; then default 32 oz
  const oz = Number(body.weightOz);
  if (Number.isFinite(oz) && (oz === 16 || oz === 32)) return oz;

  const lbs = Number(body.weightLbs);
  if (Number.isFinite(lbs) && (lbs === 1 || lbs === 2)) return lbs * 16;

  return 32;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "Method Not Allowed" });
    }

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      return json(res, 500, {
        ok: false,
        error:
          "Missing env vars: SERA_CLIENT_ID, SERA_CLIENT_SECRET, SERA_REFRESH_TOKEN.",
      });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    // ✅ allow mail-label.js to call create-label.js without creating a SharePoint row
    const skipLogging = body?.skipLogging === true;

    // ✅ NEW: agent email (CC) captured from form (optional)
    const agentEmail = String(body.agentEmail || "").trim();

    const required = ["name", "address1", "city", "state", "zip", "phone", "deviceType"];
    const missing = required.filter((k) => !String(body[k] || "").trim());
    if (missing.length) {
      return json(res, 400, {
        ok: false,
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const from_address = customerFromAddress(body);
    if (
      !from_address.name ||
      !from_address.address_line1 ||
      !from_address.city ||
      !from_address.state_province ||
      !from_address.postal_code
    ) {
      return json(res, 400, {
        ok: false,
        error: "From address incomplete (name, address, city, state, zip required).",
      });
    }

    const weightOz = normalizeWeightOz(body);
    const accessToken = await getAccessToken();

    const payload = {
      from_address,
      ship_from_address: from_address,
      sender_address: from_address,

      to_address: RETURN_TO,
      return_address: RETURN_TO,

      service_type: "usps_ground_advantage",
      ship_date: todayYYYYMMDD(),
      is_return_label: true,

      package: {
        packaging_type: "package",
        weight: weightOz,
        weight_unit: "ounce",
      },

      advanced_options: {
        is_pay_on_use: true,
      },

      label_options: {
        label_size: "4x6",
        label_format: "pdf",
        label_output_type: "base64",
      },

      references: {
        reference1: (body.deviceSerial || "").trim(),
        reference2: (body.returnReason || "").trim(),
      },

      is_test_label: false,
    };

    const idempotencyKey = uuidv4();

    const labelResp = await fetch(`${API_BASE.replace(/\/+$/, "")}/v1/labels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const labelData = await labelResp.json().catch(() => null);

    if (!labelResp.ok) {
      return json(res, labelResp.status, {
        ok: false,
        error: "Label creation failed",
        httpStatus: labelResp.status,
        details: labelData,
      });
    }

    const trackingNumber = labelData.tracking_number || "";
    const maybeBase64 = labelData.labels?.[0]?.label_data || labelData.label_data || null;

    // ✅ UPDATED: SharePoint logging is optional
    let sheetsLogged = null;

    if (!skipLogging) {
      // ✅ NEW: only include email + attachments if customer email is provided
      // (your Flow will also conditionally send email when customer_email is not blank)
      const shouldEmail = Boolean(from_address.email);

      const instructionsBase64 = shouldEmail ? getInstructionsPdfBase64() : "";

      const sheetsPayload = {
        request_id: idempotencyKey,
        source: "Connect Print",
        created_at_iso: new Date().toISOString(),

        customer_name: from_address.name,
        customer_email: from_address.email,
        agent_email: agentEmail, // ✅ NEW
        customer_phone: from_address.phone,
        from_address1: from_address.address_line1,
        from_address2: from_address.address_line2,
        from_city: from_address.city,
        from_state: from_address.state_province,
        from_zip: from_address.postal_code,

        device_type: String(body.deviceType || ""),
        device_serial: String(body.deviceSerial || ""),
        return_reason: String(body.returnReason || ""),
        weight_oz: weightOz,

        service_type: labelData.service_type || "usps_ground_advantage",
        tracking_number: trackingNumber,
        label_id: labelData.label_id || "",
        postage_total_usd: labelData?.shipment_cost?.total_amount ?? null,

        // ✅ NEW: attachments for Power Automate email (only when customer_email exists)
        label_pdf_base64: shouldEmail ? (maybeBase64 || "") : "",
        label_pdf_filename: shouldEmail ? "usps-pay-on-use-return-label.pdf" : "",
        instructions_pdf_base64: shouldEmail ? instructionsBase64 : "",
        instructions_pdf_filename: shouldEmail ? "Return-Instructions.pdf" : "",

        status: "Created",
      };

      sheetsLogged = await postToSheets(SHEETS_WEBHOOK_URL, sheetsPayload);
    }

    // ✅ Response stays the same (customer still downloads label from the site)
    if (maybeBase64) {
      return json(res, 200, {
        ok: true,
        trackingNumber,
        filename: "usps-pay-on-use-return-label.pdf",
        mimeType: "application/pdf",
        labelData: maybeBase64,
        sheetsLogged,
      });
    }

    const labelHref = labelData.labels?.[0]?.href || "";
    if (labelHref) {
      const fileResp = await fetch(labelHref, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const buf = Buffer.from(await fileResp.arrayBuffer());
      const base64 = buf.toString("base64");

      return json(res, 200, {
        ok: true,
        trackingNumber,
        filename: "usps-pay-on-use-return-label.pdf",
        mimeType: "application/pdf",
        labelData: base64,
        sheetsLogged,
      });
    }

    return json(res, 500, {
      ok: false,
      error: "Label created but no label data returned (unexpected response shape).",
      raw: labelData,
      sheetsLogged,
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e) });
  }
};
