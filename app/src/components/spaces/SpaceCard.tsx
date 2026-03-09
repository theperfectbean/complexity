import Link from "next/link";

type SpaceCardProps = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
};

export function SpaceCard({ id, name, description, updatedAt }: SpaceCardProps) {
  return (
    <Link href={`/spaces/${id}`} className="block rounded-xl border p-4 hover:bg-muted/40">
      <p className="font-medium">{name}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description || "No description"}</p>
      <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(updatedAt).toLocaleString()}</p>
    </Link>
  );
}
