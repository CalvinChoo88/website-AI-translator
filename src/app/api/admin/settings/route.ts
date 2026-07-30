import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionShop } from "@/lib/adminAuth";
import { isSupportedLocale } from "@/lib/languages";

export async function GET() {
  const shop = await getSessionShop();
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({
    domain: shop.domain,
    sourceLocale: shop.sourceLocale,
    enabledLocales: JSON.parse(shop.enabledLocales || "[]") as string[],
    autoDetect: shop.autoDetect,
  });
}

interface SettingsBody {
  enabledLocales?: string[];
  autoDetect?: boolean;
  sourceLocale?: string;
}

export async function POST(req: NextRequest) {
  const shop = await getSessionShop();
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json()) as SettingsBody;

  if (body.enabledLocales !== undefined) {
    if (!Array.isArray(body.enabledLocales) || !body.enabledLocales.every(isSupportedLocale)) {
      return NextResponse.json({ error: "enabledLocales contains an unsupported locale" }, { status: 400 });
    }
  }
  if (body.sourceLocale !== undefined && !isSupportedLocale(body.sourceLocale)) {
    return NextResponse.json({ error: "Unsupported sourceLocale" }, { status: 400 });
  }

  const updated = await db.shop.update({
    where: { id: shop.id },
    data: {
      ...(body.enabledLocales !== undefined && {
        enabledLocales: JSON.stringify(body.enabledLocales),
      }),
      ...(body.autoDetect !== undefined && { autoDetect: body.autoDetect }),
      ...(body.sourceLocale !== undefined && { sourceLocale: body.sourceLocale }),
    },
  });

  return NextResponse.json({
    domain: updated.domain,
    sourceLocale: updated.sourceLocale,
    enabledLocales: JSON.parse(updated.enabledLocales || "[]") as string[],
    autoDetect: updated.autoDetect,
  });
}
