import { redirect } from "next/navigation";

import { homePathFor } from "@/domain/permissions";
import { requireUser } from "@/server/auth";

export default async function Home() {
  const user = await requireUser();
  redirect(homePathFor(user.role));
}
