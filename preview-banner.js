(async function () {
  try {
    const response = await fetch('/api/preview/context', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.active || !data.preview?.active) return;
    const banner = document.createElement('div');
    banner.className = 'owner-preview-banner';
    banner.innerHTML = `<span>👁️ مالكة الموقع في وضع المعاينة كدور: <strong>${String(data.preview.roleName || data.preview.roleCode)}</strong></span><button type="button">العودة إلى حساب المالك</button>`;
    document.body.prepend(banner);
    const button = banner.querySelector('button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'جارٍ إنهاء المعاينة...';
      const stop = await fetch('/api/preview/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: '{}',
      });
      const result = await stop.json().catch(() => ({}));
      location.href = result.redirect || '/owner/dashboard';
    });
  } catch (_) {}
})();
