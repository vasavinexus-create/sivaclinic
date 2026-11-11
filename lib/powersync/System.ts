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
      const msg = record.message || '';
      const errStr = String(record.error ?? '');
      // Suppress routine lifecycle aborts when reconnecting or switching auth
      if (
        msg.includes('Sync aborted') ||
        msg.includes('Sync error') ||
        errStr.includes('Connection request has been aborted') ||
        errStr.includes('Disconnect has been requested')
      ) {
        return;
      }
      if (record.level >= 40) {
        console.warn(`[PowerSync]: ${record.message}`, record.error ?? '');
      }
    }
  }
});

if (typeof window !== 'undefined') {
  (window as any).powerSync = powerSync;
}

export const connector = new SupabaseConnector();

// This should be called once the user is logged in
export const setupPowerSync = async () => {
  await powerSync.init();
  await powerSync.connect(connector);
};
