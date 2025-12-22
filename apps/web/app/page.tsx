import { Suspense } from "react";
import Dashboard from "../components/Dashboard";

export default function Page() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-white/70">Loading...</div>}>
      <Dashboard />
    </Suspense>
  );
}
