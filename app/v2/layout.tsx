import { PowerSyncProvider } from "../../lib/powersync/PowerSyncProvider";

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <PowerSyncProvider>
      {children}
    </PowerSyncProvider>
  );
}
