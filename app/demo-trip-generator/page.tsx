import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

// Code-split the large DemoTripGenerator (52KB) — lazy load on demand
const DemoTripGenerator = dynamic(() => import('./DemoTripGenerator'), {
  ssr: false,
  loading: () => (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#070e1c',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 32, height: 32,
        border: '3px solid rgba(13,207,170,0.2)',
        borderTop: '3px solid #0dcfaa',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  ),
});

export const metadata: Metadata = {
  title: 'Free AI Trip Planner — Generate Your India Itinerary in Minutes',
  description:
    'Describe your dream trip in plain language and get a complete AI-generated day-by-day itinerary for any destination in India — with budget breakdown, hotels, activities, and local tips. Free, instant, no signup.',
  openGraph: {
    title: 'Free AI Trip Planner — PlanBuddy',
    description:
      'Get a complete India trip itinerary in seconds. Budget breakdown, day-by-day plan, hotel suggestions, and local tips — all AI-generated, free.',
    images: ['/og-demo.png'],
    url: '/demo-trip-generator',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Trip Planner — PlanBuddy',
    description: 'Get a complete India trip itinerary in seconds.',
    images: ['/og-demo.png'],
  },
  alternates: {
    canonical: '/demo-trip-generator',
  },
};

export default function DemoTripGeneratorPage() {
  return <DemoTripGenerator />;
}
