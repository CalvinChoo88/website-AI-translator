import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionShop } from "@/lib/adminAuth";
import { isSupportedLocale } from "@/lib/languages";
import { getTranslationProviderName, getProviderSupportedLocales } from "@/lib/translation";

export async function GET() {
  const shop = await getSessionShop();
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({
    domain: shop.domain,
    sourceLocale: shop.sourceLocale,
    enabledLocales: JSON.parse(shop.enabledLocales || "[]") as string[],
    autoDetect: shop.autoDetect,
    provider: getTranslationProviderName(),
    // null means "no extra restriction beyond the full catalog"
    providerSupportedLocales: getProviderSupportedLocales(),
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
  const providerSupported = getProviderSupportedLocales();

  if (body.enabledLocales !== undefined) {
    const allSupported = body.enabledLocales.every(
      (code) => isSupportedLocale(code) && (!providerSupported || providerSupported.includes(code)),
    );
    if (!Array.isArray(body.enabledLocales) || !allSupported) {
      return NextResponse.json(
        { error: "enabledLocales contains a locale the active translation provider doesn't support" },
        { status: 400 },
      );
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
