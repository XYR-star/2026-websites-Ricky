import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import handler from "../api/r2-pdf.mjs";

class TestResponse extends Writable {
  headers = new Map();
  chunks = [];
  headersSent = false;
  statusCode = 200;

  setHeader(name, value) {
    this.headers.set(name.toLowerCase(), value);
  }

  removeHeader(name) {
    this.headers.delete(name.toLowerCase());
  }

  status(status) {
    this.statusCode = status;
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.headersSent = true;
    this.chunks.push(chunk);
    callback();
  }
}

function mockR2(t, send) {
  for (const [key, value] of Object.entries({
    R2_ENDPOINT: "https://r2-test.example.invalid",
    R2_BUCKET_NAME: "fixture",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  t.mock.method(S3Client.prototype, "send", send);
  return t.mock.method(S3Client.prototype, "destroy", () => {});
}

test("PDF response streams the fixed object and releases its R2 client", async (t) => {
  const body = Buffer.from("%PDF-1.4\nFixture");
  const destroy = mockR2(t, async (command, { abortSignal }) => {
    assert.deepEqual(command.input, { Bucket: "fixture", Key: "14011702.PDF" });
    assert.equal(abortSignal.aborted, false);
    return { Body: Readable.from([body]) };
  });
  const response = new TestResponse();
  await handler({ method: "GET", query: { key: "another.pdf" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.concat(response.chunks), body);
  assert.equal(destroy.mock.callCount(), 1);
});

test("PDF request aborts its pending R2 read when the client disconnects", async (t) => {
  const response = new TestResponse();
  let signal;
  const destroy = mockR2(t, (_command, { abortSignal }) => new Promise((_resolve, reject) => {
    signal = abortSignal;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    response.destroy();
  }));
  await handler({ method: "GET" }, response);
  assert.equal(signal.aborted, true);
  assert.equal(response.chunks.length, 0);
  assert.equal(destroy.mock.callCount(), 1);
});

test("PDF request times out if R2 does not provide response headers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "error", () => {});
  const destroy = mockR2(t, (_command, { abortSignal }) => new Promise((_resolve, reject) => {
    abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
  }));
  const response = new TestResponse();
  const handled = handler({ method: "GET" }, response);
  t.mock.timers.tick(15_000);
  await handled;
  await finished(response);
  assert.equal(response.statusCode, 504);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.has("content-disposition"), false);
  assert.equal(destroy.mock.callCount(), 1);
});
