// /api/create-label.js
// USPS Returns (Pay-On-Use) label via Stamps.com/Endicia SERA
// Weight: from dropdown (1 lb or 2 lb)
// Hazmat: all device returns contain batteries, so submit as USPS hazmat/battery

const SIGNIN_BASE =
  process.env.SERA_SIGNIN_BASE || "https://signin.stampsendicia.com";

const API_BASE =
  process.env.SERA_API_BASE || "https://api.stampsendicia.com/sera";

const CLIENT_ID = process.env.SERA_CLIENT_ID;
const CLIENT_SECRET = process.env.SERA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SERA_REFRESH_TOKEN;

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";

// Base returns warehouse destination.
// The customer's name will be added dynamically later.
const RETURN_TO_BASE = {
  name: "Return Warehouse",
  company_name: "Connect America Returns",
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return {
      ok: r.ok,
      status: r.status,
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e),
    };
  }
}

async function getAccessToken() {
  const url = `${SIGNIN_BASE.replace(/\/+$/, "")}/oauth/token`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const { randomUUID } = require("crypto");
  return randomUUID();
}

function customerFromAddress(body) {
  return {
    name: String(body.name || "").trim(),
    company_name: "",
    address_line1: String(body.address1 || "").trim(),
    address_line2: String(body.address2 || "").trim(),
    city: String(body.city || "").trim(),
    state_province: String(body.state || "").trim(),
    postal_code: String(body.zip || "").trim(),
    country_code: "US",
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
  };
}

function normalizeWeightOz(body) {
  // Prefer weightOz from UI; fallback to weightLbs; then default 32 oz
  const oz = Number(body.weightOz);

  if (Number.isFinite(oz) && (oz === 16 || oz === 32)) {
    return oz;
  }

  const lbs = Number(body.weightLbs);

  if (Number.isFinite(lbs) && (lbs === 1 || lbs === 2)) {
    return lbs * 16;
  }

  return 32;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        error: "Method Not Allowed",
      });
    }

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      return json(res, 500, {
        ok: false,
        error:
          "Missing env vars: SERA_CLIENT_ID, SERA_CLIENT_SECRET, SERA_REFRESH_TOKEN.",
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    // Allow mail-label.js to call create-label.js
    // without creating another SharePoint row.
    const skipLogging = body?.skipLogging === true;

    const required = [
      "agentName",
      "name",
      "address1",
      "city",
      "state",
      "zip",
      "phone",
      "deviceType",
    ];

    const missing = required.filter(
      (key) => !String(body[key] || "").trim()
    );

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
        error:
          "From address incomplete (name, address, city, state, zip required).",
      });
    }

    /*
     * Add the customer's full name to the warehouse destination.
     *
     * Example:
     * Return - John Smith
     * Connect America Returns
     * 816 Parkway Drive
     */
    const customerName = String(body.name || "").trim();

    const returnTo = {
      ...RETURN_TO_BASE,

      // Limit the line length to reduce the possibility of truncation
      // or rejection by the label provider.
      name: customerName
        ? `Return - ${customerName}`.slice(0, 35)
        : "Return Warehouse",
    };

    // Weight still comes from the Vercel dropdown.
    const weightOz = normalizeWeightOz(body);

    // All selected devices contain batteries, so every Connect America
    // print return is submitted as hazmat.
    const containsBattery = true;
    const batteryFlag = "H";
    const hazmatType = "Lithium battery installed in equipment";
    const shippingRule = "Ground/surface only";

    const deviceSerial = String(body.deviceSerial || "").trim();
    const returnReason = String(body.returnReason || "").trim();
    const salesforceId = String(body.salesforceId || "").trim();

    // Internal reference only.
    // USPS official H comes from advanced_options.special_handling.
    const reference1 = deviceSerial
      ? `${batteryFlag}-${deviceSerial}`
      : batteryFlag;

    const accessToken = await getAccessToken();

    const payload = {
      from_address,
      ship_from_address: from_address,
      sender_address: from_address,

      // Dynamic destination includes the customer's full name.
      to_address: returnTo,
      return_address: returnTo,

      service_type: "usps_ground_advantage",
      ship_date: todayYYYYMMDD(),
      is_return_label: true,
      delivery_confirmation_type: "tracking",

      package: {
        packaging_type: "package",
        weight: weightOz,
        weight_unit: "ounce",
      },

      advanced_options: {
        is_pay_on_use: true,

        return_options: {
          outbound_label_id: "0",
        },

        special_handling: {
          special_contents_type: "hazardous_materials",
          fragile: false,
        },
      },

      label_options: {
        label_size: "4x6",
        label_format: "pdf",
        label_output_type: "base64",
      },

      references: {
        reference1,
        reference2: returnReason,
      },

      is_test_label: false,
    };

    const idempotencyKey = uuidv4();

    const labelResp = await fetch(
      `${API_BASE.replace(/\/+$/, "")}/v1/labels`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      }
    );

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

    const maybeBase64 =
      labelData.labels?.[0]?.label_data ||
      labelData.label_data ||
      null;

    // SharePoint logging is optional.
    let sheetsLogged = null;

    if (!skipLogging) {
      const sheetsPayload = {
        request_id: idempotencyKey,
        source: "Connect Print",
        created_at_iso: new Date().toISOString(),

        agent_name: String(body.agentName || ""),

        customer_name: from_address.name,
        customer_email: from_address.email,
        customer_phone: from_address.phone,

        from_address1: from_address.address_line1,
        from_address2: from_address.address_line2,
        from_city: from_address.city,
        from_state: from_address.state_province,
        from_zip: from_address.postal_code,

        device_type: String(body.deviceType || ""),
        device_serial: deviceSerial,
        salesforce_id: salesforceId,
        return_reason: returnReason,
        weight_oz: weightOz,

        // Battery/H fields for SharePoint, Excel, and Power Automate.
        battery_flag: batteryFlag,
        contains_battery: containsBattery,
        hazmat_type: hazmatType,
        shipping_rule: shippingRule,

        // Audit fields showing what was sent to SERA.
        sera_special_contents_type: "hazardous_materials",
        sera_special_handling_fragile: false,

        service_type:
          labelData.service_type || "usps_ground_advantage",

        tracking_number: trackingNumber,
        label_id: labelData.label_id || "",

        postage_total_usd:
          labelData?.shipment_cost?.total_amount ?? null,

        status: "Created",
      };

      sheetsLogged = await postToSheets(
        SHEETS_WEBHOOK_URL,
        sheetsPayload
      );
    }

    if (maybeBase64) {
      return json(res, 200, {
        ok: true,
        trackingNumber,
        filename: "usps-pay-on-use-return-label.pdf",
        mimeType: "application/pdf",
        labelData: maybeBase64,
        sheetsLogged,

        batteryFlag,
        containsBattery,
        hazmatType,
        shippingRule,
        seraSpecialContentsType: "hazardous_materials",
      });
    }

    const labelHref = labelData.labels?.[0]?.href || "";

    if (labelHref) {
      const fileResp = await fetch(labelHref, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!fileResp.ok) {
        return json(res, 500, {
          ok: false,
          error:
            `Label created but fetching label PDF failed. ` +
            `HTTP ${fileResp.status}`,
          sheetsLogged,
        });
      }

      const buf = Buffer.from(await fileResp.arrayBuffer());
      const base64 = buf.toString("base64");

      return json(res, 200, {
        ok: true,
        trackingNumber,
        filename: "usps-pay-on-use-return-label.pdf",
        mimeType: "application/pdf",
        labelData: base64,
        sheetsLogged,

        batteryFlag,
        containsBattery,
        hazmatType,
        shippingRule,
        seraSpecialContentsType: "hazardous_materials",
      });
    }

    return json(res, 500, {
      ok: false,
      error:
        "Label created but no label data returned " +
        "(unexpected response shape).",
      raw: labelData,
      sheetsLogged,
    });
  } catch (e) {
    return json(res, 500, {
      ok: false,
      error: String(e),
    });
  }
};
