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
      {urls.map((url, index) => {
        const domain = toDomain(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="min-w-56 rounded-lg border bg-card p-2 shadow-2xs transition-colors hover:bg-accent"
          >
            <p className="text-[11px] text-muted-foreground">[{index + 1}] {domain}</p>
            <p className="mt-1 line-clamp-2 text-sm">{url}</p>
          </a>
        );
      })}
    </div>
  );
}
