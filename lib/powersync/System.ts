import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './AppSchema';
import { SupabaseConnector } from './Connector';

export const powerSync = new PowerSyncDatabase({
  database: {
    dbFilename: 'sivacare.db'
  },
  schema: AppSchema
});

export const connector = new SupabaseConnector();

// This should be called once the user is logged in
export const setupPowerSync = async () => {
  await powerSync.init();
  await powerSync.connect(connector);
};
