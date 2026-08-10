import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { PRODUCT_ASSET_BUCKET } from "@/lib/products/product-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

type PublicProductPageProps = {
  params: Promise<{ slug: string }>;
};

const assetKindLabels: Record<string, string> = {
  datasheet: "Data Sheet",
  catalogue: "الكتالوج",
  document: "مستند",
};

export default async function PublicProductPage({ params }: PublicProductPageProps) {
  const { slug } = await params;
  const supabase = createSupabasePublicClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, code, slug, name, product_type, category, version_name, width_mm, length_m, thickness_mil, weight_kg, origin_country, marketing_description, technical_description, features, default_warranty_months, warranty_coverage, care_instructions")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("publication_status", "published")
    .maybeSingle();

  if (error) throw error;
  if (!product) notFound();

  const admin = createSupabaseAdminClient();
  const { data: assets, error: assetsError } = await admin
    .from("product_assets")
    .select("id, kind, label, storage_path, original_name, sort_order")
    .eq("product_id", product.id)
    .eq("visibility", "public")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (assetsError) throw assetsError;

  const publicAssets = await Promise.all(
    (assets ?? []).map(async (asset) => {
      const { data } = await admin.storage.from(PRODUCT_ASSET_BUCKET).createSignedUrl(asset.storage_path, 3600);
      return { ...asset, signedUrl: data?.signedUrl ?? null };
    }),
  );

  const imageAssets = publicAssets.filter((asset) => asset.kind === "image" && asset.signedUrl);
  const documentAssets = publicAssets.filter((asset) => asset.kind !== "image" && asset.signedUrl);
  const descriptor = [product.product_type, product.category, product.version_name].filter(Boolean).join(" · ");

  return (
    <>
      <PageIntro
        eyebrow={<span dir="ltr">{product.code}</span>}
        title={product.name}
        description={product.marketing_description ?? descriptor}
      />

      <section className="section">
        <div className="container product-public-detail">
          {imageAssets.length ? (
            <div className="product-public-gallery" aria-label={`صور ${product.name}`}>
              {imageAssets.map((asset) => (
                <figure key={asset.id} className="product-public-image-frame">
                  <img src={asset.signedUrl ?? ""} alt={asset.label || product.name} />
                  {asset.label ? <figcaption>{asset.label}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : null}

          <div className="card-grid product-public-sections">
            <article className="card">
              <span className="card-kicker">المواصفات</span>
              <h2>المواصفات الاسمية</h2>
              <dl className="product-public-specs">
                {product.width_mm ? <><dt>العرض</dt><dd>{product.width_mm} mm</dd></> : null}
                {product.length_m ? <><dt>الطول</dt><dd>{product.length_m} m</dd></> : null}
                {product.thickness_mil ? <><dt>السمك</dt><dd>{product.thickness_mil} mil</dd></> : null}
                {product.weight_kg ? <><dt>الوزن</dt><dd>{product.weight_kg} kg</dd></> : null}
                {product.origin_country ? <><dt>بلد المنشأ</dt><dd>{product.origin_country}</dd></> : null}
              </dl>
            </article>

            <article className="card">
              <span className="card-kicker">الضمان</span>
              <h2>سياسة الضمان</h2>
              <p>مدة الضمان الافتراضية: {product.default_warranty_months} شهر.</p>
              {product.warranty_coverage ? <p>{product.warranty_coverage}</p> : null}
            </article>
          </div>

          {product.technical_description || product.features.length ? (
            <section className="card product-public-content-card">
              <span className="card-kicker">التفاصيل الفنية</span>
              <h2>عن المنتج</h2>
              {product.technical_description ? <p>{product.technical_description}</p> : null}
              {product.features.length ? (
                <ul className="product-public-feature-list">
                  {product.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              ) : null}
            </section>
          ) : null}

          {product.care_instructions ? (
            <section className="card product-public-content-card">
              <span className="card-kicker">العناية</span>
              <h2>تعليمات العناية</h2>
              <p>{product.care_instructions}</p>
            </section>
          ) : null}

          {documentAssets.length ? (
            <section className="card product-public-content-card">
              <span className="card-kicker">الملفات</span>
              <h2>مستندات المنتج</h2>
              <div className="product-public-documents">
                {documentAssets.map((asset) => (
                  <a key={asset.id} href={asset.signedUrl ?? ""} target="_blank" rel="noreferrer" className="button button-ghost">
                    {asset.label || assetKindLabels[asset.kind] || asset.original_name}
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <div className="hero-actions">
            <Link href="/products" className="button button-ghost">العودة للمنتجات</Link>
          </div>
        </div>
      </section>
    </>
  );
}
