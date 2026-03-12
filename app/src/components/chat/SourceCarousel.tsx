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
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {urls.map((url, index) => {
        const domain = toDomain(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-[240px] flex-col justify-between rounded-xl border bg-card/40 p-3 shadow-sm transition-all hover:bg-accent hover:shadow-md"
          >
            <p className="line-clamp-2 text-[13px] font-medium leading-snug">{url}</p>
            <div className="mt-3 flex items-center gap-1.5 border-t pt-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-primary/10 text-[10px] font-bold text-primary">
                {index + 1}
              </span>
              <p className="truncate text-[11px] text-muted-foreground">{domain}</p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
