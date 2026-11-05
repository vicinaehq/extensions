import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMatches, pointScore, setScores } from "../src/scores-data";
import { match, payload } from "./fixtures";

test("reads player-major sets and identifies the serving player", () => {
  const score = parseMatches(payload).matches[0].score;
  assert.equal(setScores(score), "6–4, 3–4");
  assert.equal(pointScore(score), "15–30");
  assert.equal(score?.server, 2);
});

for (const score of [
  null,
  { ...match.score, games: null },
  { ...match.score, games: [] },
]) {
  test(`missing set scores never become 0–0: ${JSON.stringify(score?.games ?? null)}`, () => {
    const result = parseMatches({ ...payload, data: [{ ...match, score }] })
      .matches[0];
    assert.equal(setScores(result.score), "Score unavailable");
  });
}

test("preserves nullable points and unknown serve", () => {
  const score = parseMatches({
    ...payload,
    data: [
      {
        ...match,
        score: { ...match.score, points: [null, null], server: null },
      },
    ],
  }).matches[0].score;
  assert.equal(pointScore(score), "Unavailable");
  assert.equal(score?.server, null);
});

test("labels tiebreak point counts without converting them to normal game points", () => {
  const score = parseMatches({
    ...payload,
    data: [
      {
        ...match,
        score: { ...match.score, points: ["10", "8"], is_tiebreak: true },
      },
    ],
  }).matches[0].score;
  assert.equal(pointScore(score), "10–8 (tiebreak)");
});

test("preserves zero games and partial player scores", () => {
  assert.equal(
    setScores({ ...match.score, server: 1, games: [[0, 6], [0]] }),
    "0–0, 6–—",
  );
});

test("retains feed status and stale flag", () => {
  const parsed = parseMatches({
    ...payload,
    data: [
      {
        ...match,
        event_status: "Interrupted",
        score: { ...match.score, stale: true },
      },
    ],
  }).matches[0];
  assert.equal(parsed.event_status, "Interrupted");
  assert.equal(parsed.score?.stale, true);
});

test("recognizes an empty live slate and a partial page", () => {
  assert.deepEqual(parseMatches({ data: [], meta: { has_more: false } }), {
    matches: [],
    hasMore: false,
  });
  assert.equal(
    parseMatches({ ...payload, meta: { has_more: true } }).hasMore,
    true,
  );
});

for (const value of [
  null,
  {},
  { data: [] },
  { ...payload, data: [{}] },
  { ...payload, data: [match, match] },
  { ...payload, data: [{ ...match, score: { ...match.score, games: "6–4" } }] },
]) {
  test(`rejects an invalid payload: ${JSON.stringify(value)}`, () =>
    assert.throws(() => parseMatches(value)));
}
