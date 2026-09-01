import type { IconName } from "@/components/ui/icon";
import type { OperationalRole } from "@/lib/auth/operational-profile";

export type NavigationTaxonomy = "primary" | "attention" | "contextual" | "reference";

export type OperationsDestination = {
  id: string;
  href: string;
  label: string;
  title: string;
  description: string;
  icon: IconName;
  roles: readonly OperationalRole[];
  taxonomy: NavigationTaxonomy;
  desktop: boolean;
  mobilePrimaryRoles?: readonly OperationalRole[];
};

const allRoles = ["admin", "agent", "dealer", "center"] as const satisfies readonly OperationalRole[];

export const operationsDestinations = [
  {
    id: "home",
    href: "/operations",
    label: "الرئيسية",
    title: "الرئيسية",
    description: "نقطة البداية لكل الأعمال المتاحة لدورك.",
    icon: "home",
    roles: allRoles,
    taxonomy: "primary",
    desktop: true,
    mobilePrimaryRoles: allRoles,
  },
  {
    id: "claims",
    href: "/operations/claims",
    label: "المطالبات",
    title: "مطالبات الضمان",
    description: "مراجعة مطالبات العملاء وسياق الضمان والمرفقات والفحص وسجل القرار.",
    icon: "production",
    roles: ["admin"],
    taxonomy: "attention",
    desktop: true,
    mobilePrimaryRoles: ["admin"],
  },
  {
    id: "claim-resolutions",
    href: "/operations/claim-resolutions",
    label: "التنفيذ",
    title: "تنفيذ مطالبات الضمان",
    description: "إسناد ومعالجة المطالبات المقبولة وإدارة مادة الاستبدال والإغلاق التشغيلي المؤهل.",
    icon: "production",
    roles: ["admin"],
    taxonomy: "attention",
    desktop: true,
    mobilePrimaryRoles: ["admin"],
  },
  {
    id: "claim-inspections",
    href: "/operations/claim-inspections",
    label: "الفحوصات",
    title: "فحوصات مطالبات الضمان",
    description: "تنفيذ الفحوصات الرسمية المسندة حاليًا إلى مركزك وتوثيق النتيجة الفنية بالصور.",
    icon: "production",
    roles: ["center"],
    taxonomy: "attention",
    desktop: true,
    mobilePrimaryRoles: ["center"],
  },
  {
    id: "claim-resolution-tasks",
    href: "/operations/claim-resolution-tasks",
    label: "التنفيذ",
    title: "تنفيذ مطالبات الضمان",
    description: "تنفيذ المطالبات المقبولة المسندة لمركزك ثم توثيق الإكمال.",
    icon: "production",
    roles: ["center"],
    taxonomy: "attention",
    desktop: true,
    mobilePrimaryRoles: ["center"],
  },
  {
    id: "transfers",
    href: "/operations/transfers",
    label: "التحويلات",
    title: "تحويل اللفات",
    description: "إرسال واستلام اللفات بين الجهات وفق العهدة ومسار التحويل المعتمد.",
    icon: "transfer",
    roles: allRoles,
    taxonomy: "primary",
    desktop: true,
    mobilePrimaryRoles: allRoles,
  },
  {
    id: "rolls",
    href: "/operations/rolls",
    label: "العهدة",
    title: "عهدة اللفات",
    description: "مراجعة اللفات الموجودة حاليًا في نطاق عهدتك أو نطاقك الإداري.",
    icon: "production",
    roles: allRoles,
    taxonomy: "primary",
    desktop: true,
    mobilePrimaryRoles: ["agent", "dealer"],
  },
  {
    id: "issues",
    href: "/operations/rolls/issues",
    label: "بلاغات اللفات",
    title: "بلاغات ما قبل التركيب",
    description: "متابعة مشكلات اللفات المفتوحة قبل تفعيل الضمان وقرار الشركة عليها.",
    icon: "production",
    roles: ["admin", "center"],
    taxonomy: "attention",
    desktop: true,
  },
  {
    id: "warranties",
    href: "/operations/warranties",
    label: "الضمانات",
    title: "ضمانات العملاء",
    description: "مراجعة سجل ضمانات العملاء وحالاتها ومسارات الدعم التشغيلي المسموحة لدورك.",
    icon: "production",
    roles: ["admin", "center"],
    taxonomy: "reference",
    desktop: true,
  },
  {
    id: "production-orders",
    href: "/operations/production-orders",
    label: "الإنتاج",
    title: "الإنتاج واللفات",
    description: "إنشاء أوامر الإنتاج والـLots وتوليد هويات اللفات ومراجعتها.",
    icon: "production",
    roles: ["admin"],
    taxonomy: "primary",
    desktop: true,
  },
  {
    id: "centers",
    href: "/operations/centers",
    label: "المراكز",
    title: "مراكز التركيب",
    description: "إدارة مراكز التركيب الواقعة داخل نطاق دورك ومراجعة حالتها التشغيلية.",
    icon: "centers",
    roles: ["admin", "agent", "dealer"],
    taxonomy: "primary",
    desktop: true,
    mobilePrimaryRoles: ["agent", "dealer"],
  },
  {
    id: "dealers",
    href: "/operations/dealers",
    label: "الموزعون",
    title: "الوكلاء والموزعون",
    description: "إدارة الموزعين والكيانات التابعة داخل نطاق الدور الحالي.",
    icon: "dealers",
    roles: ["admin", "agent"],
    taxonomy: "primary",
    desktop: true,
  },
  {
    id: "agents",
    href: "/operations/agents",
    label: "وكلاء الدول",
    title: "وكلاء الدول",
    description: "إدارة وكلاء الدول وهويتهم وحالتهم التشغيلية وTransfer ID.",
    icon: "users",
    roles: ["admin"],
    taxonomy: "reference",
    desktop: true,
  },
  {
    id: "users",
    href: "/operations/users",
    label: "الحسابات",
    title: "الحسابات التشغيلية",
    description: "إدارة المستخدمين والأدوار والارتباطات التشغيلية.",
    icon: "users",
    roles: ["admin"],
    taxonomy: "reference",
    desktop: true,
  },
  {
    id: "products",
    href: "/operations/products",
    label: "المنتجات",
    title: "المنتجات",
    description: "مراجعة هوية المنتجات ومواصفاتها وحالة الإتاحة التشغيلية.",
    icon: "products",
    roles: allRoles,
    taxonomy: "reference",
    desktop: true,
  },
  {
    id: "location",
    href: "/operations/location",
    label: "موقع المركز",
    title: "موقع المركز",
    description: "تسجيل الموقع الفعلي للمركز من الجهاز ومراجعة آخر قراءة محفوظة.",
    icon: "centers",
    roles: ["center"],
    taxonomy: "reference",
    desktop: true,
  },
] as const satisfies readonly OperationsDestination[];

export type OperationsNavItem = Pick<OperationsDestination, "href" | "label" | "icon"> & { id: string };

function isVisibleForRole(destination: OperationsDestination, role: OperationalRole) {
  return destination.roles.includes(role);
}

export function getHomeDestinations(role: OperationalRole) {
  return operationsDestinations.filter((destination) => destination.id !== "home" && isVisibleForRole(destination, role));
}

export function getDesktopNavItems(role: OperationalRole): OperationsNavItem[] {
  return operationsDestinations
    .filter((destination) => destination.desktop && isVisibleForRole(destination, role))
    .map(({ id, href, label, icon }) => ({ id, href, label, icon }));
}

export function getMobileNavItems(role: OperationalRole): OperationsNavItem[] {
  const primary = operationsDestinations
    .filter((destination) => destination.mobilePrimaryRoles?.includes(role) && isVisibleForRole(destination, role))
    .map(({ id, href, label, icon }) => ({ id, href, label, icon }));

  return [
    ...primary.slice(0, 4),
    { id: "more", href: "/operations/more", label: "العمليات", icon: "products" as const },
  ];
}

export function getMoreDestinations(role: OperationalRole) {
  const primaryIds = new Set(getMobileNavItems(role).map((item) => item.id));
  return getHomeDestinations(role).filter((destination) => !primaryIds.has(destination.id));
}

const taskRoutePatterns = [
  /^\/operations\/users\/(?:new|[^/]+\/edit)$/,
  /^\/operations\/agents\/(?:new|[^/]+\/edit)$/,
  /^\/operations\/dealers\/(?:new|[^/]+\/edit)$/,
  /^\/operations\/centers\/(?:new|[^/]+\/edit)$/,
  /^\/operations\/products\/(?:new|[^/]+\/edit)$/,
  /^\/operations\/production-orders\/new$/,
  /^\/operations\/transfers\/new$/,
  /^\/operations\/transfers\/[^/]+\/receive$/,
  /^\/operations\/rolls\/[^/]+\/open$/,
  /^\/operations\/warranties\/activate$/,
  /^\/operations\/claim-inspections\/[^/]+$/,
  /^\/operations\/claim-resolution-tasks\/[^/]+$/,
  /^\/operations\/claims\/[^/]+\/review$/,
] as const;

export function isOperationsTaskRoute(pathname: string) {
  return taskRoutePatterns.some((pattern) => pattern.test(pathname));
}
