/* MAJOBELLA · Inicio de sesión con Google (Google Identity Services)
   Requiere un "ID de cliente de OAuth" de Google Cloud en config.google.clientId
   (tipo "Aplicación web", con el dominio de la web en "Orígenes autorizados de JavaScript").
   La web solo lee nombre, correo y foto para mostrarlos; el backend verifica el token
   antes de devolver o cambiar citas (ver backend/google-apps-script/Code.gs). */
(function (M) {
  const KEY = 'mjb.session.v1';
  const listeners = new Set();
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } },
    set(v) { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch (e) { /* sin almacenamiento */ } },
  };

  function decodeJwt(token) {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(part).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json);
  }

  M.Auth = {
    user: null,
    token: null,
    configured() { return !!(M.config.google && String(M.config.google.clientId || '').trim()); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach((fn) => fn(this.user)); },

    init() {
      const saved = store.get();
      if (saved && saved.exp * 1000 > Date.now()) { this.user = saved.user; this.token = saved.token; }
      if (!this.configured()) { this.emit(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = () => {
        google.accounts.id.initialize({
          client_id: M.config.google.clientId,
          callback: (resp) => this.handleCredential(resp.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
        });
        this.renderButtons();
      };
      s.onerror = () => { this.loadError = true; this.emit(); };
      document.head.appendChild(s);
      this.emit();
    },

    renderButtons() {
      if (!window.google || !google.accounts) return;
      document.querySelectorAll('[data-google-button]').forEach((el) => {
        if (this.user) { el.innerHTML = ''; return; }
        el.innerHTML = '';
        google.accounts.id.renderButton(el, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill',
          text: 'continue_with', locale: 'es', width: Math.min(320, el.clientWidth || 300),
        });
      });
    },

    handleCredential(credential) {
      const p = decodeJwt(credential);
      this.user = { name: p.name, firstName: p.given_name || (p.name || '').split(' ')[0], email: p.email, picture: p.picture, sub: p.sub };
      this.token = credential;
      store.set({ user: this.user, token: credential, exp: p.exp });
      this.emit();
    },

    signOut() {
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
      this.user = null; this.token = null; store.set(null);
      this.emit();
      setTimeout(() => this.renderButtons(), 0);
    },
  };
})(window.MJB);
