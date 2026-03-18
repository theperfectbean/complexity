"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, User, Shield, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
};

export function UserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const limit = 10;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(search)}&page=${page}&limit=${limit}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setTotal(data.total);
      } else {
        toast.error(data.error || "Failed to fetch users");
      }
    } catch {
      toast.error("An error occurred while fetching users");
    } finally {
      setLoading(false);
    }
  }, [search, page, limit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  async function toggleAdmin(userId: string, currentStatus: boolean) {
    setUpdatingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isAdmin: !currentStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("User updated successfully");
        setUsers(users.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
      } else {
        toast.error(data.error || "Failed to update user");
      }
    } catch {
      toast.error("An error occurred while updating user");
    } finally {
      setUpdatingId(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage system users and their administrative privileges.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border bg-background/50 pl-10 pr-4 py-2 text-sm transition-all focus:border-primary focus:ring-4 focus:ring-primary/5 outline-hidden"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="px-6 py-4 font-semibold text-muted-foreground">User</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground">Joined</th>
                <th className="px-6 py-4 font-semibold text-right text-muted-foreground">Admin Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                <tr>
                  <td colSpan={3} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Loading users...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="h-48 text-center text-muted-foreground">
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[14px] font-semibold truncate leading-tight">
                            {user.name || "Anonymous"}
                          </span>
                          <span className="text-[12px] text-muted-foreground truncate mt-0.5">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[13px] text-muted-foreground whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className={cn(
                          "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider",
                          user.isAdmin ? 'text-primary' : 'text-muted-foreground/60'
                        )}>
                          {user.isAdmin ? (
                            <>
                              <Shield className="h-3.5 w-3.5" />
                              <span>Admin</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="h-3.5 w-3.5 opacity-50" />
                              <span>User</span>
                            </>
                          )}
                        </span>
                        
                        <button
                          type="button"
                          disabled={updatingId === user.id}
                          onClick={() => toggleAdmin(user.id, user.isAdmin)}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50",
                            user.isAdmin ? "bg-primary" : "bg-muted"
                          )}
                        >
                          <span className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                            user.isAdmin ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{(page - 1) * limit + 1}</span> to <span className="font-medium text-foreground">{Math.min(page * limit, total)}</span> of <span className="font-medium text-foreground">{total}</span> users
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-[13px] font-medium transition-all hover:bg-muted disabled:opacity-30 active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <div className="text-[13px] font-medium px-2">
              Page <span className="text-primary">{page}</span> of {totalPages}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-[13px] font-medium transition-all hover:bg-muted disabled:opacity-30 active:scale-95"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
