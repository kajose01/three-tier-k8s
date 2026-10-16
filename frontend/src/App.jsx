import React, { useEffect, useState } from 'react';

export default function App() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const r = await fetch('/api/items');
      if (!r.ok) throw new Error('API returned ' + r.status);
      setItems(await r.json());
      setInfo(await (await fetch('/api/info')).json());
      setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    setName('');
    load();
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 520, margin: '40px auto' }}>
      <h1>Three-Tier Demo v1.1</h1>
      <p>React on NGINX → Node API → MySQL{info ? ` (API ${info.version}, pod ${info.pod})` : ''}</p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      <form onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New item" />
        <button type="submit">Add</button>
      </form>
      <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>
    </main>
  );
}
