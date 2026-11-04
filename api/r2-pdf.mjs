import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pipeline } from "node:stream/promises";

const filename = "14011702.PDF";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  try {
    const { R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ENDPOINT || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error("Missing R2 configuration");
    }

    const client = new S3Client({
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
    }));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    await pipeline(object.Body, res);
  } catch (error) {
    console.error("R2 PDF read failed", error.name, error.$metadata?.httpStatusCode);
    if (!res.headersSent && !res.destroyed) {
      res.status(502).end("Unable to load PDF");
    }
  }
}
