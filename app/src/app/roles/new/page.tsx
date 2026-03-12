"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession } from "next-auth/react";

import { RoleCreateForm } from "@/components/roles/CreateRoleDialog";

export default function NewRolePage() {
  const { data: session } = useSession();
  const router = useRouter();

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p>
          Please <Link className="underline" href="/login">sign in</Link> to create roles.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-start px-6 pt-24 pb-12">
      <div className="w-full">
        <h1 className="text-center font-[var(--font-accent)] text-3xl font-medium">Create a new role</h1>
        <div className="mt-10">
          <RoleCreateForm
            onCreated={(role) => router.push(`/roles/${role.id}`)}
            onCancel={() => router.push("/roles")}
            submitLabel="Create role"
            showHeading={false}
          />
        </div>
      </div>
    </main>
  );
}
