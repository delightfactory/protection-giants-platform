const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceRoleKey || !anonKey) throw new Error("Local Supabase env is required.");
console.log("Operational Agent/Dealer/Center lifecycle verifier moved to the Agent Network Foundation test suite.");
