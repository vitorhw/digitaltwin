import { generateAvatar, askAvatar } from './api.js';
import { createAvatarScene } from './scene.js';

const el = {
  file: document.getElementById('file'),
  preview: document.getElementById('preview'),
  previewWrap: document.getElementById('previewWrap'),
  btnGen: document.getElementById('btnGen'),
  chat: document.getElementById('chat'),
  chatInput: document.getElementById('chatInput'),
  send: document.getElementById('send'),
  voice: document.getElementById('voice'),
  canvas: document.getElementById('webgl'),
};

let previewUrl = null;
const avatar = createAvatarScene(el.canvas);

function appendChat(sender, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + (sender === 'Avatar' ? 'bot' : 'me');
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  el.chat.appendChild(div);
  el.chat.scrollTop = el.chat.scrollHeight;
}

function showPreview(file) {
  if (!file) {
    el.preview.src = '';
    el.previewWrap.style.display = 'none';
    previewUrl = null;
    return;
  }
  previewUrl = URL.createObjectURL(file);
  el.preview.src = previewUrl;
  el.previewWrap.style.display = '';
}

el.file.addEventListener('change', () => {
  const f = el.file.files?.[0];
  el.btnGen.disabled = !f;
  showPreview(f || null);
});

el.btnGen.addEventListener('click', async () => {
  const f = el.file.files?.[0];
  if (!f) return;
  el.btnGen.disabled = true;
  try {
    const { meshJson, features } = await generateAvatar(f);
    avatar.setLipIndices(features);
    avatar.setMeshFromData(meshJson, previewUrl);
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    el.btnGen.disabled = false;
  }
});

async function sendChat() {
  const text = el.chatInput.value.trim();
  if (!text) return;
  appendChat('You', text);
  el.chatInput.value = '';
  try {
    const { answer, audio } = await askAvatar(text, el.voice.value || null);
    appendChat('Avatar', answer);
    // Add cache-buster so the browser fetches the new WAV each time
    avatar.playAvatarAudio(audio + '?t=' + Date.now());
  } catch (err) {
    alert(err.message || String(err));
  }
}

el.send.addEventListener('click', sendChat);
el.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
