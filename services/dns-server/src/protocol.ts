// ── DNS Wire Format Codec (RFC 1035) ─────────────────────────────────
// Hand-rolled encode/decode — no node-dns, dns-packet, or similar deps.
// Supports: A, AAAA, CNAME, MX, TXT, NS, SOA.
//
// All multi-byte integers in DNS are network byte order (big endian).
// Names use length-prefixed labels; compression pointers (0xC0xx) are
// resolved on decode and re-emitted without compression on encode.

export const DNS_MAX_UDP_SIZE = 512;
export const DNS_MAX_LABEL_LEN = 63;
export const DNS_MAX_NAME_LEN = 255;

// ── Enums ────────────────────────────────────────────────────────────

export const OpCode = {
  QUERY: 0,
  IQUERY: 1,
  STATUS: 2,
} as const;
export type OpCode = (typeof OpCode)[keyof typeof OpCode];

export const RCode = {
  NOERROR: 0,
  FORMERR: 1,
  SERVFAIL: 2,
  NXDOMAIN: 3,
  NOTIMP: 4,
  REFUSED: 5,
} as const;
export type RCode = (typeof RCode)[keyof typeof RCode];

export const RecordType = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  ANY: 255,
} as const;
export type RecordType = (typeof RecordType)[keyof typeof RecordType];

export const RecordClass = {
  IN: 1,
  ANY: 255,
} as const;
export type RecordClass = (typeof RecordClass)[keyof typeof RecordClass];

export function recordTypeName(t: number): string {
  for (const [k, v] of Object.entries(RecordType)) {
    if (v === t) return k;
  }
  return `TYPE${t}`;
}

// ── Types ────────────────────────────────────────────────────────────

export interface DnsHeader {
  id: number;
  qr: boolean; // 0 = query, 1 = response
  opcode: OpCode;
  aa: boolean; // authoritative answer
  tc: boolean; // truncated
  rd: boolean; // recursion desired
  ra: boolean; // recursion available
  z: number; // reserved; 3 bits
  rcode: RCode;
  qdcount: number;
  ancount: number;
  nscount: number;
  arcount: number;
}

export interface DnsQuestion {
  name: string;
  type: RecordType;
  class: RecordClass;
}

// Data payloads — discriminated by type.
export type RData =
  | { type: typeof RecordType.A; address: string }
  | { type: typeof RecordType.AAAA; address: string }
  | { type: typeof RecordType.CNAME; target: string }
  | { type: typeof RecordType.NS; target: string }
  | { type: typeof RecordType.MX; preference: number; exchange: string }
  | { type: typeof RecordType.TXT; strings: string[] }
  | {
      type: typeof RecordType.SOA;
      mname: string;
      rname: string;
      serial: number;
      refresh: number;
      retry: number;
      expire: number;
      minimum: number;
    };

export interface DnsResourceRecord {
  name: string;
  class: RecordClass;
  ttl: number;
  data: RData;
}

export interface DnsMessage {
  header: DnsHeader;
  questions: DnsQuestion[];
  answers: DnsResourceRecord[];
  authorities: DnsResourceRecord[];
  additionals: DnsResourceRecord[];
}

// ── Decoding ────────────────────────────────────────────────────────

export class DnsDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DnsDecodeError";
  }
}

interface Cursor {
  buf: Uint8Array;
  view: DataView;
  offset: number;
}

function readUint8(c: Cursor): number {
  if (c.offset + 1 > c.buf.length) throw new DnsDecodeError("unexpected EOF (u8)");
  const v = c.view.getUint8(c.offset);
  c.offset += 1;
  return v;
}

function readUint16(c: Cursor): number {
  if (c.offset + 2 > c.buf.length) throw new DnsDecodeError("unexpected EOF (u16)");
  const v = c.view.getUint16(c.offset, false);
  c.offset += 2;
  return v;
}

function readUint32(c: Cursor): number {
  if (c.offset + 4 > c.buf.length) throw new DnsDecodeError("unexpected EOF (u32)");
  const v = c.view.getUint32(c.offset, false);
  c.offset += 4;
  return v;
}

function readBytes(c: Cursor, n: number): Uint8Array {
  if (c.offset + n > c.buf.length) throw new DnsDecodeError("unexpected EOF (bytes)");
  const out = c.buf.slice(c.offset, c.offset + n);
  c.offset += n;
  return out;
}

/**
 * Decode a length-prefixed DNS name. Follows compression pointers.
 * Returns the decoded name (without trailing dot) and leaves the cursor
 * positioned after the first pointer encountered (if any) or after the
 * terminating null.
 */
function decodeName(c: Cursor): string {
  const labels: string[] = [];
  let jumped = false;
  let cursor = c.offset;
  let savedOffset = -1;
  let jumpCount = 0;
  const maxJumps = 32;

  while (true) {
    if (cursor >= c.buf.length) throw new DnsDecodeError("name: unexpected EOF");
    const len = c.buf[cursor];
    if (len === undefined) throw new DnsDecodeError("name: undefined byte");

    if (len === 0) {
      cursor += 1;
      if (!jumped) c.offset = cursor;
      break;
    }

    // Compression pointer: top two bits are 11.
    if ((len & 0xc0) === 0xc0) {
      if (cursor + 1 >= c.buf.length) throw new DnsDecodeError("name: truncated pointer");
      const second = c.buf[cursor + 1];
      if (second === undefined) throw new DnsDecodeError("name: truncated pointer");
      const pointer = ((len & 0x3f) << 8) | second;
      if (!jumped) {
        savedOffset = cursor + 2;
        jumped = true;
      }
      jumpCount += 1;
      if (jumpCount > maxJumps) throw new DnsDecodeError("name: pointer loop");
      cursor = pointer;
      continue;
    }

    if ((len & 0xc0) !== 0) throw new DnsDecodeError(`name: reserved label type 0x${len.toString(16)}`);
    if (len > DNS_MAX_LABEL_LEN) throw new DnsDecodeError("name: label too long");
    if (cursor + 1 + len > c.buf.length) throw new DnsDecodeError("name: label exceeds buffer");

    const labelBytes = c.buf.slice(cursor + 1, cursor + 1 + len);
    labels.push(new TextDecoder("ascii").decode(labelBytes));
    cursor += 1 + len;
  }

  if (jumped) c.offset = savedOffset;
  const name = labels.join(".");
  if (name.length > DNS_MAX_NAME_LEN) throw new DnsDecodeError("name: exceeds 255 bytes");
  return name;
}

function decodeHeader(c: Cursor): DnsHeader {
  const id = readUint16(c);
  const flags = readUint16(c);
  const qdcount = readUint16(c);
  const ancount = readUint16(c);
  const nscount = readUint16(c);
  const arcount = readUint16(c);

  const qr = (flags & 0x8000) !== 0;
  const opcode = ((flags >> 11) & 0x0f) as OpCode;
  const aa = (flags & 0x0400) !== 0;
  const tc = (flags & 0x0200) !== 0;
  const rd = (flags & 0x0100) !== 0;
  const ra = (flags & 0x0080) !== 0;
  const z = (flags >> 4) & 0x07;
  const rcode = (flags & 0x000f) as RCode;

  return { id, qr, opcode, aa, tc, rd, ra, z, rcode, qdcount, ancount, nscount, arcount };
}

function decodeQuestion(c: Cursor): DnsQuestion {
  const name = decodeName(c);
  const type = readUint16(c) as RecordType;
  const klass = readUint16(c) as RecordClass;
  return { name, type, class: klass };
}

function decodeRData(c: Cursor, type: number, rdLength: number): RData {
  const end = c.offset + rdLength;
  if (end > c.buf.length) throw new DnsDecodeError("rdata exceeds buffer");

  switch (type) {
    case RecordType.A: {
      if (rdLength !== 4) throw new DnsDecodeError(`A: expected 4 bytes, got ${rdLength}`);
      const b = readBytes(c, 4);
      return { type: RecordType.A, address: `${b[0]}.${b[1]}.${b[2]}.${b[3]}` };
    }
    case RecordType.AAAA: {
      if (rdLength !== 16) throw new DnsDecodeError(`AAAA: expected 16 bytes, got ${rdLength}`);
      const b = readBytes(c, 16);
      const parts: string[] = [];
      for (let i = 0; i < 16; i += 2) {
        const hi = b[i] ?? 0;
        const lo = b[i + 1] ?? 0;
        parts.push(((hi << 8) | lo).toString(16));
      }
      return { type: RecordType.AAAA, address: parts.join(":") };
    }
    case RecordType.CNAME: {
      const target = decodeName(c);
      if (c.offset !== end) c.offset = end;
      return { type: RecordType.CNAME, target };
    }
    case RecordType.NS: {
      const target = decodeName(c);
      if (c.offset !== end) c.offset = end;
      return { type: RecordType.NS, target };
    }
    case RecordType.MX: {
      const preference = readUint16(c);
      const exchange = decodeName(c);
      if (c.offset !== end) c.offset = end;
      return { type: RecordType.MX, preference, exchange };
    }
    case RecordType.TXT: {
      const strings: string[] = [];
      while (c.offset < end) {
        const len = readUint8(c);
        const bytes = readBytes(c, len);
        strings.push(new TextDecoder("utf-8").decode(bytes));
      }
      return { type: RecordType.TXT, strings };
    }
    case RecordType.SOA: {
      const mname = decodeName(c);
      const rname = decodeName(c);
      const serial = readUint32(c);
      const refresh = readUint32(c);
      const retry = readUint32(c);
      const expire = readUint32(c);
      const minimum = readUint32(c);
      if (c.offset !== end) c.offset = end;
      return { type: RecordType.SOA, mname, rname, serial, refresh, retry, expire, minimum };
    }
    default:
      throw new DnsDecodeError(`unsupported record type ${type}`);
  }
}

function decodeResourceRecord(c: Cursor): DnsResourceRecord {
  const name = decodeName(c);
  const type = readUint16(c);
  const klass = readUint16(c) as RecordClass;
  const ttl = readUint32(c);
  const rdLength = readUint16(c);
  const data = decodeRData(c, type, rdLength);
  return { name, class: klass, ttl, data };
}

export function decodeMessage(buf: Uint8Array): DnsMessage {
  const cursor: Cursor = {
    buf,
    view: new DataView(buf.buffer, buf.byteOffset, buf.byteLength),
    offset: 0,
  };

  const header = decodeHeader(cursor);
  const questions: DnsQuestion[] = [];
  for (let i = 0; i < header.qdcount; i += 1) questions.push(decodeQuestion(cursor));

  const answers: DnsResourceRecord[] = [];
  for (let i = 0; i < header.ancount; i += 1) answers.push(decodeResourceRecord(cursor));

  const authorities: DnsResourceRecord[] = [];
  for (let i = 0; i < header.nscount; i += 1) authorities.push(decodeResourceRecord(cursor));

  const additionals: DnsResourceRecord[] = [];
  for (let i = 0; i < header.arcount; i += 1) additionals.push(decodeResourceRecord(cursor));

  return { header, questions, answers, authorities, additionals };
}

// ── Encoding ────────────────────────────────────────────────────────

export class DnsEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DnsEncodeError";
  }
}

class Writer {
  private chunks: number[] = [];

  get length(): number {
    return this.chunks.length;
  }

  u8(v: number): void {
    this.chunks.push(v & 0xff);
  }

  u16(v: number): void {
    this.chunks.push((v >> 8) & 0xff, v & 0xff);
  }

  u32(v: number): void {
    this.chunks.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }

  bytes(b: Uint8Array): void {
    for (const x of b) this.chunks.push(x);
  }

  name(n: string): void {
    // Empty name → root.
    if (n === "" || n === ".") {
      this.u8(0);
      return;
    }
    const labels = n.split(".");
    let total = 1; // terminating null
    for (const l of labels) {
      if (l.length === 0) throw new DnsEncodeError(`name: empty label in "${n}"`);
      if (l.length > DNS_MAX_LABEL_LEN) throw new DnsEncodeError(`name: label too long`);
      total += 1 + l.length;
    }
    if (total > DNS_MAX_NAME_LEN) throw new DnsEncodeError("name: exceeds 255 bytes");

    const encoder = new TextEncoder();
    for (const l of labels) {
      const bytes = encoder.encode(l);
      this.u8(bytes.length);
      this.bytes(bytes);
    }
    this.u8(0);
  }

  // Reserves 2 bytes; returns a setter for the length once known.
  lengthSlot(): (len: number) => void {
    const idx = this.chunks.length;
    this.chunks.push(0, 0);
    return (len: number) => {
      this.chunks[idx] = (len >> 8) & 0xff;
      this.chunks[idx + 1] = len & 0xff;
    };
  }

  snapshot(): number {
    return this.chunks.length;
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

function encodeIPv4(addr: string, w: Writer): void {
  const parts = addr.split(".");
  if (parts.length !== 4) throw new DnsEncodeError(`A: invalid IPv4 "${addr}"`);
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new DnsEncodeError(`A: invalid octet "${p}" in "${addr}"`);
    }
    w.u8(n);
  }
}

function encodeIPv6(addr: string, w: Writer): void {
  // Handle :: expansion.
  const [leftStr, rightStr] = addr.split("::") as [string] | [string, string];
  const left = leftStr === "" ? [] : leftStr.split(":");
  const right = rightStr === undefined ? [] : rightStr === "" ? [] : rightStr.split(":");
  if (rightStr === undefined && left.length !== 8) {
    throw new DnsEncodeError(`AAAA: invalid IPv6 "${addr}"`);
  }
  const total = left.length + right.length;
  if (rightStr !== undefined && total > 8) {
    throw new DnsEncodeError(`AAAA: too many groups in "${addr}"`);
  }
  const pad = rightStr === undefined ? 0 : 8 - total;
  const groups = [...left, ...Array<string>(pad).fill("0"), ...right];
  if (groups.length !== 8) throw new DnsEncodeError(`AAAA: expected 8 groups in "${addr}"`);
  for (const g of groups) {
    const n = Number.parseInt(g, 16);
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) {
      throw new DnsEncodeError(`AAAA: invalid group "${g}" in "${addr}"`);
    }
    w.u16(n);
  }
}

function encodeRData(data: RData, w: Writer): void {
  const setLen = w.lengthSlot();
  const start = w.snapshot();

  switch (data.type) {
    case RecordType.A:
      encodeIPv4(data.address, w);
      break;
    case RecordType.AAAA:
      encodeIPv6(data.address, w);
      break;
    case RecordType.CNAME:
      w.name(data.target);
      break;
    case RecordType.NS:
      w.name(data.target);
      break;
    case RecordType.MX:
      w.u16(data.preference);
      w.name(data.exchange);
      break;
    case RecordType.TXT: {
      const encoder = new TextEncoder();
      for (const s of data.strings) {
        const bytes = encoder.encode(s);
        if (bytes.length > 255) throw new DnsEncodeError("TXT: string > 255 bytes");
        w.u8(bytes.length);
        w.bytes(bytes);
      }
      break;
    }
    case RecordType.SOA:
      w.name(data.mname);
      w.name(data.rname);
      w.u32(data.serial);
      w.u32(data.refresh);
      w.u32(data.retry);
      w.u32(data.expire);
      w.u32(data.minimum);
      break;
  }

  setLen(w.snapshot() - start);
}

function encodeResourceRecord(rr: DnsResourceRecord, w: Writer): void {
  w.name(rr.name);
  w.u16(rr.data.type);
  w.u16(rr.class);
  w.u32(rr.ttl);
  encodeRData(rr.data, w);
}

export function encodeMessage(msg: DnsMessage): Uint8Array {
  const w = new Writer();
  const h = msg.header;

  let flags = 0;
  if (h.qr) flags |= 0x8000;
  flags |= (h.opcode & 0x0f) << 11;
  if (h.aa) flags |= 0x0400;
  if (h.tc) flags |= 0x0200;
  if (h.rd) flags |= 0x0100;
  if (h.ra) flags |= 0x0080;
  flags |= (h.z & 0x07) << 4;
  flags |= h.rcode & 0x000f;

  w.u16(h.id);
  w.u16(flags);
  w.u16(msg.questions.length);
  w.u16(msg.answers.length);
  w.u16(msg.authorities.length);
  w.u16(msg.additionals.length);

  for (const q of msg.questions) {
    w.name(q.name);
    w.u16(q.type);
    w.u16(q.class);
  }
  for (const rr of msg.answers) encodeResourceRecord(rr, w);
  for (const rr of msg.authorities) encodeResourceRecord(rr, w);
  for (const rr of msg.additionals) encodeResourceRecord(rr, w);

  return w.toUint8Array();
}

// ── Convenience: build a response from a request ────────────────────

export interface BuildResponseOptions {
  answers?: DnsResourceRecord[];
  authorities?: DnsResourceRecord[];
  additionals?: DnsResourceRecord[];
  rcode?: RCode;
  aa?: boolean;
  ra?: boolean;
}

export function buildResponse(request: DnsMessage, opts: BuildResponseOptions = {}): DnsMessage {
  return {
    header: {
      id: request.header.id,
      qr: true,
      opcode: request.header.opcode,
      aa: opts.aa ?? true,
      tc: false,
      rd: request.header.rd,
      ra: opts.ra ?? false,
      z: 0,
      rcode: opts.rcode ?? RCode.NOERROR,
      qdcount: request.questions.length,
      ancount: opts.answers?.length ?? 0,
      nscount: opts.authorities?.length ?? 0,
      arcount: opts.additionals?.length ?? 0,
    },
    questions: request.questions,
    answers: opts.answers ?? [],
    authorities: opts.authorities ?? [],
    additionals: opts.additionals ?? [],
  };
}
