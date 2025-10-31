export async function generateAvatar(file) {
  const fd = new FormData();
  fd.append('photo', file);
  const res = await fetch('/api/generate', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Generate failed');

  // Expect data.mesh (URL) and data.features (URL)
  const [meshJson, features] = await Promise.all([
    fetch(data.mesh).then(r => r.json()),
    fetch(data.features).then(r => r.json())
  ]);
  return { meshJson, features };
}

export async function askAvatar(question, voice) {
  const body = JSON.stringify({ question, voice: voice || null });
  const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Ask failed');
  // Expect data.answer (string) and data.audio (URL)
  return data;
}
