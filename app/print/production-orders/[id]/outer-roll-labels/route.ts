import { requireAdminProfile } from "@/lib/auth/operational-profile";
import {
  OuterRollLabelPlanError,
  buildOuterRollLabelPlan,
} from "@/lib/labels/outer-roll-label-plan";
import {
  OuterRollLabelPdfError,
  renderOuterRollPrintPdf,
} from "@/lib/labels/outer-roll-label-pdf";
import { OuterRollMachineCodeError } from "@/lib/labels/outer-roll-machine-codes";
import {
  OUTER_ROLL_MASTER_PAGE_PROFILE,
  OuterRollPrintLayoutError,
  planOuterRollPrintLayout,
} from "@/lib/labels/outer-roll-print-layout";
import { loadOuterRollLabelSource } from "@/lib/labels/outer-roll-label-source.server";
import {
  OuterRollLabelRequestError,
  parseOuterRollLabelChunk,
  parseOuterRollLabelSelection,
} from "@/lib/labels/outer-roll-label-request";
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

  const source = await loadOuterRollLabelSource(id);
  if (!source) return textResponse("أمر الإنتاج غير موجود.", 404);

  const url = new URL(request.url);

  try {
    const selection = parseOuterRollLabelSelection({
      mode: url.searchParams.get("mode") ?? undefined,
      lot: url.searchParams.get("lot") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    const plan = buildOuterRollLabelPlan({
      publicSiteOrigin: getPublicSiteOrigin(),
      product: source.product,
      order: source.order,
      lots: source.lots,
      rolls: source.rolls,
      selection,
    });

    const chunkNumber = parseOuterRollLabelChunk(
      url.searchParams.get("chunk") ?? undefined,
      plan.chunks.length,
    );
    const chunk = plan.chunks[chunkNumber - 1];
    if (!chunk) return textResponse("جزء الطباعة المطلوب غير موجود.", 404);

    const layout = planOuterRollPrintLayout(chunk.items, OUTER_ROLL_MASTER_PAGE_PROFILE);
    const pdf = await renderOuterRollPrintPdf(layout);
    const responseBody = new Uint8Array(pdf).buffer;
    const filename = `PG-OUTER-ROLL-${source.order.orderNumber}-part-${chunkNumber}-of-${plan.chunks.length}.pdf`;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "X-PG-Roll-Count": String(chunk.rollCount),
        "X-PG-Label-Count": String(chunk.labelCount),
      },
    });
  } catch (error) {
    if (error instanceof OuterRollLabelRequestError) {
      return textResponse(error.message, 400);
    }
    if (error instanceof OuterRollLabelPlanError) {
      return textResponse("تم إيقاف إصدار الملصقات لأن بيانات الأمر أو الهوية لا تجتاز Preflight.", 409);
    }
    if (
      error instanceof OuterRollLabelPdfError
      || error instanceof OuterRollMachineCodeError
      || error instanceof OuterRollPrintLayoutError
    ) {
      return textResponse("تعذر إنشاء ملف الطباعة لأن محتوى الملصق أو هندسته لا يجتاز تحقق الإخراج. راجع بيانات المنتج قبل إعادة المحاولة.", 409);
    }
    if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SITE_URL")) {
      return textResponse("عنوان الموقع العام غير مضبوط، لذلك لا يمكن إنشاء Roll QR.", 503);
    }
    throw error;
  }
}
