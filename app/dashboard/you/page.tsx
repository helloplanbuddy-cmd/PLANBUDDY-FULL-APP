import type { Metadata } from 'next';
import YouScreen from './YouScreen';

export const metadata: Metadata = {
  title: 'Profile — PlanBuddy',
  description: 'Your trips, memories, budget, packing and safety — all in one place.',
};

export default function YouPage() {
  return <YouScreen />;
}
