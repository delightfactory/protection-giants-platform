import { requireAdminProfile } from "@/lib/auth/operational-profile";
import {
  OuterRollLabelPlanError,
  buildOuterRollLabelPlan,
} from "@/lib/labels/outer-roll-label-plan";
import { OuterRollLabelPdfError } from "@/lib/labels/outer-roll-label-pdf";
import { OuterRollMachineCodeError } from "@/lib/labels/outer-roll-machine-codes";
import {
  RollPrintPackLayoutError,
  planRollPrintPackMasterLayout,
} from "@/lib/labels/roll-print-pack-layout";
import {
  RollPrintPackPdfError,
  renderRollPrintPackPdf,
} from "@/lib/labels/roll-print-pack-pdf";
import {
  RollPrintPackPlanError,
  buildRollPrintPackPlan,
} from "@/lib/labels/roll-print-pack-plan";
import {
  RollPrintPackSourceError,
  loadRollPrintPackSource,
} from "@/lib/labels/roll-print-pack-source.server";
import {
  OuterRollLabelRequestError,
  parseOuterRollLabelChunk,
  parseOuterRollLabelSelection,
} from "@/lib/labels/outer-roll-label-request";
import { WarrantyQrLabelPdfError } from "@/lib/labels/warranty-qr-label-pdf";
import { getPublicSiteOrigin } from "@/lib/public-site";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request: Request, { params }: RouteContext) {
  await requireAdminProfile();
  const { id } = await params;
  if (!uuidPattern.test(id)) return textResponse("أمر الإنتاج غير موجود.", 404);

  const url = new URL(request.url);

  try {
    const source = await loadRollPrintPackSource(id);
    if (!source) return textResponse("أمر الإنتاج غير موجود.", 404);

    const selection = parseOuterRollLabelSelection({
      mode: url.searchParams.get("mode") ?? undefined,
      lot: url.searchParams.get("lot") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    const outerPlan = buildOuterRollLabelPlan({
      publicSiteOrigin: getPublicSiteOrigin(),
      product: source.product,
      order: source.order,
      lots: source.lots,
      rolls: source.rolls,
      selection,
    });
    const packPlan = buildRollPrintPackPlan({
      outerPlan,
      warrantyIdentities: source.warrantyIdentities,
    });

    const chunkNumber = parseOuterRollLabelChunk(
      url.searchParams.get("chunk") ?? undefined,
      packPlan.chunks.length,
    );
    const chunk = packPlan.chunks[chunkNumber - 1];
    if (!chunk) return textResponse("جزء الطباعة المطلوب غير موجود.", 404);

    const firstPackOrdinal = 1 + packPlan.chunks
      .slice(0, chunkNumber - 1)
      .reduce((sum, candidate) => sum + candidate.packCount, 0);
    const layout = planRollPrintPackMasterLayout({
      chunk,
      firstPackOrdinal,
      totalPackCount: packPlan.packCount,
    });
    const pdf = await renderRollPrintPackPdf(layout);
    const responseBody = new Uint8Array(pdf).buffer;
    const filename = `PG-ROLL-PACK-${source.order.orderNumber}-part-${chunkNumber}-of-${packPlan.chunks.length}.pdf`;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "X-PG-Roll-Count": String(chunk.packCount),
        "X-PG-Pack-Count": String(chunk.packCount),
        "X-PG-Label-Count": String(chunk.physicalLabelCount),
      },
    });
  } catch (error) {
    if (error instanceof OuterRollLabelRequestError) {
      return textResponse(error.message, 400);
    }
    if (
      error instanceof OuterRollLabelPlanError
      || error instanceof RollPrintPackPlanError
      || error instanceof RollPrintPackSourceError
    ) {
      return textResponse("تم إيقاف إصدار Roll Print Pack لأن بيانات الأمر أو هوية إحدى اللفات لا تجتاز Preflight.", 409);
    }
    if (
      error instanceof OuterRollLabelPdfError
      || error instanceof OuterRollMachineCodeError
      || error instanceof WarrantyQrLabelPdfError
      || error instanceof RollPrintPackLayoutError
      || error instanceof RollPrintPackPdfError
    ) {
      return textResponse("تعذر إنشاء ملف Roll Print Pack لأن محتوى إحدى القطع أو هندسة الـPack لا تجتاز تحقق الإخراج.", 409);
    }
    if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SITE_URL")) {
      return textResponse("عنوان الموقع العام غير مضبوط، لذلك لا يمكن إنشاء Roll QR التشغيلي.", 503);
    }
    throw error;
  }
}
