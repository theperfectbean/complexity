import { restFetch } from '../base/RestApiTool';

const SONARR_BASE = 'http://192.168.0.103:8989';
const RADARR_BASE = 'http://192.168.0.103:7878';
const PROWLARR_BASE = 'http://192.168.0.103:9696';
const SEERR_BASE = 'http://192.168.0.103:5055';

const sonarrOpts = { name: 'sonarr', description: '', baseUrl: SONARR_BASE, authMode: 'api-key' as const, apiKeyEnv: 'SONARR_API_KEY', risk: 0 as const };
const radarrOpts = { name: 'radarr', description: '', baseUrl: RADARR_BASE, authMode: 'api-key' as const, apiKeyEnv: 'RADARR_API_KEY', risk: 0 as const };
const prowlarrOpts = { name: 'prowlarr', description: '', baseUrl: PROWLARR_BASE, authMode: 'api-key' as const, apiKeyEnv: 'PROWLARR_API_KEY', risk: 0 as const };
const seerrOpts = { name: 'seerr', description: '', baseUrl: SEERR_BASE, authMode: 'api-key' as const, apiKeyEnv: 'OVERSEERR_API_KEY', risk: 0 as const };

async function arrGet(opts: typeof sonarrOpts, path: string) {
  const r = await restFetch(opts.baseUrl + path, opts);
  return r.json() as Promise<unknown>;
}

export async function sonarr_status(): Promise<object> {
  const [queue, health, disk] = await Promise.all([
    arrGet(sonarrOpts, '/api/v3/queue?page=1&pageSize=20'),
    arrGet(sonarrOpts, '/api/v3/health'),
    arrGet(sonarrOpts, '/api/v3/diskspace'),
  ]);
  return { queue, health, disk };
}

export async function sonarr_search(params: { seriesId?: number }): Promise<object> {
  const body = params.seriesId ? { name: 'SeriesSearch', seriesId: params.seriesId } : { name: 'MissingEpisodeSearch' };
  const r = await restFetch(SONARR_BASE + '/api/v3/command', sonarrOpts, { method: 'POST', body: JSON.stringify(body) });
  return r.json() as Promise<object>;
}

export async function sonarr_add(params: { tvdbId: number; title: string; qualityProfileId?: number }): Promise<object> {
  const body = { tvdbId: params.tvdbId, title: params.title, qualityProfileId: params.qualityProfileId ?? 1, monitored: true, addOptions: { searchForMissingEpisodes: true }, rootFolderPath: '/mnt/media/tv' };
  const r = await restFetch(SONARR_BASE + '/api/v3/series', sonarrOpts, { method: 'POST', body: JSON.stringify(body) });
  return r.json() as Promise<object>;
}

export async function radarr_status(): Promise<object> {
  const [queue, health, disk] = await Promise.all([
    arrGet(radarrOpts, '/api/v3/queue?page=1&pageSize=20'),
    arrGet(radarrOpts, '/api/v3/health'),
    arrGet(radarrOpts, '/api/v3/diskspace'),
  ]);
  return { queue, health, disk };
}

export async function radarr_search(params: { movieId?: number }): Promise<object> {
  const body = params.movieId ? { name: 'MoviesSearch', movieIds: [params.movieId] } : { name: 'MissingMoviesSearch' };
  const r = await restFetch(RADARR_BASE + '/api/v3/command', radarrOpts, { method: 'POST', body: JSON.stringify(body) });
  return r.json() as Promise<object>;
}

export async function radarr_add(params: { tmdbId: number; title: string; qualityProfileId?: number }): Promise<object> {
  const body = { tmdbId: params.tmdbId, title: params.title, qualityProfileId: params.qualityProfileId ?? 1, monitored: true, addOptions: { searchForMovie: true }, rootFolderPath: '/mnt/media/movies' };
  const r = await restFetch(RADARR_BASE + '/api/v3/movie', radarrOpts, { method: 'POST', body: JSON.stringify(body) });
  return r.json() as Promise<object>;
}

export async function prowlarr_health(): Promise<object> {
  return arrGet(prowlarrOpts, '/api/v1/indexer') as Promise<object>;
}

export async function seerr_status(): Promise<object> {
  return arrGet(seerrOpts, '/api/v1/status') as Promise<object>;
}

export async function seerr_requests(): Promise<object> {
  return arrGet(seerrOpts, '/api/v1/request?take=20&sort=added&filter=pending') as Promise<object>;
}
