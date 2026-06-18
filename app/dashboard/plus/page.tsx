import type { Metadata } from 'next';
import PlusScreen from './PlusScreen';

export const metadata: Metadata = {
  title: 'Plan a Trip — PlanBuddy',
  description: 'Generate an AI-powered travel itinerary for any destination in India.',
};

export default function PlusPage() {
  return <PlusScreen />;
}
