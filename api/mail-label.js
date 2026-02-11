// /api/mail-label.js
import { PDFDocument, StandardFonts } from "pdf-lib";

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

/* 👇👇👇 PUT THE PDF BUILDER FUNCTION RIGHT HERE 👇👇👇 */

async function buildInstructionsPlusLabelPdf({ labelBase64, customerName }) {
  ...
}

/* 👆👆👆 END OF HELPER 👆👆👆 */

export default async function handler(req, res) {
  try {
     // 1) call your existing /api/create-label
     // 2) pass returned base64 into buildInstructionsPlusLabelPdf()
     // 3) send result to Lob
  } catch (e) {
     return json(res, 500, { ok:false, error:String(e) });
  }
}
