import "./verify-auth-trigger-contract.mjs";
import { readFile } from "node:fs/promises";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
}

const [config, inviteTemplate, confirmRoute] = await Promise.all([
  readFile("supabase/config.toml", "utf8"),
  readFile("supabase/templates/invite.html", "utf8"),
  readFile("app/auth/confirm/route.ts", "utf8"),
]);

if (!/^enable_signup\s*=\s*false$/m.test(config)) {
  throw new Error("Global public signup must remain disabled in committed Supabase Auth configuration.");
}

if (!/\[auth\.email\.template\.invite\]/.test(config) || !/content_path\s*=\s*"\.\/supabase\/templates\/invite\.html"/.test(config)) {
  throw new Error("Center invitation email template is not explicitly wired in committed Supabase configuration.");
}

if (!inviteTemplate.includes("/auth/confirm?token_hash={{ .TokenHash }}&type=invite")) {
  throw new Error("Invite template must use the server-side TokenHash confirmation route for Center onboarding.");
}

if (inviteTemplate.includes("{{ .ConfirmationURL }}")) {
  throw new Error("Invite template unexpectedly reverted to a direct ConfirmationURL instead of the controlled server confirmation route.");
}

if (!confirmRoute.includes('type !== "invite"') || !confirmRoute.includes('type: "invite"') || !confirmRoute.includes('redirectTo.pathname = "/onboarding/center"')) {
  throw new Error("Auth confirmation route no longer enforces invite-only verification and the fixed Center onboarding destination.");
}

const response = await fetch(`${apiUrl}/auth/v1/signup`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "public-signup-must-stay-disabled@example.test",
    password: "Public-Signup-Must-Stay-Disabled-2026!",
  }),
});

if (response.ok) {
  const body = await response.text();
  throw new Error(`Public self-signup unexpectedly succeeded: ${body}`);
}

console.log("Auth configuration preserves disabled public signup and the controlled Center invitation confirmation route.");
