const $ = id => document.getElementById(id);
let state, selected;
async function call(action, ...args) {
  const result = await window.stillroom.call(action, ...args);
  if (!result.ok) { notice(result.error); return null; }
  return result.value;
}
function notice(text) { $('notice').textContent = text; setTimeout(() => { $('notice').textContent = ''; }, 6000); }
function element(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function short(id) { return id.slice(0, 8) + '…' + id.slice(-6); }
function render(next) {
  state = next;
  if (!selected && state.contacts.length) selected = state.contacts[0].id;
  $('status').textContent = state.connected ? '● Connected' : '○ Disconnected';
  $('status').className = state.connected ? 'online' : '';
  $('connectionIssue').textContent = state.error || '';
  $('contacts').replaceChildren();
  for (const contact of state.contacts) {
    const button = element('button', null, 'contact' + (selected === contact.id ? ' active' : ''));
    button.append(element('span', contact.id.slice(0, 2).toUpperCase(), 'avatar'), element('span', short(contact.id)));
    button.title = contact.id; button.onclick = () => { selected = contact.id; render(state); }; $('contacts').append(button);
  }
  $('title').textContent = selected ? short(selected) : 'Room for a conversation.';
  $('title').title = selected || '';
  $('text').disabled = !selected; $('send').disabled = !selected;
  if (selected) {
    $('messages').replaceChildren();
    const history = state.history.filter(message => message.from === selected || message.to === selected);
    if (!history.length) $('messages').append(element('p', 'Your conversation starts here. Messages stay on your devices.', 'conversationStart'));
    for (const message of history) {
      const mine = message.from === state.id;
      const row = element('div', null, mine ? 'message mine' : 'message');
      row.append(element('div', message.text, 'bubble'));
      const label = mine ? (message.status === 'delivered' ? 'Delivered' : message.status === 'failed' ? 'Delivery not confirmed · Retry' : state.connected ? 'Sending · awaiting receipt' : 'Pending · offline') : 'Received';
      const meta = element('div', new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + label, 'meta');
      if (mine && message.status !== 'delivered') { const retry = element('button', 'Retry'); retry.onclick = async () => { const next = await call('retry', message.id); if (next) render(next); }; meta.append(retry); }
      row.append(meta); $('messages').append(row);
    }
    $('messages').scrollTop = $('messages').scrollHeight;
  }
}
function openContact() { $('verified').checked = false; $('contactDialog').showModal(); }
$('add').onclick = openContact; $('emptyAdd').onclick = openContact;
$('card').oninput = () => { $('verified').checked = false; try { const card = JSON.parse($('card').value); $('fingerprint').textContent = /^[a-f0-9]{64}$/.test(card.id) ? card.id : 'Invalid fingerprint'; } catch { $('fingerprint').textContent = 'Invalid JSON card'; } };
$('approve').onclick = async () => {
  if (!$('verified').checked) return notice('Compare and confirm the entire fingerprint first.');
  const next = await call('contact', $('card').value, true);
  if (next) { render(next); $('contactDialog').close(); $('card').value = ''; }
};
$('copy').onclick = async () => { if (await call('card')) notice('Public contact card copied. Exchange it through an authenticated channel.'); };
$('settingsButton').onclick = () => { $('url').value = state.settings.url; $('caStatus').textContent = state.settings.customCA ? 'Private CA configured' : 'Using system certificate authorities'; $('settingsDialog').showModal(); };
$('chooseCA').onclick = async () => { if (await call('ca')) $('caStatus').textContent = 'Private CA selected; applies on Connect'; };
$('connect').onclick = async () => { const next = await call('connect', $('url').value); if (next) { render(next); $('settingsDialog').close(); } };
$('disconnect').onclick = async () => { const next = await call('disconnect'); if (next) render(next); };
$('compose').onsubmit = async event => {
  event.preventDefault(); const text = $('text').value.trim(); if (!selected || !text) return;
  $('send').disabled = true;
  const next = await call('send', selected, text);
  if (next) { $('text').value = ''; render(next); } else $('send').disabled = false;
};
$('text').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('compose').requestSubmit(); } };
window.stillroom.subscribe(render);
const initial = await call('state'); if (initial) render(initial);
