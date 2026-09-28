import { PowerSyncBackendConnector, AbstractPowerSyncDatabase } from '@powersync/web';
import { supabase } from '../supabase';

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      throw new Error('Not logged in');
    }

    return {
      endpoint: process.env.NEXT_PUBLIC_POWERSYNC_URL || '',
      token: session.access_token
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        if (!supabase) continue;
        
        const table = supabase.from(op.table);
        
        if (op.op === 'PUT') {
          await table.upsert(op.opData!);
        } else if (op.op === 'PATCH') {
          await table.update(op.opData!).eq('id', op.id);
        } else if (op.op === 'DELETE') {
          await table.delete().eq('id', op.id);
        }
      }
      
      await transaction.complete();
    } catch (ex) {
      console.error('Data upload error', ex);
      // Depending on the error, you might want to call transaction.complete() or not
    }
  }
}
