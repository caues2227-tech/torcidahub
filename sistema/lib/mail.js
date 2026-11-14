// Envio de e-mail: Resend (recomendado) ou outbox local se não houver chave.
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./config");

function fromAddr() {
  return String(process.env.MAIL_FROM || "Torcida <onboarding@resend.dev>").trim();
}

function gravarOutbox(msg) {
  const arq = path.join(DATA_DIR, "mail-outbox.json");
  let lista = [];
  try {
    lista = JSON.parse(fs.readFileSync(arq, "utf8"));
    if (!Array.isArray(lista)) lista = [];
  } catch { lista = []; }
  lista.unshift({ ...msg, em: new Date().toISOString() });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(arq, JSON.stringify(lista.slice(0, 40), null, 2));
}

async function viaResend(to, subject, text, html) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddr(),
      to: [to],
      subject,
      text,
      html: html || ("<p>" + String(text).replace(/\n/g, "<br>") + "</p>")
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("Resend " + r.status + ": " + t.slice(0, 220));
  }
  return true;
}

async function enviarEmail({ to, subject, text, html }) {
  try {
    if (await viaResend(to, subject, text, html)) {
      console.log("[mail] enviado →", to);
      return { ok: true, via: "resend" };
    }
  } catch (e) {
    console.warn("[mail] Resend falhou:", e.message);
  }
  gravarOutbox({ to, subject, text });
  console.log("[mail] sem RESEND_API_KEY — link em data/mail-outbox.json");
  console.log("[mail]", text);
  return { ok: true, via: "outbox" };
}

module.exports = { enviarEmail };
