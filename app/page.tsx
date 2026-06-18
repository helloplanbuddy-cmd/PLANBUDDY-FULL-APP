// ============================================================
// /app/page.tsx — Root Route → Splash
// ============================================================
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/splash');
}
