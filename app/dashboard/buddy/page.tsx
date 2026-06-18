import type { Metadata } from 'next';
import BuddyScreen from './BuddyScreen';

export const metadata: Metadata = {
  title: 'AI Buddy — PlanBuddy',
  description: 'Chat with your AI travel companion for real-time guidance and tips.',
};

export default function BuddyPage() {
  return <BuddyScreen />;
}
