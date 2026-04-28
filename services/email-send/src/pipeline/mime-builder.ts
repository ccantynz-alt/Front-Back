import type { SendMessageInput } from "../types.ts";

/**
 * Minimal RFC-5322 MIME builder. Multipart/alternative when both html and text.
 * Multipart/mixed wraps attachments. Sufficient for v1 outbound; v2 will move
 * to a streaming MIME composer.
 */
export interface BuiltMime {
  raw: string;
  headers: Record<string, string>;
  body: string;
  messageId: string;
}

const CRLF = "\r\n";

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII headers.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: header sanitisation requires control range
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function genBoundary(prefix: string): string {
  return `----=_${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function genMessageId(domain: string): string {
  const local = crypto.randomUUID().replace(/-/g, "");
  return `<${local}@${domain}>`;
}

function domainOf(addr: string): string {
  const at = addr.lastIndexOf("@");
  return at >= 0 ? addr.slice(at + 1) : addr;
}

export function buildMime(input: SendMessageInput, recipient: string): BuiltMime {
  const headers: Record<string, string> = {};
  const messageId = genMessageId(domainOf(input.from));
  headers["From"] = encodeHeader(input.from);
  headers["To"] = encodeHeader(recipient);
  if (input.cc && input.cc.length > 0) headers["Cc"] = input.cc.map(encodeHeader).join(", ");
  headers["Subject"] = encodeHeader(input.subject);
  headers["Date"] = new Date().toUTCString();
  headers["Message-ID"] = messageId;
  headers["MIME-Version"] = "1.0";
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    if (!(k.toLowerCase() in {})) headers[k] = encodeHeader(v);
  }

  const hasHtml = typeof input.html === "string" && input.html.length > 0;
  const hasText = typeof input.text === "string" && input.text.length > 0;
  const hasAttachments = (input.attachments?.length ?? 0) > 0;

  const altParts: string[] = [];
  if (hasText) {
    altParts.push(
      [
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(input.text ?? "", "utf8").toString("base64"),
      ].join(CRLF),
    );
  }
  if (hasHtml) {
    altParts.push(
      [
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(input.html ?? "", "utf8").toString("base64"),
      ].join(CRLF),
    );
  }
  if (altParts.length === 0) {
    altParts.push(
      [
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("", "utf8").toString("base64"),
      ].join(CRLF),
    );
  }

  let bodyPart: string;
  let bodyContentType: string;

  if (altParts.length > 1) {
    const altBoundary = genBoundary("alt");
    bodyContentType = `multipart/alternative; boundary="${altBoundary}"`;
    bodyPart = altParts.map((p) => `--${altBoundary}${CRLF}${p}`).join(CRLF) + `${CRLF}--${altBoundary}--`;
  } else {
    const single = altParts[0] ?? "";
    const sepIdx = single.indexOf(`${CRLF}${CRLF}`);
    const partHeaders = sepIdx >= 0 ? single.slice(0, sepIdx) : "";
    const partBody = sepIdx >= 0 ? single.slice(sepIdx + 4) : single;
    const ctMatch = /^Content-Type:\s*(.+)$/im.exec(partHeaders);
    bodyContentType = ctMatch?.[1]?.trim() ?? "text/plain; charset=UTF-8";
    const teMatch = /^Content-Transfer-Encoding:\s*(.+)$/im.exec(partHeaders);
    headers["Content-Transfer-Encoding"] = teMatch?.[1]?.trim() ?? "base64";
    bodyPart = partBody;
  }

  if (hasAttachments) {
    const mixedBoundary = genBoundary("mix");
    const attParts: string[] = [];
    attParts.push(
      [
        `Content-Type: ${bodyContentType}`,
        ...(headers["Content-Transfer-Encoding"]
          ? [`Content-Transfer-Encoding: ${headers["Content-Transfer-Encoding"]}`]
          : []),
        "",
        bodyPart,
      ].join(CRLF),
    );
    delete headers["Content-Transfer-Encoding"];
    for (const att of input.attachments ?? []) {
      attParts.push(
        [
          `Content-Type: ${att.contentType}; name="${att.filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${att.filename}"`,
          "",
          att.contentBase64,
        ].join(CRLF),
      );
    }
    bodyContentType = `multipart/mixed; boundary="${mixedBoundary}"`;
    bodyPart =
      attParts.map((p) => `--${mixedBoundary}${CRLF}${p}`).join(CRLF) + `${CRLF}--${mixedBoundary}--`;
  }

  headers["Content-Type"] = bodyContentType;

  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join(CRLF);
  const raw = `${headerLines}${CRLF}${CRLF}${bodyPart}`;
  return { raw, headers, body: bodyPart, messageId };
}
