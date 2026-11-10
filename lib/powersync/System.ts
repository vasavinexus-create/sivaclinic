import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './AppSchema';
import { SupabaseConnector } from './Connector';

export const powerSync = new PowerSyncDatabase({
  database: {
    dbFilename: 'sivacare.db'
  },
  schema: AppSchema,
  logger: {
    log(record) {
      if (record.level >= 40 && !record.message?.includes('Sync error')) {
        console.warn(`[PowerSync]: ${record.message}`, record.error ?? '');
      }
    }
  }
});

export const connector = new SupabaseConnector();

// This should be called once the user is logged in
export const setupPowerSync = async () => {
  await powerSync.init();
  await powerSync.connect(connector);
};
