const DNS_API = 'http://192.168.0.53:5380/api';
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getDnsToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const pass = process.env.TECHNITIUM_PASS ?? 'technitium123';
  const res = await fetch(`${DNS_API}/user/login?user=admin&pass=${encodeURIComponent(pass)}`);
  const j = await res.json() as { token?: string };
  if (!j.token) throw new Error('DNS login failed');
  cachedToken = { token: j.token, expiresAt: Date.now() + 20 * 60 * 1000 };
  return j.token;
}

export async function dns_query(params: { name: string; type?: string }): Promise<object> {
  const token = await getDnsToken();
  const t = params.type ?? 'A';
  const res = await fetch(`${DNS_API}/zones/records/get?token=${token}&zone=internal.lan&domain=${params.name}&type=${t}`);
  return res.json();
}

export async function dns_list_zone(): Promise<object> {
  const token = await getDnsToken();
  const res = await fetch(`${DNS_API}/zones/records/get?token=${token}&zone=internal.lan&domain=internal.lan&listZone=true`);
  return res.json();
}

export async function dns_add(params: { domain: string; ip: string; ttl?: number }): Promise<object> {
  const token = await getDnsToken();
  const ttl = params.ttl ?? 300;
  const res = await fetch(
    `${DNS_API}/zones/records/add?token=${token}&zone=internal.lan&domain=${params.domain}&type=A&ttl=${ttl}&ipAddress=${params.ip}`,
  );
  return res.json();
}

export async function dns_delete(params: { domain: string; ip: string }): Promise<object> {
  const token = await getDnsToken();
  const res = await fetch(
    `${DNS_API}/zones/records/delete?token=${token}&zone=internal.lan&domain=${params.domain}&type=A&ipAddress=${params.ip}`,
  );
  return res.json();
}
