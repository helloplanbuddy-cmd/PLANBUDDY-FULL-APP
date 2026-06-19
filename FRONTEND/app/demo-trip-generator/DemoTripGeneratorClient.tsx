'use client';

import dynamic from 'next/dynamic';

// Client wrapper to allow `ssr: false` for the actual component.
const DemoTripGenerator = dynamic(() => import('./DemoTripGenerator'), {
  ssr: false,
  loading: () => null,
});

export default function DemoTripGeneratorClient() {
  return <DemoTripGenerator />;
}

