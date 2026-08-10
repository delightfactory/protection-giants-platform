import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";
import { PRODUCT_ASSET_BUCKET } from "@/lib/products/product-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = createSupabasePublicClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, code, slug, name, product_type, category, version_name, width_mm, length_m, thickness_mil, origin_country, marketing_description, default_warranty_months")
    .eq("status", "active")
    .eq("publication_status", "published")
    .order("name", { ascending: true });

  if (error) throw error;

  if (!products.length) {
    return (
      <>
        <PageIntro
          eyebrow="المنتجات"
          title="أفلام حماية الطلاء"
          description="المنتجات المعتمدة من Protection Giants تظهر هنا بعد نشر محتواها ومواصفاتها رسميًا."
        />
        <div className="container section">
          <EmptyState
            eyebrow="المنتجات"
            title="لا توجد منتجات منشورة حاليًا"
            description="ستظهر هنا المنتجات النشطة فور اعتمادها للنشر العام من الإدارة."
          />
        </div>
      </>
    );
  }

  const admin = createSupabaseAdminClient();
  const productIds = products.map((product) => product.id);
  const { data: imageAssets, error: imageAssetsError } = await admin
    .from("product_assets")
    .select("product_id, storage_path, sort_order")
    .in("product_id", productIds)
    .eq("kind", "image")
    .eq("visibility", "public")
    .order("sort_order", { ascending: true });

  if (imageAssetsError) throw imageAssetsError;

  const firstImageByProduct = new Map<string, string>();
  for (const asset of imageAssets ?? []) {
    if (!firstImageByProduct.has(asset.product_id)) {
      firstImageByProduct.set(asset.product_id, asset.storage_path);
    }
  }

  const imageUrls = new Map<string, string>();
  await Promise.all(
    [...firstImageByProduct.entries()].map(async ([productId, storagePath]) => {
      const { data } = await admin.storage.from(PRODUCT_ASSET_BUCKET).createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) imageUrls.set(productId, data.signedUrl);
    }),
  );

  return (
    <>
      <PageIntro
        eyebrow="المنتجات"
        title="أفلام حماية الطلاء"
        description="استعرض منتجات Protection Giants المنشورة ومواصفاتها الاسمية ومعلومات الضمان المعتمدة."
      />
      <section className="section">
        <div className="container">
          <div className="card-grid">
            {products.map((product) => {
              const imageUrl = imageUrls.get(product.id);
              const descriptor = [product.product_type, product.category, product.version_name].filter(Boolean).join(" · ");

              return (
                <article className="card product-public-card" key={product.id}>
                  {imageUrl ? <img className="product-public-card-image" src={imageUrl} alt={product.name} /> : null}
                  <span className="card-kicker" dir="ltr">{product.code}</span>
                  <h2>{product.name}</h2>
                  {descriptor ? <p>{descriptor}</p> : null}
                  {product.marketing_description ? <p>{product.marketing_description}</p> : null}
                  <div className="product-public-facts">
                    {product.width_mm && product.length_m ? <span>{product.width_mm} mm × {product.length_m} m</span> : null}
                    {product.thickness_mil ? <span>{product.thickness_mil} mil</span> : null}
                    <span>ضمان حتى {product.default_warranty_months} شهر</span>
                    {product.origin_country ? <span>المنشأ: {product.origin_country}</span> : null}
                  </div>
                  <Link href={`/products/${product.slug}`} className="button button-primary">تفاصيل المنتج</Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
