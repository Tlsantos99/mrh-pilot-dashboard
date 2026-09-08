import { Suspense } from 'react';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div className="w-52 shrink-0 bg-white border-r border-gray-100" />}>
        <DashboardSidebar />
      </Suspense>
      <div className="flex-1 overflow-x-hidden px-6 py-6 min-w-0">
        {children}
      </div>
    </div>
  );
}
