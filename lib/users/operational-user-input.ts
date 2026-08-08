export const operationalUserRoles = ["admin", "dealer", "center"] as const;

export type OperationalUserRole = (typeof operationalUserRoles)[number];

export type OperationalProfileInput = {
  display_name: string;
  phone: string | null;
  role: OperationalUserRole;
  dealer_id: string | null;
  installation_center_id: string | null;
};

export type OperationalUserCreateInput = OperationalProfileInput & {
  email: string;
  password: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function rawValue(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

export function isOperationalUserId(valueToCheck: string): boolean {
  return uuidPattern.test(valueToCheck);
}

export function parseOperationalProfileInput(
  formData: FormData,
): OperationalProfileInput | null {
  const displayName = value(formData, "display_name");
  const rawPhone = value(formData, "phone");
  const role = value(formData, "role") as OperationalUserRole;
  const dealerId = value(formData, "dealer_id");
  const centerId = value(formData, "installation_center_id");

  if (displayName.length < 2 || displayName.length > 120) return null;
  if (rawPhone && (rawPhone.length < 5 || rawPhone.length > 32)) return null;
  if (!operationalUserRoles.includes(role)) return null;

  if (role === "admin") {
    return {
      display_name: displayName,
      phone: rawPhone || null,
      role,
      dealer_id: null,
      installation_center_id: null,
    };
  }

  if (role === "dealer" && isOperationalUserId(dealerId)) {
    return {
      display_name: displayName,
      phone: rawPhone || null,
      role,
      dealer_id: dealerId,
      installation_center_id: null,
    };
  }

  if (role === "center" && isOperationalUserId(centerId)) {
    return {
      display_name: displayName,
      phone: rawPhone || null,
      role,
      dealer_id: null,
      installation_center_id: centerId,
    };
  }

  return null;
}

export function parseOperationalUserCreateInput(
  formData: FormData,
): OperationalUserCreateInput | null {
  const profile = parseOperationalProfileInput(formData);
  const email = parseOperationalUserEmail(formData);
  const password = parseOperationalUserPassword(formData, "password");

  if (!profile || !email || !password) return null;

  return { ...profile, email, password };
}

export function parseOperationalUserEmail(formData: FormData): string | null {
  const email = value(formData, "email").toLowerCase();

  if (!email || email.length > 254 || !emailPattern.test(email)) return null;
  return email;
}

export function parseOperationalUserPassword(
  formData: FormData,
  key = "new_password",
): string | null {
  const password = rawValue(formData, key);
  if (password.length < 12 || password.length > 128) return null;
  return password;
}

export function parseOperationalTargetId(formData: FormData): string | null {
  const userId = value(formData, "user_id");
  return isOperationalUserId(userId) ? userId : null;
}
