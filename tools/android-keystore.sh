#!/usr/bin/env bash
# MAJOBELLA · Crea la llave para firmar las apps de Android y la guarda SOLO en los secretos de GitHub.
# Se corre una vez, en tu computadora, con Java (keytool) y GitHub CLI (gh auth login) instalados:
#   bash tools/android-keystore.sh
# La llave también queda en ~/majobella-android.keystore: guárdala en un lugar seguro (sin ella,
# las apps instaladas tendrían que desinstalarse para recibir versiones nuevas). No la subas al repositorio.
set -euo pipefail
REPO="${REPO:-AnthonyHenriquezLuciano/Majo_Bella}"
KS="$HOME/majobella-android.keystore"
if [ -e "$KS" ]; then echo "Ya existe $KS (no se reemplaza)."; else
  PASS="$(openssl rand -hex 24)"
  keytool -genkeypair -storetype JKS -keystore "$KS" -alias majobella -keyalg RSA -keysize 4096 -validity 36500 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=MAJOBELLA Beauty Studio, O=MAJOBELLA, L=Santo Domingo, C=DO"
  printf %s "$PASS" > "$KS.password"; chmod 600 "$KS" "$KS.password"
fi
PASS="$(cat "$KS.password")"
base64 < "$KS" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 -R "$REPO"
printf %s "$PASS" | gh secret set ANDROID_KEYSTORE_PASSWORD -R "$REPO"
printf %s "$PASS" | gh secret set ANDROID_KEY_PASSWORD -R "$REPO"
printf %s majobella | gh secret set ANDROID_KEY_ALIAS -R "$REPO"
echo "Listo: la llave está en los secretos de GitHub. Vuelve a correr Actions → Apps."
