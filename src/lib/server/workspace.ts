import { createClient } from "@/lib/supabase/server";

/** The signed-in user's workspace. Every user gets exactly one on signup. */
export async function requireWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, supabase, user: null, workspaceId: null };

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data) return { error: "no_workspace" as const, supabase, user, workspaceId: null };
  return { error: null, supabase, user, workspaceId: data.workspace_id as string };
}
