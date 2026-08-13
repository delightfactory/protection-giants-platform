import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const authUsersPageSize = 200;
const maxAuthUserPages = 100;

async function visitAuthUserPages(
  visitor: (users: User[]) => User | undefined,
): Promise<User | null> {
  const supabaseAdmin = createSupabaseAdminClient();

  for (let page = 1; page <= maxAuthUserPages; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: authUsersPageSize,
    });

    if (error) throw error;

    const match = visitor(data.users);
    if (match) return match;

    if (data.users.length < authUsersPageSize) {
      return null;
    }
  }

  throw new Error(
    `Auth user scan exceeded ${maxAuthUserPages * authUsersPageSize} users. Add an indexed server-side lookup before raising this safety limit.`,
  );
}

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

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  return visitAuthUserPages((users) =>
    users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail),
  );
}
