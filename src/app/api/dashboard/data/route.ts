import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db, leads, followUps } from '@/lib/db';
import { desc } from 'drizzle-orm';

function isAuthenticated(cookieValue: string | undefined): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !cookieValue) return false;
  return cookieValue === adminPassword;
}

export async function GET(request: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('dashboard_auth');
  if (!isAuthenticated(authCookie?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all leads, newest first
    const allLeads = await db
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(500);

    // Fetch all follow-ups
    const allFollowUps = await db
      .select()
      .from(followUps)
      .orderBy(desc(followUps.scheduledFor));

    // ── Stats ──────────────────────────────────────────────────────────────

    const now = new Date();

    // Start of current week (Monday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const leadsThisWeek = allLeads.filter(
      (l) => new Date(l.createdAt) >= startOfWeek
    ).length;

    const leadsThisMonth = allLeads.filter(
      (l) => new Date(l.createdAt) >= startOfMonth
    ).length;

    // Breakdown by property interest (buy / sell / insurance / closing / other)
    const intentBreakdown = allLeads.reduce<Record<string, number>>(
      (acc, lead) => {
        const intent = lead.propertyInterest ?? 'other';
        acc[intent] = (acc[intent] ?? 0) + 1;
        return acc;
      },
      {}
    );

    // Follow-up counts per lead (keyed by leadId)
    const followUpsByLead = allFollowUps.reduce<
      Record<string, { scheduled: number; sent: number; total: number }>
    >((acc, fu) => {
      if (!acc[fu.leadId]) acc[fu.leadId] = { scheduled: 0, sent: 0, total: 0 };
      acc[fu.leadId]!.total++;
      if (fu.status === 'scheduled') acc[fu.leadId]!.scheduled++;
      if (['sent', 'delivered', 'opened', 'clicked', 'replied'].includes(fu.status ?? '')) {
        acc[fu.leadId]!.sent++;
      }
      return acc;
    }, {});

    // Build enriched lead rows for the table
    const leadRows = allLeads.map((lead) => {
      const fuStats = followUpsByLead[lead.id] ?? { scheduled: 0, sent: 0, total: 0 };
      return {
        id: lead.id,
        fullName: lead.fullName ?? (`${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Unknown'),
        email: lead.email,
        phone: lead.phone ?? null,
        intent: lead.propertyInterest ?? 'other',
        status: lead.status,
        location: null as string | null, // not in schema at top-level; comes from formData if present
        budget: null as string | null,
        timeline: lead.timeline ?? null,
        createdAt: lead.createdAt.toISOString(),
        lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
        engagementScore: lead.engagementScore ?? 0,
        followUps: fuStats,
        // Pull location/budget out of the raw formData JSON if present
        ...(lead.formData && typeof lead.formData === 'object'
          ? {
              location: (lead.formData as Record<string, string>).location ?? null,
              budget: (lead.formData as Record<string, string>).budget ?? null,
            }
          : {}),
      };
    });

    return NextResponse.json({
      stats: {
        total: allLeads.length,
        thisWeek: leadsThisWeek,
        thisMonth: leadsThisMonth,
        intentBreakdown,
      },
      leads: leadRows,
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}
