const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
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

console.log("Public self-signup is disabled while email/password Auth remains available to provisioned users.");
