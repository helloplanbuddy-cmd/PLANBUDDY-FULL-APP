import type { Metadata } from 'next';
import ExploreScreen from './ExploreScreen';

export const metadata: Metadata = {
  title: 'Explore — PlanBuddy',
  description: 'Discover top travel destinations across India with smart insights.',
};

export default function ExplorePage() {
  return <ExploreScreen />;
}
