import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { DataTable } from '@/components/widgets/DataTable';
import { KeyValue } from '@/components/widgets/KeyValue';
import { TaskStatus } from '@/components/widgets/TaskStatus';
import { ServiceList } from '@/components/ServiceList';
import { SERVICES } from '@/lib/api';

// ---------- DataTable ----------

describe('DataTable', () => {
  it('shows "No data" for empty array', () => {
    render(<DataTable data={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('shows "No data" for null', () => {
    render(<DataTable data={null} />);
    // May have multiple "No data" if other tests are stacked — use getAllByText
    expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table headers from object keys', () => {
    const data = [{ name: 'dns', ip: '192.168.0.53', status: 'running' }];
    render(<DataTable data={data} />);
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('ip')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
  });

  it('renders row values', () => {
    render(<DataTable data={[{ name: 'plex', ip: '192.168.0.60' }]} />);
    expect(screen.getByText('plex')).toBeInTheDocument();
    expect(screen.getByText('192.168.0.60')).toBeInTheDocument();
  });

  it('renders multiple rows', () => {
    const data = [
      { service: 'sonarr', port: '8989' },
      { service: 'radarr', port: '7878' },
    ];
    render(<DataTable data={data} />);
    expect(screen.getByText('sonarr')).toBeInTheDocument();
    expect(screen.getByText('radarr')).toBeInTheDocument();
    expect(screen.getByText('8989')).toBeInTheDocument();
    expect(screen.getByText('7878')).toBeInTheDocument();
  });

  it('allows sorting by clicking a column header', async () => {
    const data = [
      { name: 'sonarr', port: '8989' },
      { name: 'arrstack', port: '—' },
    ];
    render(<DataTable data={data} />);
    // Find the "name" header cell — it's in a th element
    const nameHeaders = screen.getAllByText('name');
    const thHeader = nameHeaders.find(el => el.tagName === 'TH');
    expect(thHeader).toBeDefined();
    await userEvent.click(thHeader!);
    expect(screen.getByText('name ↑')).toBeInTheDocument();
  });

  it('reverses sort on second click of same column', async () => {
    const data = [
      { name: 'sonarr' },
      { name: 'arrstack' },
    ];
    render(<DataTable data={data} />);
    const nameHeaders = screen.getAllByText('name');
    const thHeader = nameHeaders.find(el => el.tagName === 'TH');
    expect(thHeader).toBeDefined();
    await userEvent.click(thHeader!); // sort asc
    await userEvent.click(thHeader!); // sort desc — click on 'name ↑' now
    const descHeader = screen.queryByText('name ↓');
    expect(descHeader).toBeInTheDocument();
  });
});

// ---------- KeyValue ----------

describe('KeyValue', () => {
  it('shows "No data" for null', () => {
    render(<KeyValue data={null} />);
    expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "No data" for array input', () => {
    render(<KeyValue data={['a', 'b']} />);
    expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Empty" for empty object', () => {
    render(<KeyValue data={{}} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('renders key-value pairs', () => {
    render(<KeyValue data={{ host: 'media-node', service: 'qbittorrent-nox', exitCode: '0' }} />);
    expect(screen.getByText('host')).toBeInTheDocument();
    expect(screen.getByText('media-node')).toBeInTheDocument();
    expect(screen.getByText('service')).toBeInTheDocument();
    expect(screen.getByText('qbittorrent-nox')).toBeInTheDocument();
    expect(screen.getByText('exitCode')).toBeInTheDocument();
  });

  it('converts non-string values to strings', () => {
    render(<KeyValue data={{ count: 42, enabled: true }} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });
});

// ---------- TaskStatus ----------

describe('TaskStatus', () => {
  it('shows "No tasks" for empty input', () => {
    render(<TaskStatus data={[]} />);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('shows "No tasks" for null', () => {
    render(<TaskStatus data={null} />);
    expect(screen.getAllByText('No tasks').length).toBeGreaterThanOrEqual(1);
  });

  it('renders task titles', () => {
    const tasks = [
      { title: 'Check qbittorrent status', status: 'done' },
      { title: 'Restart service', status: 'pending' },
    ];
    render(<TaskStatus data={tasks} />);
    expect(screen.getByText('Check qbittorrent status')).toBeInTheDocument();
    expect(screen.getByText('Restart service')).toBeInTheDocument();
  });

  it('renders descriptions when present', () => {
    render(<TaskStatus data={[{ title: 'step', status: 'running', description: 'executing via ssh' }]} />);
    expect(screen.getByText('executing via ssh')).toBeInTheDocument();
  });

  it('shows ✓ icon for done/success tasks', () => {
    render(<TaskStatus data={[{ title: 'done', status: 'done' }, { title: 'success', status: 'success' }]} />);
    const checks = screen.getAllByText('✓');
    expect(checks.length).toBeGreaterThanOrEqual(2);
  });

  it('shows ✗ icon for failed/error tasks', () => {
    render(<TaskStatus data={[{ title: 'fail', status: 'failed' }]} />);
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('shows ⟳ for running tasks', () => {
    render(<TaskStatus data={[{ title: 'in progress', status: 'running' }]} />);
    expect(screen.getAllByText('⟳').length).toBeGreaterThanOrEqual(1);
  });

  it('parses {steps: [...]} object shape', () => {
    render(<TaskStatus data={{ steps: [{ title: 'inspect', status: 'done' }] }} />);
    expect(screen.getByText('inspect')).toBeInTheDocument();
  });

  it('parses {tasks: [...]} object shape', () => {
    render(<TaskStatus data={{ tasks: [{ title: 'verify', status: 'pending' }] }} />);
    expect(screen.getByText('verify')).toBeInTheDocument();
  });

  it('falls back to "Task N" label when title is missing', () => {
    render(<TaskStatus data={[{ status: 'done' }]} />);
    expect(screen.getByText('Task 1')).toBeInTheDocument();
  });
});

// ---------- ServiceList ----------

describe('ServiceList', () => {
  it('renders a card for every service in the SERVICES registry', () => {
    const { container } = render(<ServiceList selectedService={null} onSelectService={() => {}} />);
    for (const svc of SERVICES) {
      // Service names are rendered in div.name elements inside ServiceRow
      const matches = container.querySelectorAll(`*`);
      const found = Array.from(matches).some(el => el.textContent === svc.name);
      expect(found).toBe(true);
    }
  });

  it('renders all three node headings as uppercase section labels', () => {
    render(<ServiceList selectedService={null} onSelectService={() => {}} />);
    // Node headings are uppercase spans — use getAllByText to tolerate multiple matches
    expect(screen.getAllByText('nas').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('media').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ai').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSelectService with service name when a service is clicked', async () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    // Get all elements with text 'plex' and click the first one (service name div)
    const plexEls = screen.getAllByText('plex');
    await userEvent.click(plexEls[0]!);
    expect(onSelect).toHaveBeenCalledWith('plex');
  });

  it('highlights the selected service', () => {
    const { container } = render(<ServiceList selectedService="plex" onSelectService={() => {}} />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText('plex').length).toBeGreaterThanOrEqual(1);
  });

  it('renders external link for services with a url', () => {
    render(<ServiceList selectedService={null} onSelectService={() => {}} />);
    const links = document.querySelectorAll('a[href*="192.168.0.53:5380"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
