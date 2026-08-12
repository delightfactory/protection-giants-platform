export const operationalUserRoles = ["admin", "agent", "dealer", "center"] as const;

export type OperationalUserRole = (typeof operationalUserRoles)[number];

type OperationalProfileBase = {
  display_name: string;
  phone: string | null;
};

export type AdminOperationalProfileInput = OperationalProfileBase & {
  role: "admin";
  country_agent_id: null;
  dealer_id: null;
  installation_center_id: null;
};

export type AgentOperationalProfileInput = OperationalProfileBase & {
  role: "agent";
  country_agent_id: string;
  dealer_id: null;
  installation_center_id: null;
};

export type DealerOperationalProfileInput = OperationalProfileBase & {
  role: "dealer";
  country_agent_id: null;
  dealer_id: string;
  installation_center_id: null;
};

export type CenterOperationalProfileInput = OperationalProfileBase & {
  role: "center";
  country_agent_id: null;
  dealer_id: null;
  installation_center_id: string;
};

export type OperationalProfileInput =
  | AdminOperationalProfileInput
  | AgentOperationalProfileInput
  | DealerOperationalProfileInput
  | CenterOperationalProfileInput;

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
  const countryAgentId = value(formData, "country_agent_id");
  const dealerId = value(formData, "dealer_id");
  const centerId = value(formData, "installation_center_id");

  if (displayName.length < 2 || displayName.length > 120) return null;
  if (rawPhone && (rawPhone.length < 5 || rawPhone.length > 32)) return null;
  if (!operationalUserRoles.includes(role)) return null;

  const base = {
    display_name: displayName,
    phone: rawPhone || null,
  };

  if (role === "admin") {
    return {
      ...base,
      role,
      country_agent_id: null,
      dealer_id: null,
      installation_center_id: null,
    };
  }

  if (role === "agent" && isOperationalUserId(countryAgentId)) {
    return {
      ...base,
      role,
      country_agent_id: countryAgentId,
      dealer_id: null,
      installation_center_id: null,
    };
  }

  if (role === "dealer" && isOperationalUserId(dealerId)) {
    return {
      ...base,
      role,
      country_agent_id: null,
      dealer_id: dealerId,
      installation_center_id: null,
    };
  }

  if (role === "center" && isOperationalUserId(centerId)) {
    return {
      ...base,
      role,
      country_agent_id: null,
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
