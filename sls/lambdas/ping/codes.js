/**
 * Access codes: a code the owner hands to somebody, worth N days of full
 * access in the app.
 *
 *   POST /ping/cde/D082126I-TF-V1.31.0
 *   { "code": "K7WQ-M2XD", "dev": false }
 *   -> 200 { "ok": true, "days": 30 }      the code exists; the app extends its window
 *   -> 404 { "ok": false }                 no such code
 *   -> 409 { "ok": false, "used": true }   the code was already redeemed
 *   -> 400 { "ok": false }                 not a code at all
 *
 * Like the giveaway sign-up beside it, THIS IS NOT A PING. It rides the ping
 * function for the plumbing (the install code in the path gives platform and
 * version with no second decoder) and it ANSWERS, because the app has to be
 * told the length. It carries the code the user typed and nothing else: no
 * identifier, nothing from the journal.
 *
 * One row per code (`PK CODE`, `SK <normalised code>`), created ONLY through
 * the authenticated `/master` API. Two properties, both deliberate:
 *
 *   - A code is SINGLE-USE. The first redemption stamps the row (`redeemed`,
 *     `redeemedAt`) in one conditional write, so two phones racing for one code
 *     cannot both win, and every later attempt answers 409. Somebody who
 *     reinstalls or changes phone asks the owner for another code. The cost is
 *     stated plainly: with no install identifier the server cannot tell "the
 *     same phone asking again" from anybody else, so a redemption whose ANSWER
 *     is lost on the way back (the phone dropped off the network mid-request)
 *     has spent the code without granting anything, and the fix is a new code.
 *   - A code is NOT revocable. There is no delete and no edit: the grant lives
 *     on the phone the moment it is redeemed, so removing the row could only
 *     ever stop a redemption that has not happened yet while looking like it
 *     did more.
 *
 * The route is public, so the code is the whole secret. A generated code is 8
 * characters over a 31-letter alphabet (~8.5e11); a hand-typed one must be at
 * least CODE_MIN characters.
 */
const crypto = require('node:crypto');
const {
  GetCommand, PutCommand, UpdateCommand, QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const PK = 'CODE';
const CODE_MIN = 6;
const CODE_MAX = 24;
/** 999 is the owner's "forever"; nothing longer means anything. */
const DAYS_MAX = 999;
const NOTE_MAX = 120;
const CODE_BODY_MAX = 512;
/** No 0/O, 1/I: a code is read aloud and typed on a phone. */
const GEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GEN_LENGTH = 8;

/** Uppercased with everything but letters and digits dropped, so "k7wq-m2xd",
 *  "K7WQ M2XD" and "K7WQM2XD" are one code. Null when it cannot be one. */
const normCode = (raw) => {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= CODE_MIN && s.length <= CODE_MAX ? s : null;
};

const normDays = (raw) => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 && n <= DAYS_MAX ? n : null;
};

const generateCode = () => {
  const bytes = crypto.randomBytes(GEN_LENGTH);
  let out = '';
  // 256 is a multiple of 32, so the modulo carries no bias.
  for (let i = 0; i < GEN_LENGTH; i += 1) out += GEN_ALPHABET[bytes[i] % GEN_ALPHABET.length];
  return out;
};

/** Decode one redemption body, or null if it is not one. Pure. */
const readRedeem = (event) => {
  let raw = event?.body;
  if (typeof raw !== 'string' || !raw) return null;
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (raw.length > CODE_BODY_MAX) return null;
  let b;
  try { b = JSON.parse(raw); } catch { return null; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const code = normCode(b.code);
  return code ? { code, dev: b.dev === true } : null;
};

const isMissing = (err) => err?.name === 'ConditionalCheckFailedException';

const isUsed = (item) => Number(item?.redeemed) > 0;

/**
 * Honour a code, ONCE: `{ status: 'ok', days }`, `{ status: 'used' }` or
 * `{ status: 'missing' }`. The claim is one conditional write, so a code can
 * be won by exactly one request. A development build is told what the code is
 * worth without spending it, so the route can be exercised without burning the
 * owner's codes.
 */
const redeemCode = async (ddb, table, r, install, nowMs) => {
  const peek = async () => {
    const res = await ddb.send(new GetCommand({ TableName: table, Key: { PK, SK: r.code } }));
    if (!res.Item) return { status: 'missing' };
    if (isUsed(res.Item)) return { status: 'used' };
    const days = normDays(res.Item.days);
    return days ? { status: 'ok', days } : { status: 'missing' };
  };
  if (r.dev) return peek();
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { PK, SK: r.code },
      ConditionExpression: 'attribute_exists(PK) AND (attribute_not_exists(#n) OR #n = :zero)',
      UpdateExpression: 'SET #n = :one, #at = :now, #platform = :platform, #version = :version',
      ExpressionAttributeNames: {
        '#n': 'redeemed', '#at': 'redeemedAt', '#platform': 'redeemedPlatform', '#version': 'redeemedVersion',
      },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
        ':now': new Date(nowMs).toISOString(),
        ':platform': install.platform || 'U',
        ':version': install.version || null,
      },
      ReturnValues: 'ALL_NEW',
    }));
    const days = normDays(res.Attributes?.days);
    return days ? { status: 'ok', days } : { status: 'missing' };
  } catch (err) {
    if (!isMissing(err)) throw err;
    // Refused: either there is no such code or it is spent. Which one is a
    // different sentence on the card, so look.
    const now = await peek();
    return now.status === 'ok' ? { status: 'used' } : now;
  }
};

/**
 * Create a code (dashboard only). `payload.code` is optional: left empty, one
 * is generated. Never overwrites: a code that exists is refused, since
 * replacing it would silently change what an already-issued code is worth.
 */
const createCode = async (ddb, table, payload = {}, nowMs = Date.now()) => {
  const days = normDays(payload.days);
  if (!days) return { ok: false, error: `Days must be a whole number from 1 to ${DAYS_MAX}.` };
  const wanted = typeof payload.code === 'string' ? payload.code.trim() : '';
  let fixed = null;
  if (wanted) {
    fixed = normCode(wanted);
    if (!fixed) {
      return { ok: false, error: `A code is ${CODE_MIN} to ${CODE_MAX} letters and numbers.` };
    }
  }
  const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, NOTE_MAX) : '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = fixed || generateCode();
    const row = {
      PK, SK: code, entityType: 'CODE', code, days, note,
      createdAt: new Date(nowMs).toISOString(), redeemed: 0,
    };
    try {
      // eslint-disable-next-line no-await-in-loop
      await ddb.send(new PutCommand({
        TableName: table, Item: row, ConditionExpression: 'attribute_not_exists(PK)',
      }));
      return { ok: true, code: publicRow(row) };
    } catch (err) {
      if (!isMissing(err)) throw err;
      if (fixed) return { ok: false, error: 'That code already exists.' };
    }
  }
  return { ok: false, error: 'Could not generate a code. Try again.' };
};

const publicRow = (item) => ({
  code: item.code || item.SK,
  days: Number(item.days) || 0,
  note: item.note || '',
  createdAt: item.createdAt || null,
  used: isUsed(item),
  redeemedAt: item.redeemedAt || null,
  redeemedPlatform: item.redeemedPlatform || null,
  redeemedVersion: item.redeemedVersion || null,
});

/** Every code, newest first. */
const listCodes = async (ddb, table) => {
  const rows = [];
  let ExclusiveStartKey;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await ddb.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': PK },
      ExclusiveStartKey,
    }));
    (res.Items || []).forEach((item) => rows.push(publicRow(item)));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { rows, foreverDays: DAYS_MAX };
};

module.exports = {
  readRedeem, redeemCode, createCode, listCodes, normCode, normDays, generateCode,
  CODE_MIN, CODE_MAX, DAYS_MAX, NOTE_MAX, GEN_ALPHABET, GEN_LENGTH,
};
