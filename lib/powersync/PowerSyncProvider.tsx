"use client";

import React, { ReactNode, useEffect, useState } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { powerSync, connector } from './System';
import { supabase } from '../supabase';

export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;
    let isConnecting = false;

    const safeConnect = async () => {
      if (!mounted || isConnecting || powerSync.connected) return;
      isConnecting = true;
      try {
        await powerSync.connect(connector);
      } catch (err: any) {
        // Expected if reconnected or aborted
      } finally {
        isConnecting = false;
      }
    };

    const init = async () => {
      try {
        await powerSync.init();
      } catch (e) {
        console.warn("PowerSync init warning:", e);
      }
      if (!mounted) return;
      
      setInitialized(true);
      
      const { data: { session } } = await supabase!.auth.getSession();
      if (session && mounted) {
        safeConnect();
      }
    };

    init();

    const { data: authListener } = supabase?.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        powerSync.disconnectAndClear().catch(() => {});
      } else if (session && !powerSync.connected) {
        safeConnect();
      }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  if (!initialized) {
    return <div>Initializing Offline Database...</div>;
  }

  return (
    <PowerSyncContext.Provider value={powerSync}>
      {children}
    </PowerSyncContext.Provider>
  );
};
