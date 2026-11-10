import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pipeline } from "node:stream/promises";

const filename = "14011702.PDF";
const OPEN_TIMEOUT_MS = 15_000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableFinished) controller.abort();
  };
  res.once("close", abortOnDisconnect);
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("R2 did not respond in time", "TimeoutError"));
  }, OPEN_TIMEOUT_MS);
  timeout.unref();
  let client;
  try {
    const { R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ENDPOINT || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error("Missing R2 configuration");
    }

    client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    const object = await client.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filename,
    }), { abortSignal: controller.signal });
    clearTimeout(timeout);
    controller.signal.throwIfAborted();
    if (!object.Body) throw new Error("Missing R2 object body");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    await pipeline(object.Body, res, { signal: controller.signal });
  } catch (error) {
    const timedOut = controller.signal.reason?.name === "TimeoutError";
    if (error.name !== "AbortError" || timedOut) {
      console.error("R2 PDF read failed", error.name, error.$metadata?.httpStatusCode);
    }
    if (!res.headersSent && !res.destroyed) {
      res.removeHeader("Content-Disposition");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(timedOut ? 504 : 502).end("Unable to load PDF");
    }
  } finally {
    clearTimeout(timeout);
    res.off("close", abortOnDisconnect);
    client?.destroy();
  }
}
