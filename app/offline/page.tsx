"use client";

import { usePowerSync, useQuery } from '@powersync/react';
import { PowerSyncProvider } from '../../lib/powersync/PowerSyncProvider';
import { useState } from 'react';
import { v4 as uuid } from 'uuid';

function OfflinePatientsApp() {
  const powerSync = usePowerSync();
  const { data: patients, isLoading } = useQuery('SELECT * FROM patients ORDER BY name ASC');
  const [name, setName] = useState('');

  const addPatient = async () => {
    if (!name) return;
    await powerSync.execute(
      'INSERT INTO patients (id, patient_id, name, created_at) VALUES (?, ?, ?, ?)',
      [uuid(), `PAT-${Date.now()}`, name, new Date().toISOString()]
    );
    setName('');
  };

  if (isLoading) return <div>Loading local database...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Offline-First Patients (PowerSync)</h1>
      <p style={{ color: 'gray' }}>This page uses a local SQLite database. Try turning off your internet and adding a patient!</p>
      
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Patient Name"
          style={{ padding: 8, flex: 1 }}
        />
        <button onClick={addPatient} style={{ padding: '8px 16px', background: '#126b5a', color: 'white', border: 'none', borderRadius: 4 }}>
          Add Patient
        </button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {patients.map(p => (
          <li key={p.id} style={{ padding: 12, borderBottom: '1px solid #eee' }}>
            <strong>{p.name}</strong> <span style={{ color: 'gray', fontSize: 12 }}>({p.patient_id})</span>
          </li>
        ))}
        {patients.length === 0 && <p>No patients found.</p>}
      </ul>
      
      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ color: '#126b5a' }}>&larr; Back to Main App</a>
      </div>
    </div>
  );
}

export default function OfflinePage() {
  return (
    <PowerSyncProvider>
      <OfflinePatientsApp />
    </PowerSyncProvider>
  );
}
