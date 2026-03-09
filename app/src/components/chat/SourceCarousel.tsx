type SourceCarouselProps = {
  urls: string[];
};

function toDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SourceCarousel({ urls }: SourceCarouselProps) {
  if (urls.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {urls.map((url) => {
        const domain = toDomain(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="min-w-52 rounded-md border p-2 hover:bg-muted/40"
          >
            <p className="truncate text-xs text-muted-foreground">{domain}</p>
            <p className="mt-1 line-clamp-2 text-sm">{url}</p>
          </a>
        );
      })}
    </div>
  );
}
