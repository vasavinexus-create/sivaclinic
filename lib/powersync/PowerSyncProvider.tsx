"use client";

import React, { ReactNode, useEffect, useState } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { powerSync, connector } from './System';
import { supabase } from '../supabase';

export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Initialize the local database file (safe to do even if logged out)
      await powerSync.init();
      if (!mounted) return;
      
      // Allow the app to render (this will show the Auth screen if not logged in)
      setInitialized(true);
      
      // Connect immediately if we already have a session
      const { data: { session } } = await supabase!.auth.getSession();
      if (session) {
        powerSync.connect(connector);
      }
    };

    init();

    const { data: authListener } = supabase?.auth.onAuthStateChange((event, session) => {
      if (session) {
        powerSync.connect(connector);
      } else {
        powerSync.disconnectAndClear();
      }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
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
