import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const home = read("app/(public)/page.tsx");
const footer = read("components/site-footer.tsx");
const login = read("app/login/page.tsx");
const brand = read("lib/brand-config.ts");
const products = read("app/(public)/products/page.tsx");
const centers = read("app/(public)/centers/page.tsx");
const combinedLaunchCopy = [home, footer, login, brand].join("\n");

for (const stale of [
  "عند تفعيل النشر العام",
  "يتم تفعيل كل خدمة عامة عندما يكتمل مسارها",
  "بدون بيانات وهمية أو وظائف شكلية",
]) {
  assert(!combinedLaunchCopy.includes(stale), `Launch-facing copy still contains development-stage wording: ${stale}`);
}

assert(home.includes('title: "شبكة مراكز التركيب"'), "Home must describe the Center domain neutrally rather than calling every Center approved.");
assert(home.includes("حالة الاعتماد لكل مركز"), "Home must preserve the registered-vs-approved distinction.");
assert(!home.includes('title: "مراكز معتمدة"'), "Home must not imply every listed Center is approved.");
assert(!footer.includes("مراكز التركيب المعتمدة"), "Footer must not imply all network Centers are approved.");
assert(!login.includes("مراكز التركيب المعتمدة"), "Login must not equate Center operator access with network approval.");
assert(!brand.includes("مراكز التركيب المعتمدة"), "Global metadata must not flatten registered and approved Center states.");
assert(login.includes("مشغلي مراكز التركيب"), "Login should describe the operational audience, not a public trust classification.");
assert(brand.includes("شبكة مراكز التركيب"), "Brand metadata should describe the public Center network neutrally.");
assert(home.includes("المنتجات المنشورة"), "Home should describe currently published products instead of future publication activation.");
assert(home.includes("رمز QR الرسمي"), "Home Warranty copy should describe the actual QR-based public access model.");

assert(products.includes('.eq("status", "active")'), "Public Products must remain limited to active Products.");
assert(products.includes('.eq("publication_status", "published")'), "Public Products must remain limited to published Products.");
assert(!products.includes("TEST") && !products.includes("DEMO"), "Public Products UI must not hardcode TEST/demo launch content.");

assert(centers.includes('.select("center_name, city, country_code, latitude, longitude, classification")'), "Public Center projection must remain bounded to the approved public field set.");
assert(centers.includes('row.classification !== "registered" && row.classification !== "approved"'), "Public Center rows must remain explicitly classified as registered or approved.");
assert(centers.includes('center.classification === "approved"'), "Center directory must keep an explicit approved count.");
assert(centers.includes("المركز «المسجل»") && centers.includes("المركز «المعتمد»"), "Center directory must explain the registered/approved distinction to the public.");
assert(!/phone|email|street_address|directions/i.test(centers), "PUB-01 must not expand the public Center projection with contact/address/directions data.");

console.log("PUB-01-C launch copy/static content contract PASS: launch language is current, Center trust states are not conflated, and public Product/Center projections remain bounded.");
