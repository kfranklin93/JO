'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AiLogsPanel } from '@/components/dashboard/AiLogsPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FollowUpStats {
  scheduled: number;
  sent: number;
  total: number;
}

interface LeadRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  intent: string;
  status: string;
  location: string | null;
  budget: string | null;
  timeline: string | null;
  createdAt: string;
  lastContactedAt: string | null;
  engagementScore: number;
  followUps: FollowUpStats;
}

interface Stats {
  total: number;
  thisWeek: number;
  thisMonth: number;
  intentBreakdown: Record<string, number>;
}

interface DashboardData {
  stats: Stats;
  leads: LeadRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<string, string> = {
  buy: 'Buying',
  sell: 'Selling',
  insurance: 'Insurance',
  closing: 'Closing',
  other: 'Other',
};

const INTENT_COLORS: Record<string, string> = {
  buy: 'bg-emerald-100 text-emerald-800',
  sell: 'bg-blue-100 text-blue-800',
  insurance: 'bg-amber-100 text-amber-800',
  closing: 'bg-purple-100 text-purple-800',
  other: 'bg-neutral-100 text-neutral-600',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-green-100 text-green-800',
  contacted: 'bg-blue-100 text-blue-800',
  qualified: 'bg-violet-100 text-violet-800',
  appointment_set: 'bg-amber-100 text-amber-800',
  showing_scheduled: 'bg-orange-100 text-orange-800',
  offer_made: 'bg-pink-100 text-pink-800',
  under_contract: 'bg-teal-100 text-teal-800',
  closed: 'bg-neutral-200 text-neutral-700',
  lost: 'bg-red-100 text-red-700',
  nurture: 'bg-indigo-100 text-indigo-700',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {label}
      </p>
      <p className="mt-2 text-4xl font-bold text-neutral-900">{value}</p>
      {sub && <p className="mt-1 text-sm text-neutral-500">{sub}</p>}
    </div>
  );
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}

type SortKey = 'createdAt' | 'fullName' | 'intent' | 'status' | 'engagementScore';
type SortDir = 'asc' | 'desc';

// ─── Main Page ────────────────────────────────────────────────────────────────

type ActiveView = 'overview' | 'ai-copilot';

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  // View switcher
  const [activeView, setActiveView] = React.useState<ActiveView>('overview');

  // Filter / search state
  const [search, setSearch] = React.useState('');
  const [filterIntent, setFilterIntent] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');

  // Sort state
  const [sortKey, setSortKey] = React.useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');

  // Expanded row for detail view
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Load data
  React.useEffect(() => {
    fetch('/api/dashboard/data')
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/dashboard/login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  // Filtered + sorted leads
  const visibleLeads = React.useMemo(() => {
    if (!data) return [];

    let rows = data.leads;

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.fullName.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          (l.phone ?? '').includes(q) ||
          (l.location ?? '').toLowerCase().includes(q)
      );
    }

    if (filterIntent !== 'all') {
      rows = rows.filter((l) => l.intent === filterIntent);
    }

    if (filterStatus !== 'all') {
      rows = rows.filter((l) => l.status === filterStatus);
    }

    rows = [...rows].sort((a, b) => {
      let av: string | number = a[sortKey] ?? '';
      let bv: string | number = b[sortKey] ?? '';
      if (sortKey === 'createdAt') {
        av = new Date(a.createdAt).getTime();
        bv = new Date(b.createdAt).getTime();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [data, search, filterIntent, filterStatus, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sortKey !== colKey) return <span className="ml-1 text-neutral-300">↕</span>;
    return (
      <span className="ml-1 text-neutral-700">{sortDir === 'asc' ? '↑' : '↓'}</span>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">{error || 'No data'}</p>
      </div>
    );
  }

  const { stats } = data;

  // All unique intent values present in data (for filter dropdown)
  const intentOptions = [
    'all',
    ...Array.from(new Set(data.leads.map((l) => l.intent))).sort(),
  ];
  const statusOptions = [
    'all',
    ...Array.from(new Set(data.leads.map((l) => l.status))).sort(),
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <span className="font-serif text-xl text-[#1C2A39]">Joey O.</span>
              <span className="ml-3 text-sm uppercase tracking-widest text-neutral-400">
                Dashboard
              </span>
            </div>

            {/* ── View Switcher ── */}
            <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
              <button
                type="button"
                onClick={() => setActiveView('overview')}
                className={`rounded-lg px-4 py-1.5 font-sans text-xs font-semibold uppercase tracking-[0.1em] transition-all ${
                  activeView === 'overview'
                    ? 'bg-cerulean text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                Lead Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveView('ai-copilot')}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-sans text-xs font-semibold uppercase tracking-[0.1em] transition-all ${
                  activeView === 'ai-copilot'
                    ? 'bg-cerulean text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                AI Copilot
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-400">
              {stats.total} total lead{stats.total !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-bronze/40 px-3 py-1.5 text-sm text-bronze transition hover:bg-bronze/10 hover:border-bronze"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── AI Copilot Panel ── */}
      {activeView === 'ai-copilot' && (
        <main className="mx-auto max-w-screen-xl px-6 py-8">
          <div className="mb-6">
            <h2 className="font-serif text-2xl text-[#1C2A39]">AI Copilot & Client Logs</h2>
            <p className="mt-1 font-sans text-sm text-[#1C2A39]/50">
              Real-time Amazon Bedrock client conversations · Claude 3.5 Sonnet
            </p>
          </div>
          <AiLogsPanel />
        </main>
      )}

      <main className={`mx-auto max-w-screen-xl px-6 py-8 space-y-8 ${activeView !== 'overview' ? 'hidden' : ''}`}>

        {/* ── Stats Row ── */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Overview
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Leads" value={stats.total} />
            <StatCard label="This Week" value={stats.thisWeek} />
            <StatCard label="This Month" value={stats.thisMonth} />
            <StatCard
              label="Buying"
              value={stats.intentBreakdown['buy'] ?? 0}
              sub={`${stats.intentBreakdown['sell'] ?? 0} selling · ${stats.intentBreakdown['insurance'] ?? 0} insurance`}
            />
          </div>
        </section>

        {/* ── Intent Breakdown ── */}
        {Object.keys(stats.intentBreakdown).length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              By Intent
            </h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.intentBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([intent, count]) => (
                  <button
                    key={intent}
                    onClick={() =>
                      setFilterIntent(filterIntent === intent ? 'all' : intent)
                    }
                    className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                      filterIntent === intent
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    {INTENT_LABELS[intent] ?? intent}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs ${
                        filterIntent === intent
                          ? 'bg-white/20 text-white'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* ── Filters / Search ── */}
        <section className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Search
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, phone, or location…"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Intent
            </label>
            <select
              value={filterIntent}
              onChange={(e) => setFilterIntent(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
            >
              {intentOptions.map((o) => (
                <option key={o} value={o}>
                  {o === 'all' ? 'All intents' : (INTENT_LABELS[o] ?? o)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
            >
              {statusOptions.map((o) => (
                <option key={o} value={o}>
                  {o === 'all' ? 'All statuses' : o.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {(search || filterIntent !== 'all' || filterStatus !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setFilterIntent('all');
                setFilterStatus('all');
              }}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-900"
            >
              Clear filters
            </button>
          )}

          <p className="ml-auto text-sm text-neutral-400">
            {visibleLeads.length} of {stats.total} lead
            {stats.total !== 1 ? 's' : ''}
          </p>
        </section>

        {/* ── Leads Table ── */}
        <section>
          {visibleLeads.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center text-neutral-400">
              No leads match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    <th className="px-4 py-3">
                      <button
                        onClick={() => toggleSort('fullName')}
                        className="flex items-center hover:text-neutral-900"
                      >
                        Contact <SortIcon colKey="fullName" />
                      </button>
                    </th>
                    <th className="px-4 py-3 hidden sm:table-cell">Contact Info</th>
                    <th className="px-4 py-3">
                      <button
                        onClick={() => toggleSort('intent')}
                        className="flex items-center hover:text-neutral-900"
                      >
                        Intent <SortIcon colKey="intent" />
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        onClick={() => toggleSort('status')}
                        className="flex items-center hover:text-neutral-900"
                      >
                        Status <SortIcon colKey="status" />
                      </button>
                    </th>
                    <th className="px-4 py-3 hidden md:table-cell">Follow-ups</th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <button
                        onClick={() => toggleSort('engagementScore')}
                        className="flex items-center hover:text-neutral-900"
                      >
                        Engagement <SortIcon colKey="engagementScore" />
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        onClick={() => toggleSort('createdAt')}
                        className="flex items-center hover:text-neutral-900"
                      >
                        Date <SortIcon colKey="createdAt" />
                      </button>
                    </th>
                    <th className="px-4 py-3 sr-only">Expand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visibleLeads.map((lead) => {
                    const isExpanded = expandedId === lead.id;
                    return (
                      <React.Fragment key={lead.id}>
                        <tr
                          className={`cursor-pointer transition-colors hover:bg-neutral-50 ${isExpanded ? 'bg-neutral-50' : ''}`}
                          onClick={() =>
                            setExpandedId(isExpanded ? null : lead.id)
                          }
                        >
                          {/* Name */}
                          <td className="px-4 py-3 font-medium text-neutral-900">
                            {lead.fullName}
                          </td>

                          {/* Contact info (hidden on mobile) */}
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <div className="flex flex-col gap-0.5">
                              <a
                                href={`mailto:${lead.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-accent hover:underline"
                              >
                                {lead.email}
                              </a>
                              {lead.phone && (
                                <a
                                  href={`tel:${lead.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-neutral-500 hover:text-neutral-900"
                                >
                                  {lead.phone}
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Intent */}
                          <td className="px-4 py-3">
                            <Badge
                              label={INTENT_LABELS[lead.intent] ?? lead.intent}
                              colorClass={
                                INTENT_COLORS[lead.intent] ?? INTENT_COLORS['other']!
                              }
                            />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <Badge
                              label={lead.status.replace(/_/g, ' ')}
                              colorClass={
                                STATUS_COLORS[lead.status] ?? 'bg-neutral-100 text-neutral-600'
                              }
                            />
                          </td>

                          {/* Follow-ups (hidden on small) */}
                          <td className="px-4 py-3 hidden md:table-cell">
                            {lead.followUps.total === 0 ? (
                              <span className="text-neutral-400">—</span>
                            ) : (
                              <div className="flex flex-col text-xs">
                                <span className="font-medium text-neutral-700">
                                  {lead.followUps.sent}/{lead.followUps.total} sent
                                </span>
                                {lead.followUps.scheduled > 0 && (
                                  <span className="text-amber-600">
                                    {lead.followUps.scheduled} pending
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Engagement score */}
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-neutral-200">
                                <div
                                  className="h-1.5 rounded-full bg-accent"
                                  style={{
                                    width: `${Math.min(lead.engagementScore, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-neutral-500">
                                {lead.engagementScore}
                              </span>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3 text-neutral-500">
                            {formatRelative(lead.createdAt)}
                          </td>

                          {/* Expand toggle */}
                          <td className="px-4 py-3 text-right text-neutral-400">
                            <span className="text-xs">{isExpanded ? '▲' : '▼'}</span>
                          </td>
                        </tr>

                        {/* ── Expanded Detail Row ── */}
                        {isExpanded && (
                          <tr className="bg-neutral-50">
                            <td
                              colSpan={8}
                              className="px-6 pb-5 pt-2"
                            >
                              <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 text-sm">
                                <Detail label="Email">
                                  <a
                                    href={`mailto:${lead.email}`}
                                    className="text-accent hover:underline"
                                  >
                                    {lead.email}
                                  </a>
                                </Detail>

                                {lead.phone && (
                                  <Detail label="Phone">
                                    <a
                                      href={`tel:${lead.phone}`}
                                      className="hover:underline"
                                    >
                                      {lead.phone}
                                    </a>
                                  </Detail>
                                )}

                                {lead.location && (
                                  <Detail label="Location">{lead.location}</Detail>
                                )}

                                {lead.budget && (
                                  <Detail label="Budget">{lead.budget}</Detail>
                                )}

                                {lead.timeline && (
                                  <Detail label="Timeline">{lead.timeline}</Detail>
                                )}

                                <Detail label="Submitted">
                                  {formatDate(lead.createdAt)}
                                </Detail>

                                {lead.lastContactedAt && (
                                  <Detail label="Last Contact">
                                    {formatDate(lead.lastContactedAt)}
                                  </Detail>
                                )}

                                <Detail label="Follow-ups">
                                  {lead.followUps.total === 0
                                    ? 'None scheduled'
                                    : `${lead.followUps.sent} sent · ${lead.followUps.scheduled} pending`}
                                </Detail>

                                <Detail label="Engagement Score">
                                  <span className="font-semibold">
                                    {lead.engagementScore}/100
                                  </span>
                                </Detail>
                              </div>

                              <div className="mt-4 flex gap-3">
                                <a
                                  href={`mailto:${lead.email}`}
                                  className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700"
                                >
                                  Send Email
                                </a>
                                {lead.phone && (
                                  <a
                                    href={`tel:${lead.phone}`}
                                    className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:border-neutral-900"
                                  >
                                    Call
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

// ─── Detail cell helper ───────────────────────────────────────────────────────

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-neutral-800">{children}</p>
    </div>
  );
}
