import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const APK_CANDIDATES = [
  path.join(process.cwd(), "android-app/app/build/outputs/apk/debug/app-debug.apk"),
  path.join(process.cwd(), "public/opalx-go-android.apk"),
];

export async function GET() {
  for (const candidate of APK_CANDIDATES) {
    try {
      const apkBuffer = await readFile(/* turbopackIgnore: true */ candidate);
      return new Response(new Uint8Array(apkBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": 'attachment; filename="opalx-go-v2.apk"',
          "Content-Length": String(apkBuffer.byteLength),
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // Try next candidate path.
    }
  }

  return new Response(
    JSON.stringify({ error: "APK_NOT_BUILT", message: "opalx-go-v2.apk file not found" }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}
