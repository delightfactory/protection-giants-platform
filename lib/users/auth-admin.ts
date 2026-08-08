import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const authUsersPageSize = 200;
const maxAuthUserPages = 100;

export async function listAllOperationalAuthUsers(): Promise<User[]> {
  const supabaseAdmin = createSupabaseAdminClient();
  const users: User[] = [];

  for (let page = 1; page <= maxAuthUserPages; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: authUsersPageSize,
    });

    if (error) throw error;

    users.push(...data.users);

    if (data.users.length < authUsersPageSize) {
      return users;
    }
  }

  throw new Error(
    `Operational account list exceeded ${maxAuthUserPages * authUsersPageSize} Auth users. Add explicit pagination before raising this safety limit.`,
  );
}
