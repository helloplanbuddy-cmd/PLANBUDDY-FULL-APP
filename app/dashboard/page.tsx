// ============================================================
// /app/dashboard/page.tsx — Dashboard Route (auth-gated)
// ============================================================
import { Metadata } from 'next';
import DashboardScreen from './DashboardScreen';

export const metadata: Metadata = {
  title: 'Dashboard — PlanBuddy',
  description: 'Your AI travel planning dashboard. Plan trips, track budgets, stay safe.',
};

export default function DashboardPage() {
  return <DashboardScreen />;
}
