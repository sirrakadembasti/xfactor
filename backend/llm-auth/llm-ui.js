const $ = id => document.getElementById(id);
let catalog = [];
let profiles = [];
let activeId = null;

function message(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : 'success';
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const csrfHeaders = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { 'X-XFactor-CSRF': '1' };
  const response = await fetch(`/api/llm${path}`, { credentials: 'same-origin', ...options, headers: { 'content-type': 'application/json', ...csrfHeaders, ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function button(label, className, action) {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label; element.className = className;
  element.addEventListener('click', async () => {
    element.disabled = true;
    try { await action(); } catch (error) { message(error.message, true); } finally { element.disabled = false; }
  });
  return element;
}

function clearForm() {
  $('profile-form').reset(); $('profile-id').value = ''; $('api-key').required = true;
  $('provider').dispatchEvent(new Event('change'));
}

function lastTestText(profile) {
  if (!profile.lastTest) return 'Son test: Yapılmadı';
  const result = profile.lastTest.status === 'passed' ? 'Başarılı' : 'Başarısız';
  const at = new Date(profile.lastTest.at);
  return `Son test: ${result}${Number.isNaN(at.getTime()) ? '' : ` · ${at.toLocaleString('tr-TR')}`}`;
}

function render() {
  const active = profiles.find(profile => profile.id === activeId);
  $('active-summary').textContent = active
    ? `Etkin profil: ${active.name} · ${active.model}. ${lastTestText(active)}. Bu sonuç test anına aittir.`
    : 'Etkin profil yok. Manager ve ajanların kullanması için bir profili etkinleştirin.';
  const container = $('profiles'); container.replaceChildren();
  if (!profiles.length) { const empty = document.createElement('p'); empty.textContent = 'Henüz profil yok.'; container.append(empty); return; }
  for (const profile of profiles) {
    const isActive = profile.id === activeId;
    const card = document.createElement('div'); card.className = `card ${isActive ? 'active' : ''}`;
    const title = document.createElement('h3'); title.textContent = `${profile.name} · ${isActive ? 'Etkin' : 'Pasif'}`;
    const details = document.createElement('div'); details.className = 'muted'; details.textContent = `${profile.provider} · ${profile.model} · ${profile.baseURL} · Anahtar: ${profile.hasApiKey ? 'kayıtlı' : 'eksik'}`;
    const testStatus = document.createElement('p'); testStatus.className = 'muted'; testStatus.textContent = lastTestText(profile);
    const actions = document.createElement('div'); actions.className = 'actions';
    const activate = button(isActive ? 'Etkin' : 'Etkinleştir', '', async () => { await request(`/profiles/${profile.id}/activate`, { method: 'POST' }); await loadProfiles(); message(`${profile.name} etkin.`); });
    activate.disabled = isActive;
    actions.append(
      button('Düzenle', 'secondary', () => { $('profile-id').value = profile.id; $('name').value = profile.name; $('provider').value = profile.provider; $('base-url').value = profile.baseURL; $('model').value = profile.model; $('api-key').value = ''; $('api-key').required = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }),
      button('Bağlantıyı sına', 'secondary', async () => {
        try { const result = await request(`/profiles/${profile.id}/test`, { method: 'POST' }); message(result.message); }
        finally { await loadProfiles(); }
      }),
      button('Modelleri getir', 'secondary', async () => {
        const result = await request(`/profiles/${profile.id}/models`);
        const list = $('known-models'); list.replaceChildren();
        for (const model of result.models) { const option = document.createElement('option'); option.value = model; list.append(option); }
        $('model').focus();
        message(result.models.length ? `${result.models.length} model seçeneklere eklendi. Model alanından seçebilirsiniz.` : 'Model bulunamadı; kimliği elle girebilirsiniz.');
      }),
      activate,
      button('Sil', 'danger', async () => { if (!window.confirm(isActive ? `${profile.name} etkin profil. Silinirse etkin profil kalmayacak. Silinsin mi?` : `${profile.name} profili silinsin mi?`)) return; await request(`/profiles/${profile.id}`, { method: 'DELETE' }); await loadProfiles(); message('Profil silindi.'); })
    );
    card.append(title, details, testStatus, actions); container.append(card);
  }
}

async function loadProfiles() {
  const result = await request('/profiles'); profiles = result.profiles; activeId = result.activeId; render();
}

async function init() {
  const result = await request('/catalog'); catalog = result.providers;
  for (const provider of catalog) { const option = document.createElement('option'); option.value = provider.id; option.textContent = `${provider.name} (${provider.region})`; $('provider').append(option); }
  $('provider').addEventListener('change', () => {
    const provider = catalog.find(item => item.id === $('provider').value);
    const list = $('known-models'); list.replaceChildren();
    for (const model of provider?.models || []) { const option = document.createElement('option'); option.value = model; list.append(option); }
    $('base-url').value = provider?.baseURL || '';
    $('model').value = provider?.models?.[0] || '';
  });
  $('clear-form').addEventListener('click', clearForm);
  $('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = $('profile-id').value;
    const input = { name: $('name').value, provider: $('provider').value, model: $('model').value, baseURL: $('base-url').value, apiKey: $('api-key').value };
    try { await request(id ? `/profiles/${id}` : '/profiles', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) }); await loadProfiles(); clearForm(); message('Profil kaydedildi. Bağlantıyı sınayıp etkinleştirin.'); }
    catch (error) { message(error.message, true); }
  });
  clearForm(); await loadProfiles();
}
init().catch(error => message(error.message, true));
