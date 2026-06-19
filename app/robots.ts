import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://planbuddy.in';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/demo-trip-generator'],
        disallow: ['/dashboard/', '/auth/', '/api/', '/splash', '/onboarding'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
