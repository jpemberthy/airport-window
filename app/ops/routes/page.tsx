import { airport } from '@/lib/airport';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RouteOpsDashboard } from '@/components/route-ops-dashboard';
import './route-ops.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: `Route Operations — ${airport.brand.title}`,
  robots: { index: false, follow: false },
};

export default function RouteOpsPage() {
  if (process.env.AIRPORT_OPS_DASHBOARD_ENABLED !== 'true') notFound();
  return <RouteOpsDashboard />;
}
