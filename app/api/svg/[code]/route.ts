import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { resolve } from "path";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  // Strip optional .svg extension (URL is built as /api/svg/<code>.svg)
  const code = rawCode.endsWith(".svg") ? rawCode.slice(0, -4) : rawCode;

  // Validate: only allow lowercase hex + hyphens (e.g. "1f602", "1f1fa-1f1f8")
  if (!/^[0-9a-f]+([-][0-9a-f]+)*$/.test(code)) {
    return new NextResponse("Invalid emoji code", { status: 400 });
  }

  const filePath = resolve(process.cwd(), "data", "svg", `${code}.svg`);

  try {
    const svg = await readFile(filePath);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(`SVG not found: ${code}`, { status: 404 });
  }
}
